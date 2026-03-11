import path from "node:path";
import { readFile, stat } from "node:fs/promises";

import { CliError, EXIT_CODES } from "./errors";

export type UploadFolder = "assets" | "videos" | "logos" | "renders";

export type UploadedAsset = {
  id: string;
  name: string;
  url: string;
  pathname: string;
  size: number;
  folder: string;
  contentType: string;
};

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".mov": "video/quicktime",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".webm": "video/webm",
  ".webp": "image/webp",
};

export const buildUploadFormData = async (
  filePath: string,
  folder?: string,
) => {
  const details = await readUploadFile(filePath);
  const formData = new FormData();
  formData.set(
    "file",
    new File([details.bytes], details.name, { type: details.contentType }),
  );
  if (folder) {
    formData.set("folder", folder);
  }

  return formData;
};

export const inferUploadFolder = (
  filePath: string,
  folder?: UploadFolder,
): UploadFolder => {
  if (folder) {
    return folder;
  }

  return inferMediaType(filePath) === "video" ? "videos" : "assets";
};

export const inferMediaType = (value: string) => {
  const contentType =
    value.includes("/") && !value.startsWith(".")
      ? value
      : inferContentType(path.basename(value));

  return contentType?.startsWith("video/") ? "video" : "image";
};

export const isSupportedUploadPath = (filePath: string) =>
  Boolean(inferContentType(path.basename(filePath)));

const readUploadFile = async (filePath: string) => {
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      throw new CliError(`Not a file: ${filePath}`, EXIT_CODES.usage);
    }

    const name = path.basename(filePath);
    const contentType = inferContentType(name);
    if (!contentType) {
      throw new CliError(
        `Unsupported file type for upload: ${name}`,
        EXIT_CODES.usage,
      );
    }

    const bytes = await readFile(filePath);
    return { bytes, name, contentType };
  } catch (error) {
    if (error instanceof CliError) {
      throw error;
    }

    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") {
      throw new CliError(`File not found: ${filePath}`, EXIT_CODES.usage);
    }

    throw new CliError(
      error instanceof Error ? error.message : `Could not read file: ${filePath}`,
      EXIT_CODES.usage,
    );
  }
};

const inferContentType = (fileName: string) =>
  CONTENT_TYPE_BY_EXTENSION[path.extname(fileName).toLowerCase()] ?? null;
