export type ApplePhotosMediaType = "image" | "video" | "live-photo";

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

export type ApplePhotosAssetQuery = {
  mode: "recent" | "search";
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

export type ApplePhotosImportResponse = {
  assets: ApplePhotosImportedAsset[];
  importedAt: string;
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

const APPLE_PHOTOS_BRIDGE_ORIGIN = "http://127.0.0.1:43123";

const buildBridgeUrl = (path: string) =>
  new URL(`${APPLE_PHOTOS_BRIDGE_ORIGIN}${path}`);

const buildAssetListQuery = (
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

const isPhotoAsset = (
  value: unknown,
): value is ApplePhotosBridgePhotoAsset => {
  if (!value || typeof value !== "object") return false;

  const candidate = value as ApplePhotosBridgePhotoAsset;
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

const isImportedAsset = (
  value: unknown,
): value is ApplePhotosImportedAsset => {
  if (!isPhotoAsset(value)) {
    return false;
  }

  const candidate = value as ApplePhotosImportedAsset;
  return (
    typeof candidate.exportPath === "string" &&
    typeof candidate.downloadUrl === "string"
  );
};

const isAssetListResponse = (
  value: unknown,
): value is ApplePhotosAssetListResponse => {
  if (!value || typeof value !== "object") return false;

  const candidate = value as ApplePhotosAssetListResponse;
  return (
    Array.isArray(candidate.assets) &&
    candidate.assets.every(isPhotoAsset) &&
    typeof candidate.fetchedAt === "string" &&
    typeof candidate.query?.mode === "string" &&
    typeof candidate.query?.limit === "number"
  );
};

const isImportResponse = (
  value: unknown,
): value is ApplePhotosImportResponse => {
  if (!value || typeof value !== "object") return false;

  const candidate = value as ApplePhotosImportResponse;
  return (
    Array.isArray(candidate.assets) &&
    candidate.assets.every(isImportedAsset) &&
    typeof candidate.importedAt === "string"
  );
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
    };
    return new ApplePhotosBridgeRequestError(
      payload.message || "The local Apple Photos bridge request failed.",
      response.status,
      payload.error,
    );
  } catch {
    return new ApplePhotosBridgeRequestError(raw, response.status);
  }
};

const requestAssetList = async ({
  path,
  query,
}: {
  path: "/v1/photos/recent" | "/v1/photos/search";
  query: Partial<Omit<ApplePhotosAssetQuery, "mode">>;
}) => {
  const url = buildBridgeUrl(path);
  const search = buildAssetListQuery(query);
  if ([...search.keys()].length > 0) {
    url.search = search.toString();
  }

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw await readBridgeError(response);
  }

  const payload: unknown = await response.json();
  if (!isAssetListResponse(payload)) {
    throw new Error(
      "The local Apple Photos bridge returned an unexpected asset-list payload.",
    );
  }

  return payload;
};

const defaultMimeTypeForAsset = (asset: ApplePhotosImportedAsset) => {
  if (asset.mediaType === "video") {
    return "video/quicktime";
  }

  return "image/jpeg";
};

export const listRecentApplePhotos = async (
  query: Partial<Omit<ApplePhotosAssetQuery, "mode">> = {},
) =>
  requestAssetList({
    path: "/v1/photos/recent",
    query,
  });

export const searchApplePhotos = async (
  query: Partial<Omit<ApplePhotosAssetQuery, "mode">> = {},
) =>
  requestAssetList({
    path: "/v1/photos/search",
    query,
  });

export const importApplePhotosSelection = async ({
  ids,
}: {
  ids?: string[];
} = {}): Promise<ApplePhotosBridgeImportResult> => {
  const path = ids?.length ? "/v1/photos/import" : "/v1/photos/pick";
  const response = await fetch(buildBridgeUrl(path), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(ids?.length ? { ids } : {}),
  });

  if (!response.ok) {
    throw await readBridgeError(response);
  }

  const payload: unknown = await response.json();
  if (!isImportResponse(payload)) {
    throw new Error(
      "The local Apple Photos bridge returned an unexpected import payload.",
    );
  }

  const files = await Promise.all(
    payload.assets.map(async (asset) => {
      const assetResponse = await fetch(asset.downloadUrl, {
        headers: { Accept: "*/*" },
      });

      if (!assetResponse.ok) {
        throw await readBridgeError(assetResponse);
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
