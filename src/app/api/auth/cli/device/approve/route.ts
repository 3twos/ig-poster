import { NextResponse } from "next/server";

import { sanitizeNextPath } from "@/lib/workspace-auth";
import { requireActorFromRequest } from "@/services/actors";
import { approveCliDeviceCode, CliAuthServiceError } from "@/services/auth/cli";

export const runtime = "nodejs";

const buildDevicePageUrl = (requestUrl: URL, userCode?: string | null) => {
  const pageUrl = new URL("/cli/device", requestUrl.origin);
  if (userCode) {
    pageUrl.searchParams.set("user_code", userCode);
  }

  return pageUrl;
};

export async function POST(req: Request) {
  const requestUrl = new URL(req.url);
  const formData = await req.formData();
  const userCode = formData.get("user_code")?.toString().trim() ?? "";
  const actor = await requireActorFromRequest(req);

  if (!actor) {
    const loginUrl = new URL("/api/auth/google/start", requestUrl.origin);
    loginUrl.searchParams.set(
      "next",
      sanitizeNextPath(
        `${buildDevicePageUrl(requestUrl, userCode).pathname}${buildDevicePageUrl(requestUrl, userCode).search}`,
      ),
    );
    return NextResponse.redirect(loginUrl);
  }

  try {
    const approved = await approveCliDeviceCode({
      actor,
      userCode,
    });
    const successUrl = buildDevicePageUrl(requestUrl, approved.userCode);
    successUrl.searchParams.set("status", "approved");
    return NextResponse.redirect(successUrl);
  } catch (error) {
    const errorUrl = buildDevicePageUrl(requestUrl, userCode);
    errorUrl.searchParams.set(
      "error",
      error instanceof CliAuthServiceError && error.status === 404
        ? "invalid_or_expired"
        : "failed",
    );
    return NextResponse.redirect(errorUrl);
  }
}
