import { NextResponse } from "next/server";

import { deleteBlob, isBlobEnabled, listBlobs } from "@/lib/blob-store";
import { getEncryptionSecret, getMetaConnection } from "@/lib/meta-auth";
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
    if (cronSecret) {
      const authorization = req.headers.get("authorization");
      if (authorization !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
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
        continue;
      }

      const parsed = ScheduledJobSchema.safeParse(await response.json());
      if (!parsed.success) {
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

          const secret = getEncryptionSecret();
          if (!secret) {
            throw new Error(
              "Missing APP_ENCRYPTION_SECRET or META_APP_SECRET for decrypting OAuth token",
            );
          }

          auth = {
            accessToken: decryptString(connection.encryptedAccessToken, secret),
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
      errors,
      ranAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Cron publish failed",
        detail: error instanceof Error ? error.message : "Unexpected error",
      },
      { status: 500 },
    );
  }
}
