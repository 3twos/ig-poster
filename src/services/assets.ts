import { put } from "@vercel/blob";

import { buildBlobPath, isBlobEnabled } from "@/lib/blob-store";

export const ASSET_FOLDERS = ["assets", "videos", "logos", "renders"] as const;
export type AssetFolder = (typeof ASSET_FOLDERS)[number];

const MAX_UPLOAD_BYTES = 120 * 1024 * 1024;
const DEFAULT_FOLDER: AssetFolder = "assets";

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

export class AssetUploadServiceError extends Error {
  readonly status: 400 | 413 | 503;

  constructor(status: 400 | 413 | 503, message: string) {
    super(message);
    this.name = "AssetUploadServiceError";
    this.status = status;
  }
}

export type UploadedAsset = {
  id: string;
  name: string;
  url: string;
  pathname: string;
  size: number;
  folder: AssetFolder;
  contentType: string;
};

export const normalizeAssetFolder = (
  value: string | null | undefined,
): AssetFolder =>
  (ASSET_FOLDERS as readonly string[]).includes(String(value))
    ? (value as AssetFolder)
    : DEFAULT_FOLDER;

export const uploadAsset = async (
  file: File | null,
  folderInput?: string | null,
): Promise<UploadedAsset> => {
  if (!isBlobEnabled()) {
    throw new AssetUploadServiceError(
      503,
      "Blob storage is not configured (BLOB_READ_WRITE_TOKEN missing).",
    );
  }

  if (!(file instanceof File)) {
    throw new AssetUploadServiceError(400, "Missing file in form-data.");
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new AssetUploadServiceError(413, "File too large. Max 120MB.");
  }

  const contentType = file.type || "application/octet-stream";
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new AssetUploadServiceError(
      400,
      `File type "${contentType}" is not allowed. Upload images or videos only.`,
    );
  }

  const folder = normalizeAssetFolder(folderInput);
  const pathname = buildBlobPath(folder, file.name);
  const blob = await put(pathname, file, {
    access: "public",
    contentType,
  });

  return {
    id: pathname,
    name: file.name,
    url: blob.url,
    pathname: blob.pathname,
    size: file.size,
    folder,
    contentType,
  };
};
