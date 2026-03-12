import { randomUUID, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { apiErrorResponse } from "@/lib/api-error";
import { isBlobEnabled, putJson } from "@/lib/blob-store";
import { requireAppEncryptionSecret } from "@/lib/app-encryption";
import { getMetaConnection } from "@/lib/meta-auth";
import {
  getEnvMetaAuth,
  publishInstagramContent,
  publishInstagramFirstComment,
} from "@/lib/meta";
import {
  claimDuePublishJobs,
  completePublishJobFailure,
  completePublishJobSuccess,
  deferProcessingPublishJob,
  getPublishWindowUsage,
  markPostPublished,
  recoverStaleProcessingJobs,
} from "@/lib/publish-jobs";
import { decryptString } from "@/lib/secure";

export const runtime = "nodejs";
const QUOTA_DEFER_MINUTES = 15;

export async function GET(req: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json(
        { error: "CRON_SECRET is not configured. Cron endpoint is disabled." },
        { status: 503 },
      );
    }
    const authBuf = Buffer.from(req.headers.get("authorization") ?? "");
    const expectedBuf = Buffer.from(`Bearer ${cronSecret}`);
    const isValid =
      authBuf.length === expectedBuf.length &&
      timingSafeEqual(authBuf, expectedBuf);
    if (!isValid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();
    const staleRecovered = await recoverStaleProcessingJobs(db, new Date(), {
      limit: 100,
    });
    const claimed = await claimDuePublishJobs(db, new Date(), 100);

    let published = 0;
    let retried = 0;
    let failed = 0;
    let deferred = 0;
    const errors: Array<{ id: string; detail: string }> = [];
    const ownerUsage = new Map<string, Awaited<ReturnType<typeof getPublishWindowUsage>>>();

    for (const job of claimed) {
      try {
        const usage = ownerUsage.get(job.ownerHash) ??
          await getPublishWindowUsage(db, job.ownerHash);
        ownerUsage.set(job.ownerHash, usage);

        if (usage.remaining <= 0) {
          const detail =
            `Deferred by publish window limit (${usage.used}/${usage.limit} in last 24h).`;
          const deferTo = new Date(Date.now() + QUOTA_DEFER_MINUTES * 60 * 1000);
          const updated = await deferProcessingPublishJob(
            db,
            job,
            deferTo,
            detail,
          );
          if (updated) {
            retried += 1;
            deferred += 1;
            continue;
          }
          errors.push({
            id: job.id,
            detail: "Could not defer publish job after quota check (state changed concurrently).",
          });
          continue;
        }

        let auth = job.authSource === "env" ? getEnvMetaAuth() : null;

        if (job.authSource === "oauth") {
          if (!job.connectionId) {
            throw new Error("Missing OAuth connectionId");
          }

          const connection = await getMetaConnection(job.connectionId);
          if (!connection) {
            throw new Error("OAuth connection no longer exists");
          }

          auth = {
            accessToken: decryptString(connection.encryptedAccessToken, requireAppEncryptionSecret("decrypting OAuth token")),
            instagramUserId: connection.instagramUserId,
            pageId: connection.pageId,
            graphVersion: connection.graphVersion,
          };
        }

        if (!auth) {
          throw new Error(
            "No publishing credentials available. Configure OAuth or env credentials.",
          );
        }

        const publish = await publishInstagramContent(
          {
            ...job.media,
            caption: job.caption,
            locationId: job.locationId ?? undefined,
            userTags: job.userTags ?? undefined,
          },
          auth,
        );

        let firstCommentWarning: string | undefined;
        if (job.firstComment) {
          if (!publish.publishId) {
            firstCommentWarning =
              "Published media id unavailable; could not post first comment.";
          } else {
            try {
              await publishInstagramFirstComment(
                publish.publishId,
                job.firstComment,
                auth,
              );
            } catch (error) {
              firstCommentWarning = error instanceof Error
                ? error.message
                : "Could not post first comment.";
            }
          }
        }

        await completePublishJobSuccess(db, job, {
          publishId: publish.publishId,
          creationId: publish.creationId,
          children: "children" in publish ? publish.children : undefined,
          warningDetail: firstCommentWarning,
        });
        usage.used += 1;
        usage.remaining = Math.max(usage.limit - usage.used, 0);
        if (job.postId) {
          await markPostPublished(db, job.ownerHash, job.postId, publish.publishId);
        }
        if (isBlobEnabled() && job.outcomeContext && publish.publishId) {
          try {
            const outcomeId = randomUUID().replace(/-/g, "").slice(0, 18);
            const publishedAt = new Date().toISOString();
            await putJson(`outcomes/${job.ownerHash}/${Date.now()}-${outcomeId}.json`, {
              id: outcomeId,
              publishedAt,
              publishId: publish.publishId,
              postType: job.outcomeContext.postType,
              caption: job.outcomeContext.caption,
              hook: job.outcomeContext.hook,
              hashtags: job.outcomeContext.hashtags,
              variantName: job.outcomeContext.variantName,
              brandName: job.outcomeContext.brandName,
              score: job.outcomeContext.score,
            });
          } catch {
            // Outcome recording is non-critical
          }
        }
        published += 1;
      } catch (error) {
        const detail = error instanceof Error ? error.message : "Unknown publish failure";
        const updated = await completePublishJobFailure(db, job, detail);
        if (updated?.status === "queued") {
          retried += 1;
        } else {
          failed += 1;
        }
        errors.push({
          id: job.id,
          detail,
        });
      }
    }

    return NextResponse.json({
      staleFailed: staleRecovered.length,
      claimed: claimed.length,
      published,
      retried,
      failed,
      deferred,
      errorCount: errors.length,
      errors: errors.slice(0, 20),
      ranAt: new Date().toISOString(),
    });
  } catch (error) {
    return apiErrorResponse(error, { fallback: "Cron publish failed" });
  }
}
