import { createHmac, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-error";
import {
  handleFacebookPageWebhook,
  type FacebookPageWebhookPayload,
} from "@/services/facebook-page-webhooks";

export const runtime = "nodejs";

const getWebhookVerifyToken = () =>
  process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() ||
  process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN?.trim() ||
  "";

const getWebhookSignatureSecret = () =>
  process.env.META_APP_SECRET?.trim() ||
  process.env.FACEBOOK_APP_SECRET?.trim() ||
  "";

const verifyWebhookSignature = (
  rawBody: string,
  signatureHeader: string | null,
) => {
  const secret = getWebhookSignatureSecret();
  if (!secret) {
    return true;
  }

  if (!signatureHeader?.startsWith("sha256=")) {
    return false;
  }

  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const actualBuffer = Buffer.from(signatureHeader);
  const expectedBuffer = Buffer.from(expected);

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
};

export async function GET(req: Request) {
  const verifyToken = getWebhookVerifyToken();
  if (!verifyToken) {
    return NextResponse.json(
      { error: "META_WEBHOOK_VERIFY_TOKEN is not configured." },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode !== "subscribe" || token !== verifyToken || !challenge) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return new Response(challenge, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
    },
  });
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    if (!verifyWebhookSignature(rawBody, req.headers.get("x-hub-signature-256"))) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    let payload: FacebookPageWebhookPayload;
    try {
      payload = JSON.parse(rawBody) as FacebookPageWebhookPayload;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const result = await handleFacebookPageWebhook(payload);
    return NextResponse.json({ received: !result.ignored, result });
  } catch (error) {
    return apiErrorResponse(error, {
      fallback: "Could not process Facebook webhook",
    });
  }
}
