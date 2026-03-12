import { randomUUID } from "node:crypto";

import { getDb } from "@/db";
import { metaAccounts } from "@/db/schema";
import type { ResolvedMetaAuth } from "@/lib/meta-auth";

const buildMetaAccountId = () => randomUUID().replace(/-/g, "").slice(0, 18);

const toTimestamp = (value?: string) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const upsertMetaAccountSnapshot = async (
  ownerHash: string,
  resolvedAuth: ResolvedMetaAuth,
) => {
  const accountKey = resolvedAuth.account.accountKey?.trim();
  if (!accountKey) {
    return null;
  }

  const now = new Date();
  const values = {
    ownerHash,
    connectionId: resolvedAuth.account.connectionId ?? null,
    authMode: resolvedAuth.source,
    accountKey,
    pageId: resolvedAuth.account.pageId ?? null,
    pageName: resolvedAuth.account.pageName ?? "",
    instagramUserId: resolvedAuth.account.instagramUserId,
    instagramUsername: resolvedAuth.account.instagramUsername ?? "",
    graphVersion: resolvedAuth.auth.graphVersion,
    tokenExpiresAt: toTimestamp(resolvedAuth.account.tokenExpiresAt),
    capabilities: resolvedAuth.account.capabilities,
    updatedAt: now,
  } as const;

  const db = getDb();
  const [row] = await db
    .insert(metaAccounts)
    .values({
      ...values,
      id: buildMetaAccountId(),
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [metaAccounts.ownerHash, metaAccounts.accountKey],
      set: values,
    })
    .returning();

  return row ?? null;
};

export const bestEffortUpsertMetaAccountSnapshot = async (
  ownerHash: string | undefined,
  resolvedAuth: ResolvedMetaAuth,
) => {
  if (!ownerHash?.trim()) {
    return null;
  }

  try {
    return await upsertMetaAccountSnapshot(ownerHash, resolvedAuth);
  } catch (error) {
    console.warn(
      "[meta-accounts] Could not persist Meta account snapshot:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
};
