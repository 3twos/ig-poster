import { randomUUID, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { apiErrorResponse } from "@/lib/api-error";
import { isBlobEnabled, putJson } from "@/lib/blob-store";
import { requireAppEncryptionSecret } from "@/lib/app-encryption";
import { getMetaConnection } from "@/lib/meta-auth";
import {
  getFacebookPagePublishState,
  getEnvMetaAuth,
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
import {
  syncPublishedInstagramDestination,
  upsertPostDestinationRemoteState,
} from "@/services/post-destinations";
import { executePublishJob } from "@/services/publish-executor";

export const runtime = "nodejs";
const QUOTA_DEFER_MINUTES = 15;
const toErrorDetail = (error: unknown) =>
  error instanceof Error ? error.message : "Unknown error";

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
        const usageKey = `${job.ownerHash}:${job.destination}`;
        const usage = job.destination === "instagram"
          ? ownerUsage.get(usageKey) ??
            await getPublishWindowUsage(db, job.ownerHash, new Date(), job.destination)
          : null;
        if (usage) {
          ownerUsage.set(usageKey, usage);
        }

        if (usage && usage.remaining <= 0) {
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

        if (
          job.destination === "facebook" &&
          job.remoteAuthority === "remote_authoritative"
        ) {
          const remoteState = await getFacebookPagePublishState(
            {
              publishId: job.publishId ?? undefined,
              creationId: job.creationId ?? undefined,
            },
            auth,
          );

          if (!remoteState.isPublished) {
            const scheduledPublishAt = remoteState.scheduledPublishTime
              ? new Date(remoteState.scheduledPublishTime)
              : null;
            const nextSyncAt = new Date(
              Math.max(
                Date.now() + QUOTA_DEFER_MINUTES * 60 * 1000,
                scheduledPublishAt
                  ? scheduledPublishAt.getTime() + 60 * 1000
                  : 0,
              ),
            );
            const detail = remoteState.scheduledPublishTime
              ? `Waiting for Meta to publish scheduled Facebook post ${remoteState.remoteObjectId} (scheduled for ${remoteState.scheduledPublishTime}).`
              : `Waiting for Meta to publish scheduled Facebook post ${remoteState.remoteObjectId}.`;
            const updated = await deferProcessingPublishJob(
              db,
              job,
              nextSyncAt,
              detail,
            );
            if (job.postId) {
              try {
                await upsertPostDestinationRemoteState(db, {
                  postId: job.postId,
                  destination: "facebook",
                  enabled: true,
                  syncMode: job.remoteAuthority,
                  desiredState: "scheduled",
                  remoteState: "scheduled",
                  caption: job.caption,
                  publishAt: scheduledPublishAt ?? job.publishAt,
                  remoteObjectId:
                    remoteState.publishId ??
                    remoteState.remoteObjectId ??
                    job.publishId ??
                    job.creationId ??
                    null,
                  remoteContainerId:
                    remoteState.creationId ?? job.creationId ?? null,
                  remotePermalink: remoteState.remotePermalink ?? null,
                  remoteStatePayload: {
                    scheduledPublishTime:
                      remoteState.scheduledPublishTime ??
                      job.publishAt.toISOString(),
                  },
                  lastSyncedAt: new Date(),
                  lastError: null,
                });
              } catch (error) {
                errors.push({
                  id: job.id,
                  detail:
                    `Could not sync scheduled Facebook destination state: ${toErrorDetail(error)}`,
                });
              }
            }
            if (updated) {
              retried += 1;
              deferred += 1;
              continue;
            }
            errors.push({
              id: job.id,
              detail:
                "Could not defer remote-authoritative Facebook sync job (state changed concurrently).",
            });
            continue;
          }

          const completedJob = await completePublishJobSuccess(db, job, {
            publishId:
              remoteState.publishId ??
              job.publishId ??
              remoteState.remoteObjectId,
            creationId: remoteState.creationId ?? job.creationId ?? undefined,
            children: job.children ?? undefined,
          });
          if (!completedJob) {
            errors.push({
              id: job.id,
              detail:
                "Could not mark remote-authoritative Facebook sync job published (state changed concurrently).",
            });
            continue;
          }
          if (job.postId) {
            try {
              await markPostPublished(
                db,
                job.ownerHash,
                job.postId,
                remoteState.publishId ??
                  job.publishId ??
                  remoteState.remoteObjectId,
                job.destination,
              );
            } catch (error) {
              errors.push({
                id: job.id,
                detail:
                  `Remote Facebook publish succeeded, but the post snapshot could not be updated: ${toErrorDetail(error)}`,
              });
            }
            try {
              await upsertPostDestinationRemoteState(db, {
                postId: job.postId,
                destination: "facebook",
                enabled: true,
                syncMode: job.remoteAuthority,
                desiredState: "published",
                remoteState: "published",
                caption: job.caption,
                publishAt: job.publishAt,
                remoteObjectId:
                  remoteState.publishId ??
                  remoteState.remoteObjectId ??
                  job.publishId ??
                  job.creationId ??
                  null,
                remoteContainerId:
                  remoteState.creationId ?? job.creationId ?? null,
                remotePermalink: remoteState.remotePermalink ?? null,
                remoteStatePayload: {
                  scheduledPublishTime:
                    remoteState.scheduledPublishTime ??
                    job.publishAt.toISOString(),
                },
                lastSyncedAt: new Date(),
                lastError: null,
              });
            } catch (error) {
              errors.push({
                id: job.id,
                detail:
                  `Remote Facebook publish succeeded, but destination sync state could not be updated: ${toErrorDetail(error)}`,
              });
            }
          }
          if (
            isBlobEnabled() &&
            job.outcomeContext &&
            (remoteState.publishId ?? job.publishId ?? remoteState.remoteObjectId)
          ) {
            try {
              const outcomeId = randomUUID().replace(/-/g, "").slice(0, 18);
              const publishedAt = new Date().toISOString();
              await putJson(
                `outcomes/${job.ownerHash}/${Date.now()}-${outcomeId}.json`,
                {
                  id: outcomeId,
                  publishedAt,
                  publishId:
                    remoteState.publishId ??
                    job.publishId ??
                    remoteState.remoteObjectId,
                  postType: job.outcomeContext.postType,
                  caption: job.outcomeContext.caption,
                  hook: job.outcomeContext.hook,
                  hashtags: job.outcomeContext.hashtags,
                  variantName: job.outcomeContext.variantName,
                  brandName: job.outcomeContext.brandName,
                  score: job.outcomeContext.score,
                },
              );
            } catch {
              // Outcome recording is non-critical.
            }
          }
          published += 1;
          continue;
        }

        const { publish, firstCommentWarning } = await executePublishJob(
          job,
          auth,
        );

        await completePublishJobSuccess(db, job, {
          publishId: publish.publishId,
          creationId: publish.creationId,
          children: "children" in publish ? publish.children : undefined,
          warningDetail: firstCommentWarning,
        });
        if (usage) {
          usage.used += 1;
          usage.remaining = Math.max(usage.limit - usage.used, 0);
        }
        if (job.postId) {
          await markPostPublished(
            db,
            job.ownerHash,
            job.postId,
            publish.publishId,
            job.destination,
            {
              remotePermalink: publish.remotePermalink,
              publishedAt: publish.publishedAt,
            },
          );
          if (job.destination === "instagram") {
            await syncPublishedInstagramDestination(db, {
              postId: job.postId,
              caption: job.caption,
              firstComment: job.firstComment,
              locationId: job.locationId,
              userTags: job.userTags,
              remoteObjectId: publish.publishId ?? null,
              remoteContainerId: publish.creationId ?? null,
              remotePermalink: publish.remotePermalink ?? null,
              publishedAt: publish.publishedAt,
            });
          }
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
