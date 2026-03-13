export const META_DESTINATIONS = ["facebook", "instagram"] as const;

export type MetaDestination = (typeof META_DESTINATIONS)[number];

export type MetaSyncMode = "remote_authoritative" | "app_managed";
export type MetaSourceOfTruth = "meta" | "app";

export type MetaDestinationCapability = {
  destination: MetaDestination;
  publishEnabled: boolean;
  syncMode: MetaSyncMode;
  sourceOfTruth: MetaSourceOfTruth;
};

export type MetaDestinationCapabilities = Record<
  MetaDestination,
  MetaDestinationCapability
>;

type MetaCapabilityInput = {
  pageId?: string | null;
  instagramUserId?: string | null;
  facebookPublishEnabled?: boolean | null;
};

export const buildMetaAccountKey = (
  input: MetaCapabilityInput,
): string | undefined => {
  const instagramUserId = input.instagramUserId?.trim();
  if (!instagramUserId) {
    return undefined;
  }

  const pageId = input.pageId?.trim();
  return pageId ? `${pageId}:${instagramUserId}` : instagramUserId;
};

export const buildMetaDestinationCapabilities = (
  input: MetaCapabilityInput,
): MetaDestinationCapabilities => ({
  facebook: {
    destination: "facebook",
    publishEnabled: Boolean(
      input.pageId?.trim() && (input.facebookPublishEnabled ?? true),
    ),
    syncMode: "remote_authoritative",
    sourceOfTruth: "meta",
  },
  instagram: {
    destination: "instagram",
    publishEnabled: Boolean(input.instagramUserId?.trim()),
    syncMode: "app_managed",
    sourceOfTruth: "app",
  },
});
