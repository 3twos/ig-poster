import {
  type ApplePhotosAssetListResponse,
  type ApplePhotosAssetQuery,
  type ApplePhotosCompanionOpenResponse,
  type ApplePhotosBridgeErrorCode,
  buildApplePhotosCompanionLaunchUrl,
  getApplePhotosBridgeUrls,
  type ApplePhotosImportedAsset,
  type ApplePhotosBridgeHealthResponse,
  type ApplePhotosImportResponse,
  type ApplePhotosPickResponse,
} from "@/lib/apple-photos-bridge";

export type ApplePhotosFallbackInfo = {
  code:
    | "MACOS_COMPANION_REQUIRED"
    | "MACOS_BRIDGE_UNAVAILABLE"
    | "UNSUPPORTED_PLATFORM";
  title: string;
  description: string;
  actionLabel: string;
  installHint?: string;
};

export type ApplePhotosBridgeProbeResult =
  | {
      available: true;
      health: ApplePhotosBridgeHealthResponse;
      launchUrl: string;
    }
  | {
      available: false;
      code: "MACOS_BRIDGE_UNAVAILABLE";
      message: string;
    };

export type ApplePhotosBridgeImportResult = {
  importedAt: string;
  assets: ApplePhotosImportedAsset[];
  files: File[];
};

export class ApplePhotosBridgeRequestError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApplePhotosBridgeRequestError";
    this.status = status;
    this.code = code;
  }
}

export const APPLE_PHOTOS_BRIDGE_PROBE_TIMEOUT_MS = 1_500;

export const isMacOsUserAgent = (userAgent: string) =>
  /(Macintosh|Mac OS X)/i.test(userAgent) && !/(iPhone|iPad|iPod)/i.test(userAgent);

export const getApplePhotosFallbackInfo = (
  userAgent: string,
  code:
    | "MACOS_BRIDGE_UNAVAILABLE"
    | "MACOS_COMPANION_REQUIRED" = "MACOS_COMPANION_REQUIRED",
): ApplePhotosFallbackInfo => {
  if (isMacOsUserAgent(userAgent)) {
    if (code === "MACOS_BRIDGE_UNAVAILABLE") {
      return {
        code,
        title: "Bridge not running",
        description:
          `The companion bridge is not responding on this Mac. If you've already installed it, the LaunchAgent may need a restart. Otherwise, install with one command.`,
        actionLabel: "Use regular upload",
        installHint: "npm run companion:install",
      };
    }

    return {
      code,
      title: "Install the Photos companion",
      description:
        `Import photos directly from your Apple Photos library. Run one command in Terminal to build, install, and auto-start the companion bridge.`,
      actionLabel: "Use regular upload",
      installHint: "npm run companion:install",
    };
  }

  return {
    code: "UNSUPPORTED_PLATFORM",
    title: "Apple Photos import requires macOS",
    description:
      `Apple Photos import uses a native macOS companion app. On this device, use the regular upload flow.`,
    actionLabel: "Use regular upload",
  };
};

const isApplePhotosBridgeHealthResponse = (
  value: unknown,
): value is ApplePhotosBridgeHealthResponse => {
  if (!value || typeof value !== "object") return false;

  const candidate = value as ApplePhotosBridgeHealthResponse;
  return (
    typeof candidate.appName === "string" &&
    typeof candidate.version === "string" &&
    typeof candidate.bridge?.origin === "string" &&
    typeof candidate.bridge?.healthUrl === "string" &&
    (typeof candidate.bridge?.openCompanionUrl === "undefined" ||
      typeof candidate.bridge?.openCompanionUrl === "string") &&
    (!candidate.companionApp ||
      (typeof candidate.companionApp.installed === "boolean" &&
        (typeof candidate.companionApp.bundlePath === "undefined" ||
          typeof candidate.companionApp.bundlePath === "string"))) &&
    Array.isArray(candidate.capabilities)
  );
};

const isApplePhotosImportedAsset = (
  value: unknown,
): value is ApplePhotosImportedAsset => {
  if (!value || typeof value !== "object") return false;

  const candidate = value as ApplePhotosImportedAsset;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.filename === "string" &&
    typeof candidate.mediaType === "string" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.favorite === "boolean" &&
    Array.isArray(candidate.albumNames) &&
    typeof candidate.exportPath === "string" &&
    typeof candidate.downloadUrl === "string"
  );
};

const isApplePhotosBridgePhotoAsset = (
  value: unknown,
): value is ApplePhotosAssetListResponse["assets"][number] => {
  if (!value || typeof value !== "object") return false;

  const candidate = value as ApplePhotosAssetListResponse["assets"][number];
  return (
    typeof candidate.id === "string" &&
    typeof candidate.filename === "string" &&
    typeof candidate.mediaType === "string" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.favorite === "boolean" &&
    Array.isArray(candidate.albumNames) &&
    candidate.albumNames.every((name) => typeof name === "string")
  );
};

const isApplePhotosAssetListResponse = (
  value: unknown,
): value is ApplePhotosAssetListResponse => {
  if (!value || typeof value !== "object") return false;

  const candidate = value as ApplePhotosAssetListResponse;
  return (
    Array.isArray(candidate.assets) &&
    candidate.assets.every(isApplePhotosBridgePhotoAsset) &&
    typeof candidate.fetchedAt === "string" &&
    Boolean(candidate.query) &&
    typeof candidate.query.mode === "string" &&
    typeof candidate.query.limit === "number"
  );
};

const isApplePhotosPickResponse = (
  value: unknown,
): value is ApplePhotosPickResponse | ApplePhotosImportResponse => {
  if (!value || typeof value !== "object") return false;

  const candidate = value as ApplePhotosPickResponse | ApplePhotosImportResponse;
  return (
    typeof candidate.importedAt === "string" &&
    Array.isArray(candidate.assets) &&
    candidate.assets.every(isApplePhotosImportedAsset)
  );
};

const isApplePhotosCompanionOpenResponse = (
  value: unknown,
): value is ApplePhotosCompanionOpenResponse => {
  if (!value || typeof value !== "object") return false;

  const candidate = value as ApplePhotosCompanionOpenResponse;
  const companionApp = candidate.companionApp;
  return (
    typeof candidate.launchedAt === "string" &&
    typeof candidate.launchUrl === "string" &&
    !!companionApp &&
    typeof companionApp.installed === "boolean" &&
    (typeof companionApp.bundlePath === "undefined" ||
      typeof companionApp.bundlePath === "string")
  );
};

const defaultMimeTypeForAsset = (asset: ApplePhotosImportedAsset) => {
  if (asset.mediaType === "video") {
    return "video/quicktime";
  }

  return "image/jpeg";
};

const buildQueryString = (
  query: Partial<Omit<ApplePhotosAssetQuery, "mode">>,
) => {
  const search = new URLSearchParams();

  if (query.since) {
    search.set("since", query.since);
  }
  if (typeof query.limit === "number") {
    search.set("limit", String(query.limit));
  }
  if (query.album) {
    search.set("album", query.album);
  }
  if (query.mediaType) {
    search.set("media", query.mediaType);
  }
  if (typeof query.favorite === "boolean") {
    search.set("favorite", String(query.favorite));
  }

  return search;
};

const readBridgeError = async (response: Response) => {
  const raw = await response.text();

  if (!raw) {
    return new ApplePhotosBridgeRequestError(
      "The local Apple Photos bridge returned an empty error response.",
      response.status,
    );
  }

  try {
    const payload = JSON.parse(raw) as {
      error?: string;
      message?: string;
      ok?: boolean;
    };

    return new ApplePhotosBridgeRequestError(
      payload.message || "The local Apple Photos bridge request failed.",
      response.status,
      typeof payload.error === "string"
        ? (payload.error as ApplePhotosBridgeErrorCode | string)
        : undefined,
    );
  } catch {
    return new ApplePhotosBridgeRequestError(raw, response.status);
  }
};

const requestApplePhotosAssetList = async ({
  fetchImpl = fetch,
  bridgeOrigin,
  endpoint,
  query,
}: {
  fetchImpl?: typeof fetch;
  bridgeOrigin?: string;
  endpoint: "recentUrl" | "searchUrl";
  query: Partial<Omit<ApplePhotosAssetQuery, "mode">>;
}) => {
  const bridgeUrls = getApplePhotosBridgeUrls(bridgeOrigin);
  const url = new URL(bridgeUrls[endpoint]);
  const search = buildQueryString(query);

  if ([...search.keys()].length > 0) {
    url.search = search.toString();
  }

  const response = await fetchImpl(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw await readBridgeError(response);
  }

  const payload: unknown = await response.json();
  if (!isApplePhotosAssetListResponse(payload)) {
    throw new Error(
      "The local Apple Photos bridge returned an unexpected asset-list payload.",
    );
  }

  return payload;
};

export const probeApplePhotosBridge = async ({
  fetchImpl = fetch,
  timeoutMs = APPLE_PHOTOS_BRIDGE_PROBE_TIMEOUT_MS,
  returnTo,
  draftId,
  profile,
}: {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  returnTo?: string;
  draftId?: string;
  profile?: string;
} = {}): Promise<ApplePhotosBridgeProbeResult> => {
  const bridgeUrls = getApplePhotosBridgeUrls();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(bridgeUrls.healthUrl, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        available: false,
        code: "MACOS_BRIDGE_UNAVAILABLE",
        message:
          "The local Apple Photos bridge did not return a healthy response.",
      };
    }

    const payload: unknown = await response.json();
    if (!isApplePhotosBridgeHealthResponse(payload)) {
      return {
        available: false,
        code: "MACOS_BRIDGE_UNAVAILABLE",
        message:
          "The local Apple Photos bridge returned an unexpected health payload.",
      };
    }

    if (payload.bridge.origin !== bridgeUrls.origin) {
      return {
        available: false,
        code: "MACOS_BRIDGE_UNAVAILABLE",
        message:
          "The local Apple Photos bridge advertised an unexpected origin.",
      };
    }

    return {
      available: true,
      health: payload,
      launchUrl: buildApplePhotosCompanionLaunchUrl("pick", {
        returnTo,
        draftId,
        profile,
        bridgeOrigin: bridgeUrls.origin,
      }),
    };
  } catch {
    return {
      available: false,
      code: "MACOS_BRIDGE_UNAVAILABLE",
      message:
        "The local Apple Photos bridge is not running on this Mac yet.",
    };
  } finally {
    clearTimeout(timeout);
  }
};

export const openApplePhotosCompanion = async ({
  fetchImpl = fetch,
  bridgeOrigin,
  action = "pick",
  returnTo,
  draftId,
  profile,
}: {
  fetchImpl?: typeof fetch;
  bridgeOrigin?: string;
  action?: "open" | "pick";
  returnTo?: string;
  draftId?: string;
  profile?: string;
} = {}) => {
  const bridgeUrls = getApplePhotosBridgeUrls(bridgeOrigin);
  const response = await fetchImpl(bridgeUrls.openCompanionUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action,
      returnTo,
      draftId,
      profile,
    }),
  });

  if (!response.ok) {
    throw await readBridgeError(response);
  }

  const payload: unknown = await response.json();
  if (!isApplePhotosCompanionOpenResponse(payload)) {
    throw new Error(
      "The local Apple Photos bridge returned an unexpected open-companion payload.",
    );
  }

  return payload;
};

export const importApplePhotosSelection = async ({
  fetchImpl = fetch,
  bridgeOrigin,
  ids,
}: {
  fetchImpl?: typeof fetch;
  bridgeOrigin?: string;
  ids?: string[];
} = {}): Promise<ApplePhotosBridgeImportResult> => {
  const bridgeUrls = getApplePhotosBridgeUrls(bridgeOrigin);
  const endpoint = ids?.length ? bridgeUrls.importUrl : bridgeUrls.pickUrl;
  const requestBody = ids?.length ? { ids } : {};

  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error("The local Apple Photos bridge could not prepare the selected assets.");
  }

  const payload: unknown = await response.json();
  if (!isApplePhotosPickResponse(payload)) {
    throw new Error("The local Apple Photos bridge returned an unexpected import payload.");
  }

  const files = await Promise.all(
    payload.assets.map(async (asset) => {
      const assetResponse = await fetchImpl(asset.downloadUrl, {
        headers: { Accept: "*/*" },
      });

      if (!assetResponse.ok) {
        throw new Error(
          `The local Apple Photos bridge could not download ${asset.filename}.`,
        );
      }

      const blob = await assetResponse.blob();
      return new File([blob], asset.filename, {
        type: blob.type || defaultMimeTypeForAsset(asset),
        lastModified: Number.isNaN(Date.parse(asset.createdAt))
          ? Date.now()
          : Date.parse(asset.createdAt),
      });
    }),
  );

  return {
    importedAt: payload.importedAt,
    assets: payload.assets,
    files,
  };
};

export const listRecentApplePhotos = async ({
  fetchImpl = fetch,
  bridgeOrigin,
  since,
  limit,
  mediaType,
  favorite,
}: {
  fetchImpl?: typeof fetch;
  bridgeOrigin?: string;
  since?: string;
  limit?: number;
  mediaType?: ApplePhotosAssetQuery["mediaType"];
  favorite?: boolean;
} = {}) =>
  requestApplePhotosAssetList({
    fetchImpl,
    bridgeOrigin,
    endpoint: "recentUrl",
    query: {
      since,
      limit,
      mediaType,
      favorite,
    },
  });

export const searchApplePhotos = async ({
  fetchImpl = fetch,
  bridgeOrigin,
  since,
  limit,
  album,
  mediaType,
  favorite,
}: {
  fetchImpl?: typeof fetch;
  bridgeOrigin?: string;
  since?: string;
  limit?: number;
  album?: string;
  mediaType?: ApplePhotosAssetQuery["mediaType"];
  favorite?: boolean;
} = {}) =>
  requestApplePhotosAssetList({
    fetchImpl,
    bridgeOrigin,
    endpoint: "searchUrl",
    query: {
      since,
      limit,
      album,
      mediaType,
      favorite,
    },
  });
