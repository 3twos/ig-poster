import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-error";
import { deleteBlob, isBlobEnabled, listBlobs } from "@/lib/blob-store";
import { requireAppEncryptionSecret } from "@/lib/app-encryption";
import { getMetaConnection } from "@/lib/meta-auth";
import {
  getEnvMetaAuth,
  publishInstagramContent,
} from "@/lib/meta";
import { ScheduledJobSchema } from "@/lib/meta-schemas";
import { decryptString } from "@/lib/secure";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json(
        { error: "CRON_SECRET is not configured. Cron endpoint is disabled." },
        { status: 503 },
      );
    }
    const authorization = req.headers.get("authorization") ?? "";
    const expected = `Bearer ${cronSecret}`;
    const isValid =
      authorization.length === expected.length &&
      timingSafeEqual(Buffer.from(authorization), Buffer.from(expected));
    if (!isValid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isBlobEnabled()) {
      return NextResponse.json(
        { error: "Scheduling requires Blob storage (BLOB_READ_WRITE_TOKEN)." },
        { status: 503 },
      );
    }

    const blobs = await listBlobs("schedules/", 100);
    const now = Date.now();

    let published = 0;
    const errors: Array<{ id: string; detail: string }> = [];

    for (const blob of blobs) {
      const response = await fetch(blob.url, { cache: "no-store" });
      if (!response.ok) {
        errors.push({ id: blob.pathname, detail: `Failed to fetch blob (${response.status})` });
        continue;
      }

      let rawJson: unknown;
      try {
        rawJson = await response.json();
      } catch {
        errors.push({ id: blob.pathname, detail: "Blob is not valid JSON" });
        continue;
      }

      const parsed = ScheduledJobSchema.safeParse(rawJson);
      if (!parsed.success) {
        errors.push({ id: blob.pathname, detail: `Invalid schema: ${parsed.error.message}` });
        continue;
      }

      const publishAtMs = new Date(parsed.data.publishAt).getTime();
      if (publishAtMs > now) {
        continue;
      }

      try {
        let auth = parsed.data.authSource === "env" ? getEnvMetaAuth() : null;

        if (parsed.data.authSource === "oauth") {
          if (!parsed.data.connectionId) {
            throw new Error("Missing OAuth connectionId");
          }

          const connection = await getMetaConnection(parsed.data.connectionId);
          if (!connection) {
            throw new Error("OAuth connection no longer exists");
          }

          auth = {
            accessToken: decryptString(connection.encryptedAccessToken, requireAppEncryptionSecret("decrypting OAuth token")),
            instagramUserId: connection.instagramUserId,
            graphVersion: connection.graphVersion,
          };
        }

        if (!auth) {
          throw new Error(
            "No publishing credentials available. Configure OAuth or env credentials.",
          );
        }

        await publishInstagramContent(
          {
            ...parsed.data.media,
            caption: parsed.data.caption,
          },
          auth,
        );
        await deleteBlob(blob.url);
        published += 1;
      } catch (error) {
        errors.push({
          id: parsed.data.id,
          detail: error instanceof Error ? error.message : "Unknown publish failure",
        });
      }
    }

    return NextResponse.json({
      scanned: blobs.length,
      published,
      errorCount: errors.length,
      errors: errors.slice(0, 20),
      ranAt: new Date().toISOString(),
    });
  } catch (error) {
    return apiErrorResponse(error, { fallback: "Cron publish failed" });
  }
}
