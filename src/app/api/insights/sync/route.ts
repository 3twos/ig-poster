import { NextResponse } from "next/server";

import { isBlobEnabled, listBlobsPaginated, putJson } from "@/lib/blob-store";
import { PublishOutcomeSchema, type PublishOutcome } from "@/lib/creative";
import { getMediaInsights } from "@/lib/meta";
import { hashEmail } from "@/lib/server-utils";
import { readWorkspaceSessionFromRequest } from "@/lib/workspace-auth";
import { resolveMetaAuthForRequest } from "@/services/meta-auth";

export const runtime = "nodejs";

const MAX_SYNC_PER_CALL = 10;
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function POST(req: Request) {
  try {
    if (!isBlobEnabled()) {
      return NextResponse.json(
        { error: "Blob storage is not configured." },
        { status: 503 },
      );
    }

    const session = await readWorkspaceSessionFromRequest(req);
    if (!session) {
      return NextResponse.json(
        { error: "Workspace authentication required for insights sync." },
        { status: 401 },
      );
    }
    const emailHash = hashEmail(session.email);
    const resolvedAuth = await resolveMetaAuthForRequest(req, {
      ownerHash: emailHash,
    });

    const blobs = await listBlobsPaginated(`outcomes/${emailHash}/`, {
      pageSize: 500,
      maxResults: 2000,
    });
    const now = Date.now();

    let synced = 0;
    const errors: Array<{ id: string; detail: string }> = [];

    for (const blob of blobs) {
      if (synced >= MAX_SYNC_PER_CALL) {
        break;
      }

      let outcome: PublishOutcome;
      try {
        const response = await fetch(blob.url, { cache: "no-store" });
        if (!response.ok) {
          continue;
        }

        const raw = await response.json();
        outcome = PublishOutcomeSchema.parse(raw);
      } catch {
        continue;
      }

      if (!outcome.publishId) {
        continue;
      }

      // Skip if insights are fresh
      if (outcome.insights?.fetchedAt) {
        const fetchedAt = new Date(outcome.insights.fetchedAt).getTime();
        if (now - fetchedAt < STALE_THRESHOLD_MS) {
          continue;
        }
      }

      const insights = await getMediaInsights(outcome.publishId, resolvedAuth.auth);
      if (!insights) {
        errors.push({ id: outcome.id, detail: "Could not fetch insights" });
        continue;
      }

      const updated: PublishOutcome = {
        ...outcome,
        insights: {
          ...insights,
          fetchedAt: new Date().toISOString(),
        },
      };

      await putJson(blob.pathname, updated);
      synced += 1;
    }

    return NextResponse.json({
      synced,
      scanned: blobs.length,
      errorCount: errors.length,
      errors: errors.slice(0, 10),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Insights sync failed",
        detail: error instanceof Error ? error.message : "Unexpected error",
      },
      { status: 502 },
    );
  }
}
