import { NextRequest, NextResponse } from "next/server";

import {
  sanitizeNextPath,
  verifyWorkspaceSessionToken,
  WORKSPACE_SESSION_COOKIE,
} from "@/lib/workspace-auth";

const PUBLIC_PATH_PREFIXES = [
  "/api/auth/google/",
  "/api/auth/meta/",
  "/api/cron/publish",
  "/api/v1/auth/cli/",
  "/_next/",
];

const PUBLIC_EXACT_PATHS = ["/favicon.ico"];
const BEARER_AUTH_BYPASS_PREFIXES = [
  "/api/v1/assets",
  "/api/v1/auth/sessions",
  "/api/v1/auth/whoami",
  "/api/v1/brand-kits",
  "/api/v1/posts",
  "/api/v1/publish-jobs",
];

const MUTATING_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

const normalizeHost = (value: string | undefined) => {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(
      trimmed.includes("://") ? trimmed : `https://${trimmed}`,
    );

    // Accept only plain http(s) hosts (optional scheme) to avoid
    // interpreting malformed URL env vars as redirect targets.
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }

    if (parsed.username || parsed.password || parsed.port) {
      return null;
    }

    if (
      (parsed.pathname && parsed.pathname !== "/") ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }

    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
};

const getCanonicalHost = () => {
  if (process.env.VERCEL_ENV === "production") {
    return normalizeHost(
      process.env.WORKSPACE_AUTH_PRODUCTION_HOST ??
        process.env.VERCEL_PROJECT_PRODUCTION_URL,
    );
  }

  if (process.env.VERCEL_ENV === "preview") {
    return normalizeHost(
      process.env.WORKSPACE_AUTH_PREVIEW_HOST ?? process.env.VERCEL_BRANCH_URL,
    );
  }

  return null;
};

const RUNTIME_DEPLOYMENT_HOST = normalizeHost(process.env.VERCEL_URL);
const CANONICAL_HOST = getCanonicalHost();

const buildCanonicalRedirect = (req: NextRequest) => {
  if (!RUNTIME_DEPLOYMENT_HOST) {
    return null;
  }

  const requestHost = req.nextUrl.hostname.toLowerCase();
  if (requestHost !== RUNTIME_DEPLOYMENT_HOST) {
    return null;
  }

  if (!CANONICAL_HOST || CANONICAL_HOST === requestHost) {
    return null;
  }

  const redirectUrl = req.nextUrl.clone();
  redirectUrl.protocol = "https:";
  redirectUrl.hostname = CANONICAL_HOST;
  redirectUrl.port = "";

  return NextResponse.redirect(redirectUrl, 307);
};

const hasPublicFileExtension = (pathname: string) =>
  /\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|map)$/i.test(pathname);

const readBearerAuthorization = (req: NextRequest) => {
  const authorization = req.headers.get("authorization")?.trim();
  if (!authorization) {
    return null;
  }

  const [scheme, value] = authorization.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer") {
    return null;
  }

  const token = value?.trim();
  if (!token) {
    return null;
  }

  return token;
};

const isJwtLikeToken = (value: string) => {
  const parts = value.split(".");
  return parts.length === 3 && parts.every((part) => part.length > 0);
};

const isPublicPath = (pathname: string) => {
  if (PUBLIC_EXACT_PATHS.includes(pathname)) {
    return true;
  }

  if (PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return true;
  }

  return hasPublicFileExtension(pathname);
};

const buildUnauthorizedResponse = (req: NextRequest) => {
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const nextPath = sanitizeNextPath(
    `${req.nextUrl.pathname}${req.nextUrl.search}`,
  );
  const redirectUrl = req.nextUrl.clone();
  redirectUrl.pathname = "/api/auth/google/start";
  redirectUrl.search = `next=${encodeURIComponent(nextPath)}`;

  return NextResponse.redirect(redirectUrl);
};

export async function proxy(req: NextRequest) {
  const canonicalRedirect = buildCanonicalRedirect(req);
  if (canonicalRedirect) {
    return canonicalRedirect;
  }

  // CSRF defense: verify Origin matches host for mutating API requests
  if (
    req.nextUrl.pathname.startsWith("/api/") &&
    MUTATING_METHODS.has(req.method)
  ) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("host");
    if (origin && host) {
      try {
        const originHost = new URL(origin).host;
        if (originHost !== host) {
          return NextResponse.json(
            { error: "CSRF origin mismatch" },
            { status: 403 },
          );
        }
      } catch {
        return NextResponse.json(
          { error: "Invalid origin header" },
          { status: 403 },
        );
      }
    }
  }

  if (isPublicPath(req.nextUrl.pathname)) {
    return NextResponse.next();
  }

  if (
    BEARER_AUTH_BYPASS_PREFIXES.some((prefix) =>
      req.nextUrl.pathname === prefix ||
      req.nextUrl.pathname.startsWith(`${prefix}/`),
    )
  ) {
    const bearerToken = readBearerAuthorization(req);
    if (bearerToken && isJwtLikeToken(bearerToken)) {
      return NextResponse.next();
    }
  }

  const sessionToken = req.cookies.get(WORKSPACE_SESSION_COOKIE)?.value;
  if (!sessionToken) {
    return buildUnauthorizedResponse(req);
  }

  const session = await verifyWorkspaceSessionToken(sessionToken);
  if (!session) {
    return buildUnauthorizedResponse(req);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/:path*"],
};
