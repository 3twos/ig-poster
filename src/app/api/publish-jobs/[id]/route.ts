import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { posts, publishJobs } from "@/db/schema";
import { apiErrorResponse } from "@/lib/api-error";
import { PublishJobUpdateRequestSchema } from "@/lib/meta-schemas";
import { appendPublishJobEvent, markPostScheduled } from "@/lib/publish-jobs";
import { hashEmail } from "@/lib/server-utils";
import { readWorkspaceSessionFromRequest } from "@/lib/workspace-auth";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const raceConflictResponse = () =>
  NextResponse.json(
    {
      error: "Publish job state changed concurrently. Refresh and try again.",
    },
    { status: 409 },
  );

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const session = await readWorkspaceSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;
    const ownerHash = hashEmail(session.email);
    const payload = PublishJobUpdateRequestSchema.parse(await req.json());
    const db = getDb();

    const [existing] = await db
      .select()
      .from(publishJobs)
      .where(and(eq(publishJobs.id, id), eq(publishJobs.ownerHash, ownerHash)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Publish job not found" }, { status: 404 });
    }

    if (payload.action === "cancel") {
      if (existing.status === "published" || existing.status === "canceled") {
        return NextResponse.json(
          { error: `Cannot cancel a ${existing.status} job.` },
          { status: 409 },
        );
      }
      if (existing.status === "processing") {
        return NextResponse.json(
          { error: "Cannot cancel a job that is currently processing." },
          { status: 409 },
        );
      }

      const [updated] = await db
        .update(publishJobs)
        .set({
          status: "canceled",
          canceledAt: new Date(),
          updatedAt: new Date(),
          events: appendPublishJobEvent(existing.events, {
            type: "canceled",
            detail: "Canceled by user.",
          }),
        })
        .where(and(eq(publishJobs.id, existing.id), eq(publishJobs.ownerHash, ownerHash)))
        .returning();

      if (!updated) {
        return raceConflictResponse();
      }

      if (existing.postId) {
        const [post] = await db
          .select({ result: posts.result })
          .from(posts)
          .where(and(eq(posts.id, existing.postId), eq(posts.ownerHash, ownerHash)))
          .limit(1);
        if (post) {
          await db
            .update(posts)
            .set({
              status: post.result ? "generated" : "draft",
              updatedAt: new Date(),
            })
            .where(and(eq(posts.id, existing.postId), eq(posts.ownerHash, ownerHash)));
        }
      }

      return NextResponse.json(updated);
    }

    if (existing.status === "published" || existing.status === "canceled") {
      return NextResponse.json(
        { error: `Cannot modify a ${existing.status} job.` },
        { status: 409 },
      );
    }
    if (existing.status === "processing") {
      return NextResponse.json(
        { error: "Cannot modify a job that is currently processing." },
        { status: 409 },
      );
    }

    if (payload.action === "retry-now") {
      if (existing.status !== "failed") {
        return NextResponse.json(
          { error: "Retry now is only available for failed jobs." },
          { status: 409 },
        );
      }

      const [updated] = await db
        .update(publishJobs)
        .set({
          status: "queued",
          publishAt: new Date(),
          attempts: 0,
          lastAttemptAt: null,
          completedAt: null,
          lastError: null,
          updatedAt: new Date(),
          events: appendPublishJobEvent(existing.events, {
            type: "updated",
            detail: "Retry requested by user.",
          }),
        })
        .where(and(eq(publishJobs.id, existing.id), eq(publishJobs.ownerHash, ownerHash)))
        .returning();

      if (!updated) {
        return raceConflictResponse();
      }

      if (existing.postId) {
        await markPostScheduled(db, ownerHash, existing.postId);
      }

      return NextResponse.json(updated);
    }

    if (payload.action === "reschedule") {
      const [updated] = await db
        .update(publishJobs)
        .set({
          status: "queued",
          publishAt: new Date(payload.publishAt),
          attempts: 0,
          lastAttemptAt: null,
          completedAt: null,
          lastError: null,
          updatedAt: new Date(),
          events: appendPublishJobEvent(existing.events, {
            type: "updated",
            detail: `Rescheduled to ${new Date(payload.publishAt).toISOString()}.`,
          }),
        })
        .where(and(eq(publishJobs.id, existing.id), eq(publishJobs.ownerHash, ownerHash)))
        .returning();

      if (!updated) {
        return raceConflictResponse();
      }

      if (existing.postId) {
        await markPostScheduled(db, ownerHash, existing.postId);
      }

      return NextResponse.json(updated);
    }

    const [updated] = await db
      .update(publishJobs)
      .set({
        status: "queued",
        caption: payload.caption ?? existing.caption,
        media: payload.media ?? existing.media,
        publishAt: payload.publishAt
          ? new Date(payload.publishAt)
          : existing.publishAt,
        outcomeContext:
          payload.outcomeContext !== undefined
            ? payload.outcomeContext
            : existing.outcomeContext,
        attempts: 0,
        lastAttemptAt: null,
        completedAt: null,
        lastError: null,
        updatedAt: new Date(),
        events: appendPublishJobEvent(existing.events, {
          type: "updated",
          detail: "Job details updated by user.",
        }),
      })
      .where(and(eq(publishJobs.id, existing.id), eq(publishJobs.ownerHash, ownerHash)))
      .returning();

    if (!updated) {
      return raceConflictResponse();
    }

    if (existing.postId) {
      await markPostScheduled(db, ownerHash, existing.postId);
    }

    return NextResponse.json(updated);
  } catch (error) {
    const isClientError = error instanceof z.ZodError;
    return apiErrorResponse(error, {
      fallback: "Could not update publish job",
      status: isClientError ? 400 : 500,
    });
  }
}
