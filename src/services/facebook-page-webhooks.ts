import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { metaAccounts, type MetaAccountRow } from "@/db/schema";
import { getEnvMetaAuth } from "@/lib/meta";
import type { ResolvedMetaAuth } from "@/lib/meta-auth";
import { resolveMetaAuthForApi } from "@/services/meta-auth";
import { syncFacebookScheduledPublishJobs, type FacebookScheduledSyncResult } from "@/services/facebook-sync";

export type FacebookPageWebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    changes?: Array<{
      field?: string;
      value?: Record<string, unknown>;
    }>;
  }>;
};

type FacebookPageWebhookEntrySummary = {
  pageId: string;
  entryCount: number;
  latestEventAt: string | null;
  fields: string[];
};

export type FacebookPageWebhookResult = {
  ignored: boolean;
  receivedEntries: number;
  pageIds: string[];
  matchedAccounts: number;
  syncedAccounts: number;
  failures: number;
  unmatchedPageIds: string[];
};

const buildEntrySummaries = (
  payload: FacebookPageWebhookPayload,
): FacebookPageWebhookEntrySummary[] => {
  const summaries = new Map<string, FacebookPageWebhookEntrySummary>();

  for (const entry of payload.entry ?? []) {
    const pageId = entry.id?.trim();
    if (!pageId) {
      continue;
    }

    const existing = summaries.get(pageId) ?? {
      pageId,
      entryCount: 0,
      latestEventAt: null,
      fields: [],
    };
    existing.entryCount += 1;

    const fields = new Set(existing.fields);
    for (const change of entry.changes ?? []) {
      const field = change.field?.trim();
      if (field) {
        fields.add(field);
      }
    }
    existing.fields = [...fields];

    if (entry.time) {
      const nextEventAt = new Date(entry.time * 1000);
      if (!Number.isNaN(nextEventAt.getTime())) {
        const nextIso = nextEventAt.toISOString();
        if (!existing.latestEventAt || nextIso > existing.latestEventAt) {
          existing.latestEventAt = nextIso;
        }
      }
    }

    summaries.set(pageId, existing);
  }

  return [...summaries.values()];
};

const resolveMetaAuthForWebhookAccount = async (
  account: MetaAccountRow,
): Promise<ResolvedMetaAuth> => {
  if (account.connectionId) {
    return resolveMetaAuthForApi({
      connectionId: account.connectionId,
      ownerHash: account.ownerHash,
    });
  }

  if (account.authMode !== "env") {
    throw new Error("No Meta auth source is available for this webhook account.");
  }

  const envAuth = getEnvMetaAuth();
  if (!envAuth) {
    throw new Error("Meta env credentials are not configured.");
  }
  if (account.pageId?.trim() && envAuth.pageId?.trim() !== account.pageId.trim()) {
    throw new Error(
      `Meta env credentials target page ${envAuth.pageId ?? "unknown"}, not ${account.pageId}.`,
    );
  }

  return {
    source: "env",
    auth: envAuth,
    account: {
      accountKey: account.accountKey,
      pageId: account.pageId ?? undefined,
      pageName: account.pageName,
      instagramUserId: account.instagramUserId,
      instagramUsername: account.instagramUsername,
      tokenExpiresAt: account.tokenExpiresAt?.toISOString(),
      capabilities: account.capabilities ?? undefined,
    },
  };
};

const mergeWebhookState = (
  account: MetaAccountRow,
  summary: FacebookPageWebhookEntrySummary,
  syncResult: FacebookScheduledSyncResult | null,
  lastError: string | null,
) => {
  const existingState = (account.webhookState ?? {}) as Record<string, unknown>;
  const existingPageState =
    existingState.page &&
      typeof existingState.page === "object" &&
      !Array.isArray(existingState.page)
      ? existingState.page as Record<string, unknown>
      : {};

  return {
    ...existingState,
    page: {
      ...existingPageState,
      lastReceivedAt: new Date().toISOString(),
      lastPageId: summary.pageId,
      lastFields: summary.fields,
      lastEventAt: summary.latestEventAt,
      lastSyncResult: syncResult,
      lastSyncError: lastError,
    },
  };
};

const persistWebhookState = async (
  account: MetaAccountRow,
  summary: FacebookPageWebhookEntrySummary,
  syncResult: FacebookScheduledSyncResult | null,
  lastError: string | null,
) => {
  const db = getDb();
  await db
    .update(metaAccounts)
    .set({
      webhookState: mergeWebhookState(account, summary, syncResult, lastError),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(metaAccounts.id, account.id),
        eq(metaAccounts.ownerHash, account.ownerHash),
      ),
    );
};

export const handleFacebookPageWebhook = async (
  payload: FacebookPageWebhookPayload,
): Promise<FacebookPageWebhookResult> => {
  if (payload.object !== "page") {
    return {
      ignored: true,
      receivedEntries: 0,
      pageIds: [],
      matchedAccounts: 0,
      syncedAccounts: 0,
      failures: 0,
      unmatchedPageIds: [],
    };
  }

  const summaries = buildEntrySummaries(payload);
  if (summaries.length === 0) {
    return {
      ignored: false,
      receivedEntries: 0,
      pageIds: [],
      matchedAccounts: 0,
      syncedAccounts: 0,
      failures: 0,
      unmatchedPageIds: [],
    };
  }

  const pageIds = summaries.map((summary) => summary.pageId);
  const db = getDb();
  const accounts = await db
    .select()
    .from(metaAccounts)
    .where(inArray(metaAccounts.pageId, pageIds));

  const accountsByPageId = new Map<string, MetaAccountRow[]>();
  for (const account of accounts) {
    const pageId = account.pageId?.trim();
    if (!pageId) {
      continue;
    }

    const existing = accountsByPageId.get(pageId) ?? [];
    existing.push(account);
    accountsByPageId.set(pageId, existing);
  }

  let matchedAccounts = 0;
  let syncedAccounts = 0;
  let failures = 0;
  const unmatchedPageIds: string[] = [];

  for (const summary of summaries) {
    const pageAccounts = accountsByPageId.get(summary.pageId) ?? [];
    if (pageAccounts.length === 0) {
      unmatchedPageIds.push(summary.pageId);
      continue;
    }

    for (const account of pageAccounts) {
      matchedAccounts += 1;

      try {
        const resolvedAuth = await resolveMetaAuthForWebhookAccount(account);
        const syncResult = await syncFacebookScheduledPublishJobs(
          { ownerHash: account.ownerHash },
          resolvedAuth,
        );
        await persistWebhookState(account, summary, syncResult, null);
        syncedAccounts += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.warn(
          `[facebook-page-webhooks] Could not sync page ${summary.pageId} for owner ${account.ownerHash}: ${message}`,
        );
        await persistWebhookState(account, summary, null, message);
        failures += 1;
      }
    }
  }

  return {
    ignored: false,
    receivedEntries: payload.entry?.length ?? 0,
    pageIds,
    matchedAccounts,
    syncedAccounts,
    failures,
    unmatchedPageIds,
  };
};
