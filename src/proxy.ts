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
  "/share/",
  "/_next/",
];

const PUBLIC_EXACT_PATHS = ["/favicon.ico"];

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

const buildCanonicalRedirect = (req: NextRequest) => {
  const runtimeDeploymentHost = normalizeHost(process.env.VERCEL_URL);
  if (!runtimeDeploymentHost) {
    return null;
  }

  const requestHost = req.nextUrl.hostname.toLowerCase();
  if (requestHost !== runtimeDeploymentHost) {
    return null;
  }

  const canonicalHost = getCanonicalHost();
  if (!canonicalHost || canonicalHost === requestHost) {
    return null;
  }

  const redirectUrl = req.nextUrl.clone();
  redirectUrl.protocol = "https:";
  redirectUrl.hostname = canonicalHost;
  redirectUrl.port = "";

  return NextResponse.redirect(redirectUrl, 307);
};

const hasPublicFileExtension = (pathname: string) =>
  /\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|map)$/i.test(pathname);

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

  if (isPublicPath(req.nextUrl.pathname)) {
    return NextResponse.next();
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
