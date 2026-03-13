export const APPLE_PHOTOS_COMPANION_APP_NAME = "IG Poster Companion";
export const APPLE_PHOTOS_COMPANION_URL_SCHEME = "igposter-companion";
export const APPLE_PHOTOS_BRIDGE_VERSION = "v1";
export const APPLE_PHOTOS_BRIDGE_HOST = "127.0.0.1";
export const APPLE_PHOTOS_BRIDGE_PORT = 43123;
export const APPLE_PHOTOS_BRIDGE_TOKEN_HEADER = "X-IG-Poster-Bridge-Token";
export const APPLE_PHOTOS_BRIDGE_ORIGIN = `http://${APPLE_PHOTOS_BRIDGE_HOST}:${APPLE_PHOTOS_BRIDGE_PORT}`;
export const APPLE_PHOTOS_BRIDGE_BASE_PATH = `/${APPLE_PHOTOS_BRIDGE_VERSION}`;

export const APPLE_PHOTOS_BRIDGE_PATHS = {
  health: `${APPLE_PHOTOS_BRIDGE_BASE_PATH}/health`,
  recent: `${APPLE_PHOTOS_BRIDGE_BASE_PATH}/photos/recent`,
  search: `${APPLE_PHOTOS_BRIDGE_BASE_PATH}/photos/search`,
  pick: `${APPLE_PHOTOS_BRIDGE_BASE_PATH}/photos/pick`,
  import: `${APPLE_PHOTOS_BRIDGE_BASE_PATH}/photos/import`,
  openCompanion: `${APPLE_PHOTOS_BRIDGE_BASE_PATH}/companion/open`,
} as const;

export type ApplePhotosBridgeErrorCode =
  | "UNSUPPORTED_PLATFORM"
  | "MACOS_COMPANION_REQUIRED"
  | "MACOS_BRIDGE_UNAVAILABLE"
  | "PHOTOS_PERMISSION_REQUIRED";

export type ApplePhotosMediaType = "image" | "video" | "live-photo";

export type ApplePhotosBridgeCapability =
  | "pick"
  | "recent"
  | "search"
  | "import";

export type ApplePhotosBridgePhotoAsset = {
  id: string;
  filename: string;
  mediaType: ApplePhotosMediaType;
  createdAt: string;
  width?: number;
  height?: number;
  durationMs?: number;
  favorite: boolean;
  albumNames: string[];
};

export type ApplePhotosImportedAsset = ApplePhotosBridgePhotoAsset & {
  exportPath: string;
  downloadUrl: string;
};

export type ApplePhotosCompanionAppInfo = {
  installed: boolean;
  bundlePath?: string;
};

export type ApplePhotosBridgeQueryMode = "recent" | "search";

export type ApplePhotosAssetQuery = {
  mode: ApplePhotosBridgeQueryMode;
  since?: string;
  limit: number;
  album?: string;
  mediaType?: ApplePhotosMediaType;
  favorite?: boolean;
};

export type ApplePhotosAssetListResponse = {
  assets: ApplePhotosBridgePhotoAsset[];
  fetchedAt: string;
  query: ApplePhotosAssetQuery;
};

export type ApplePhotosCompanionLaunchAction = "open" | "pick";

export type ApplePhotosBridgeSelectionSummary = {
  updatedAt: string;
  action?: ApplePhotosCompanionLaunchAction;
  draftId?: string;
  profile?: string;
  assetCount: number;
};

export type ApplePhotosBridgeHealthResponse = {
  appName: string;
  version: string;
  bridge: {
    origin: string;
    authTokenHeader: string;
    healthUrl: string;
    recentUrl: string;
    searchUrl: string;
    pickUrl: string;
    importUrl: string;
    openCompanionUrl?: string;
  };
  capabilities: ApplePhotosBridgeCapability[];
  companionApp?: ApplePhotosCompanionAppInfo;
  selection?: ApplePhotosBridgeSelectionSummary;
};

export type ApplePhotosPickRequest = {
  returnTo?: string;
  draftId?: string;
  profile?: string;
};

export type ApplePhotosPickResponse = {
  assets: ApplePhotosImportedAsset[];
  importedAt: string;
};

export type ApplePhotosImportRequest = {
  ids: string[];
  destinationFolder?: string;
};

export type ApplePhotosImportResponse = {
  assets: ApplePhotosImportedAsset[];
  importedAt: string;
};

export type ApplePhotosBridgeUrls = {
  origin: string;
  healthUrl: string;
  recentUrl: string;
  searchUrl: string;
  pickUrl: string;
  importUrl: string;
  openCompanionUrl: string;
};

export type ApplePhotosCompanionOpenRequest = {
  action?: ApplePhotosCompanionLaunchAction;
  returnTo?: string;
  draftId?: string;
  profile?: string;
};

export type ApplePhotosCompanionOpenResponse = {
  launchedAt: string;
  launchUrl: string;
  companionApp: ApplePhotosCompanionAppInfo;
};

export type ApplePhotosCompanionLaunchRequest = {
  action: ApplePhotosCompanionLaunchAction;
  returnTo?: string;
  draftId?: string;
  profile?: string;
  bridgeOrigin?: string;
};

const trimTrailingSlash = (value: string) =>
  value.endsWith("/") ? value.slice(0, -1) : value;

const trimPathSlashes = (value: string) => value.replace(/^\/+|\/+$/g, "");

const normalizeOptionalString = (value: string | null) =>
  value && value.length > 0 ? value : undefined;

export const getApplePhotosBridgeUrls = (
  origin = APPLE_PHOTOS_BRIDGE_ORIGIN,
): ApplePhotosBridgeUrls => {
  const normalizedOrigin = trimTrailingSlash(origin);

  return {
    origin: normalizedOrigin,
    healthUrl: `${normalizedOrigin}${APPLE_PHOTOS_BRIDGE_PATHS.health}`,
    recentUrl: `${normalizedOrigin}${APPLE_PHOTOS_BRIDGE_PATHS.recent}`,
    searchUrl: `${normalizedOrigin}${APPLE_PHOTOS_BRIDGE_PATHS.search}`,
    pickUrl: `${normalizedOrigin}${APPLE_PHOTOS_BRIDGE_PATHS.pick}`,
    importUrl: `${normalizedOrigin}${APPLE_PHOTOS_BRIDGE_PATHS.import}`,
    openCompanionUrl: `${normalizedOrigin}${APPLE_PHOTOS_BRIDGE_PATHS.openCompanion}`,
  };
};

export const buildApplePhotosBridgeHealthResponse =
  (
    options: {
      companionApp?: ApplePhotosCompanionAppInfo;
      selection?: ApplePhotosBridgeSelectionSummary;
    } = {},
  ): ApplePhotosBridgeHealthResponse => {
    const urls = getApplePhotosBridgeUrls();

    return {
      appName: APPLE_PHOTOS_COMPANION_APP_NAME,
      version: APPLE_PHOTOS_BRIDGE_VERSION,
      bridge: {
        origin: urls.origin,
        authTokenHeader: APPLE_PHOTOS_BRIDGE_TOKEN_HEADER,
        healthUrl: urls.healthUrl,
        recentUrl: urls.recentUrl,
        searchUrl: urls.searchUrl,
        pickUrl: urls.pickUrl,
        importUrl: urls.importUrl,
        openCompanionUrl: urls.openCompanionUrl,
      },
      capabilities: ["pick", "recent", "search", "import"],
      companionApp: options.companionApp ?? { installed: false },
      ...(options.selection ? { selection: options.selection } : {}),
    };
  };

export const buildApplePhotosCompanionLaunchUrl = (
  action: ApplePhotosCompanionLaunchAction,
  options: {
    returnTo?: string;
    draftId?: string;
    profile?: string;
    bridgeOrigin?: string;
  } = {},
) => {
  const url = new URL(
    `${APPLE_PHOTOS_COMPANION_URL_SCHEME}://photos/${action}`,
  );

  if (options.returnTo) {
    url.searchParams.set("return_to", options.returnTo);
  }
  if (options.draftId) {
    url.searchParams.set("draft_id", options.draftId);
  }
  if (options.profile) {
    url.searchParams.set("profile", options.profile);
  }
  if (options.bridgeOrigin) {
    url.searchParams.set("bridge_origin", trimTrailingSlash(options.bridgeOrigin));
  }

  return url.toString();
};

export const parseApplePhotosCompanionLaunchUrl = (
  value: string | URL,
): ApplePhotosCompanionLaunchRequest | null => {
  let url: URL;

  try {
    url = value instanceof URL ? value : new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== `${APPLE_PHOTOS_COMPANION_URL_SCHEME}:`) {
    return null;
  }

  if (url.hostname !== "photos") {
    return null;
  }

  const action = trimPathSlashes(url.pathname);
  if (action !== "open" && action !== "pick") {
    return null;
  }

  const bridgeOrigin = normalizeOptionalString(
    url.searchParams.get("bridge_origin"),
  );

  return {
    action,
    returnTo: normalizeOptionalString(url.searchParams.get("return_to")),
    draftId: normalizeOptionalString(url.searchParams.get("draft_id")),
    profile: normalizeOptionalString(url.searchParams.get("profile")),
    bridgeOrigin: bridgeOrigin ? trimTrailingSlash(bridgeOrigin) : undefined,
  };
};
