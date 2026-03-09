import { z } from "zod";

import { ASSET_FOLDERS, type UploadedAsset } from "@/services/assets";

export const AssetFolderSchema = z.enum(ASSET_FOLDERS);

export const AssetResourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  url: z.string().url(),
  pathname: z.string().min(1),
  size: z.number().int().nonnegative(),
  folder: AssetFolderSchema,
  contentType: z.string().min(1),
});

export const AssetDataSchema = z.object({
  asset: AssetResourceSchema,
});

export const toAssetResource = (asset: UploadedAsset) => ({
  id: asset.id,
  name: asset.name,
  url: asset.url,
  pathname: asset.pathname,
  size: asset.size,
  folder: asset.folder,
  contentType: asset.contentType,
});
