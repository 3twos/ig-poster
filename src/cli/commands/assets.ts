import path from "node:path";
import { readFile, stat } from "node:fs/promises";

import { parseCommandOptions } from "../args";
import type { CliContext } from "../context";
import { CliError, EXIT_CODES } from "../errors";
import { printAssetsTable, printJson } from "../output";

type UploadOptions = {
  folder?: string;
};

type UploadedAsset = {
  id: string;
  name: string;
  url: string;
  pathname: string;
  size: number;
  folder: string;
  contentType: string;
};

type AssetResponse = {
  ok: true;
  data: {
    asset: UploadedAsset;
  };
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

export const runAssetsCommand = async (ctx: CliContext, argv: string[]) => {
  const action = argv[0];

  switch (action) {
    case "upload":
      return uploadAssets(ctx, argv.slice(1));
    default:
      throw new CliError("Usage: ig assets <upload>");
  }
};

const uploadAssets = async (ctx: CliContext, argv: string[]) => {
  const { options, positionals } = parseCommandOptions<UploadOptions>(argv, {
    folder: "string",
  });

  if (positionals.length === 0) {
    throw new CliError(
      "Usage: ig assets upload <file...> [--folder <assets|videos|logos|renders>]",
    );
  }

  const uploaded: UploadedAsset[] = [];
  for (const filePath of positionals) {
    const body = await buildUploadFormData(filePath, options.folder);
    const response = await ctx.client.requestJson<AssetResponse>({
      method: "POST",
      path: "/api/v1/assets",
      body,
    });
    uploaded.push(response.data.asset);
  }

  const result = { ok: true, data: { assets: uploaded } };
  if (ctx.globalOptions.json) {
    printJson(result, ctx.globalOptions.jq);
    return;
  }

  printAssetsTable(uploaded);
};

const buildUploadFormData = async (filePath: string, folder?: string) => {
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
