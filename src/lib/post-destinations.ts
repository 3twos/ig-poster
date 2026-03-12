import type { PostDestinationRow, PostRow, PublishHistoryEntry } from "@/db/schema";

export type PostDestinationResource = {
  destination: "facebook" | "instagram";
  enabled: boolean;
  syncMode: "remote_authoritative" | "app_managed";
  desiredState:
    | "draft"
    | "scheduled"
    | "publishing"
    | "published"
    | "failed"
    | "canceled"
    | "out_of_sync";
  remoteState:
    | "draft"
    | "scheduled"
    | "publishing"
    | "published"
    | "failed"
    | "canceled"
    | "out_of_sync";
  caption: string | null;
  firstComment: string | null;
  locationId: string | null;
  userTags: PostDestinationRow["userTags"] | null;
  publishAt: string | null;
  remoteObjectId: string | null;
  remoteContainerId: string | null;
  remotePermalink: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
};

export type PostWithDestinations<TRow> = TRow & {
  destinations: PostDestinationResource[];
};

const DESTINATION_ORDER: Array<PostDestinationResource["destination"]> = [
  "facebook",
  "instagram",
];

const fallbackStateForPostStatus = (
  status: PostRow["status"],
): PostDestinationResource["desiredState"] =>
  status === "posted"
    ? "published"
    : status === "scheduled"
      ? "scheduled"
      : "draft";

const sortDestinations = (
  rows: PostDestinationResource[],
): PostDestinationResource[] =>
  [...rows].sort(
    (left, right) =>
      DESTINATION_ORDER.indexOf(left.destination) -
      DESTINATION_ORDER.indexOf(right.destination),
  );

const latestPublishHistoryEntry = (history: PublishHistoryEntry[] | null | undefined) =>
  [...(history ?? [])].sort((left, right) =>
    right.publishedAt.localeCompare(left.publishedAt),
  )[0];

export const toPostDestinationResource = (
  row: Pick<
    PostDestinationRow,
    | "destination"
    | "enabled"
    | "syncMode"
    | "desiredState"
    | "remoteState"
    | "caption"
    | "firstComment"
    | "locationId"
    | "userTags"
    | "publishAt"
    | "remoteObjectId"
    | "remoteContainerId"
    | "remotePermalink"
    | "lastSyncedAt"
    | "lastError"
  >,
): PostDestinationResource => ({
  destination: row.destination,
  enabled: row.enabled,
  syncMode: row.syncMode,
  desiredState: row.desiredState,
  remoteState: row.remoteState,
  caption: row.caption ?? null,
  firstComment: row.firstComment ?? null,
  locationId: row.locationId ?? null,
  userTags: row.userTags ?? null,
  publishAt: row.publishAt?.toISOString() ?? null,
  remoteObjectId: row.remoteObjectId ?? null,
  remoteContainerId: row.remoteContainerId ?? null,
  remotePermalink: row.remotePermalink ?? null,
  lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
  lastError: row.lastError ?? null,
});

export const buildFallbackPostDestinationResources = (
  row: Pick<PostRow, "status" | "publishSettings" | "publishHistory">,
): PostDestinationResource[] => {
  const state = fallbackStateForPostStatus(row.status);
  const latestPublish = latestPublishHistoryEntry(row.publishHistory);
  const publishSettings = row.publishSettings ?? null;

  return sortDestinations([
    {
      destination: "facebook",
      enabled: false,
      syncMode: "remote_authoritative",
      desiredState: state,
      remoteState: state,
      caption: publishSettings?.caption ?? null,
      firstComment: null,
      locationId: null,
      userTags: null,
      publishAt: null,
      remoteObjectId: null,
      remoteContainerId: null,
      remotePermalink: null,
      lastSyncedAt: null,
      lastError: null,
    },
    {
      destination: "instagram",
      enabled: true,
      syncMode: "app_managed",
      desiredState: state,
      remoteState: state,
      caption: publishSettings?.caption ?? null,
      firstComment: publishSettings?.firstComment ?? null,
      locationId: publishSettings?.locationId ?? null,
      userTags: null,
      publishAt: null,
      remoteObjectId: latestPublish?.igMediaId ?? null,
      remoteContainerId: null,
      remotePermalink: latestPublish?.igPermalink ?? null,
      lastSyncedAt: latestPublish?.publishedAt ?? null,
      lastError: null,
    },
  ]);
};

export const buildPostDestinationResources = (
  row: Pick<PostRow, "status" | "publishSettings" | "publishHistory">,
  storedDestinations?: Array<
    Pick<
      PostDestinationRow,
      | "destination"
      | "enabled"
      | "syncMode"
      | "desiredState"
      | "remoteState"
      | "caption"
      | "firstComment"
      | "locationId"
      | "userTags"
      | "publishAt"
      | "remoteObjectId"
      | "remoteContainerId"
      | "remotePermalink"
      | "lastSyncedAt"
      | "lastError"
    >
  >,
): PostDestinationResource[] => {
  if (storedDestinations && storedDestinations.length > 0) {
    const merged = new Map(
      buildFallbackPostDestinationResources(row).map((destination) => [
        destination.destination,
        destination,
      ]),
    );

    for (const destination of storedDestinations.map(toPostDestinationResource)) {
      merged.set(destination.destination, destination);
    }

    return sortDestinations([...merged.values()]);
  }

  return buildFallbackPostDestinationResources(row);
};

export const attachPostDestinations = <
  TRow extends Pick<PostRow, "status" | "publishSettings" | "publishHistory">,
>(
  row: TRow,
  storedDestinations?: Array<
    Pick<
      PostDestinationRow,
      | "destination"
      | "enabled"
      | "syncMode"
      | "desiredState"
      | "remoteState"
      | "caption"
      | "firstComment"
      | "locationId"
      | "userTags"
      | "publishAt"
      | "remoteObjectId"
      | "remoteContainerId"
      | "remotePermalink"
      | "lastSyncedAt"
      | "lastError"
    >
  >,
): PostWithDestinations<TRow> => ({
  ...row,
  destinations: buildPostDestinationResources(row, storedDestinations),
});
