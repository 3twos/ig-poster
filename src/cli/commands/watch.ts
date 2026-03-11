import path from "node:path";
import { readdir, stat } from "node:fs/promises";

import { parseCommandOptions } from "../args";
import type { CliContext } from "../context";
import { CliError, EXIT_CODES } from "../errors";
import {
  printJsonEnvelope,
  printKeyValue,
  printLines,
  printStreamJsonEvent,
} from "../output";
import {
  buildUploadFormData,
  inferMediaType,
  inferUploadFolder,
  isSupportedUploadPath,
  type UploadedAsset,
  type UploadFolder,
} from "../upload";

type WatchOptions = {
  brandKit?: string;
  folder?: string;
  interval?: string;
  once?: boolean;
};

type BrandKitResponse = {
  ok: true;
  data: {
    brandKit: {
      id: string;
      brand: unknown;
      promptConfig: unknown;
      logos: Array<{ url: string }>;
      logoUrl: string | null;
    };
  };
};

type PostResponse = {
  ok: true;
  data: {
    post: {
      id: string;
      title: string;
      status: string;
    };
  };
};

type AssetResponse = {
  ok: true;
  data: {
    asset: UploadedAsset;
  };
};

type WatchProcessedItem = {
  path: string;
  asset: {
    id: string;
    url: string;
    folder: string;
    mediaType: "image" | "video";
  };
  post: {
    id: string;
    title: string;
    status: string;
  };
};

type WatchFailure = {
  path: string;
  message: string;
};

type WatchSummary = {
  rootDir: string;
  continuous: boolean;
  intervalMs: number;
  startedAt: string;
  endedAt?: string;
  processedCount: number;
  errorCount: number;
  processed: WatchProcessedItem[];
  errors: WatchFailure[];
};

type WatchEvent =
  | { type: "scan-start"; rootDir: string; continuous: boolean }
  | { type: "watch-ready"; rootDir: string; intervalMs: number }
  | { type: "file-detected"; path: string }
  | {
      type: "asset-uploaded";
      path: string;
      asset: WatchProcessedItem["asset"];
    }
  | {
      type: "post-created";
      path: string;
      post: WatchProcessedItem["post"];
    }
  | {
      type: "file-error";
      path: string;
      message: string;
    }
  | {
      type: "done";
      processedCount: number;
      errorCount: number;
    };

const DEFAULT_INTERVAL_MS = 2_000;
const MAX_SUMMARY_ITEMS = 200;
const VALID_FOLDERS = new Set<UploadFolder>([
  "assets",
  "videos",
  "logos",
  "renders",
]);

export const runWatchCommand = async (ctx: CliContext, argv: string[]) => {
  const { options, positionals } = parseCommandOptions<WatchOptions>(argv, {
    "brand-kit": "string",
    folder: "string",
    interval: "string",
    once: "boolean",
  });
  const [rawRootDir] = positionals;

  if (!rawRootDir || positionals.length !== 1) {
    throw new CliError(
      "Usage: ig watch <dir> [--brand-kit <id>] [--folder <assets|videos|logos|renders>] [--interval <ms>] [--once]",
    );
  }

  const rootDir = path.resolve(rawRootDir);
  await assertDirectory(rootDir);

  const intervalMs = parseIntervalMs(options.interval);
  const continuous = !options.once && !ctx.globalOptions.json;
  const summary: WatchSummary = {
    rootDir,
    continuous,
    intervalMs,
    startedAt: new Date().toISOString(),
    processedCount: 0,
    errorCount: 0,
    processed: [],
    errors: [],
  };
  const seen = new Map<string, string>();
  const folder = normalizeFolder(options.folder);
  const brandKitId =
    options.brandKit ?? ctx.projectLink?.config.defaults?.brandKitId;
  const brandKit = brandKitId ? await loadBrandKit(ctx, brandKitId) : null;

  emitWatchEvent(ctx, {
    type: "scan-start",
    rootDir,
    continuous,
  });
  await runWatchScan({
    ctx,
    rootDir,
    folder,
    brandKit,
    seen,
    summary,
  });

  if (continuous) {
    emitWatchEvent(ctx, {
      type: "watch-ready",
      rootDir,
      intervalMs,
    });
    await pollUntilStopped(intervalMs, () =>
      runWatchScan({
        ctx,
        rootDir,
        folder,
        brandKit,
        seen,
        summary,
      }),
    );
  }

  summary.endedAt = new Date().toISOString();
  emitWatchEvent(ctx, {
    type: "done",
    processedCount: summary.processedCount,
    errorCount: summary.errorCount,
  });

  if (ctx.globalOptions.json) {
    printJsonEnvelope(summary, ctx.globalOptions.jq);
  } else if (!ctx.globalOptions.streamJson && !ctx.globalOptions.quiet) {
    printWatchSummary(summary);
  }

  return summary.errorCount > 0 ? EXIT_CODES.partial : EXIT_CODES.ok;
};

const runWatchScan = async (params: {
  ctx: CliContext;
  rootDir: string;
  folder?: UploadFolder;
  brandKit: BrandKitResponse["data"]["brandKit"] | null;
  seen: Map<string, string>;
  summary: WatchSummary;
}) => {
  const files = await listSupportedFiles(params.rootDir);
  for (const filePath of files) {
    const signature = await getFileSignature(filePath);
    if (!signature || params.seen.get(filePath) === signature) {
      continue;
    }

    emitWatchEvent(params.ctx, {
      type: "file-detected",
      path: filePath,
    });

    try {
      const processed = await ingestWatchFile({
        ctx: params.ctx,
        filePath,
        folder: params.folder,
        brandKit: params.brandKit,
      });
      params.seen.set(filePath, signature);
      params.summary.processedCount += 1;
      pushCapped(params.summary.processed, processed);
      emitWatchEvent(params.ctx, {
        type: "asset-uploaded",
        path: filePath,
        asset: processed.asset,
      });
      emitWatchEvent(params.ctx, {
        type: "post-created",
        path: filePath,
        post: processed.post,
      });
    } catch (error) {
      params.summary.errorCount += 1;
      const message =
        error instanceof Error ? error.message : "Failed to ingest file.";
      pushCapped(params.summary.errors, {
        path: filePath,
        message,
      });
      emitWatchEvent(params.ctx, {
        type: "file-error",
        path: filePath,
        message,
      });
    }
  }
};

const ingestWatchFile = async (params: {
  ctx: CliContext;
  filePath: string;
  folder?: UploadFolder;
  brandKit: BrandKitResponse["data"]["brandKit"] | null;
}): Promise<WatchProcessedItem> => {
  const uploadFolder = inferUploadFolder(params.filePath, params.folder);
  const assetResponse = await params.ctx.client.requestJson<AssetResponse>({
    method: "POST",
    path: "/api/v1/assets",
    body: await buildUploadFormData(params.filePath, uploadFolder),
  });
  const uploaded = assetResponse.data.asset;
  const postResponse = await params.ctx.client.requestJson<PostResponse>({
    method: "POST",
    path: "/api/v1/posts",
    body: buildPostBody(params.filePath, uploaded, params.brandKit),
  });
  const mediaType = inferMediaType(uploaded.contentType || params.filePath);

  return {
    path: params.filePath,
    asset: {
      id: uploaded.pathname || uploaded.id,
      url: uploaded.url,
      folder: uploaded.folder,
      mediaType,
    },
    post: {
      id: postResponse.data.post.id,
      title: postResponse.data.post.title,
      status: postResponse.data.post.status,
    },
  };
};

const buildPostBody = (
  filePath: string,
  asset: UploadedAsset,
  brandKit: BrandKitResponse["data"]["brandKit"] | null,
) => {
  const body: Record<string, unknown> = {
    title: deriveTitle(filePath),
    assets: [
      {
        id: asset.pathname || asset.id,
        name: asset.name,
        mediaType: inferMediaType(asset.contentType || filePath),
        url: asset.url,
      },
    ],
  };

  if (brandKit) {
    body.brandKitId = brandKit.id;
    body.brand = brandKit.brand;
    body.promptConfig = brandKit.promptConfig;
    body.logoUrl = brandKit.logos[0]?.url ?? brandKit.logoUrl;
  }

  return body;
};

const deriveTitle = (filePath: string) =>
  path
    .basename(filePath, path.extname(filePath))
    .replace(/[_-]+/g, " ")
    .trim()
    .slice(0, 120) || "Untitled Post";

const loadBrandKit = async (ctx: CliContext, id: string) => {
  const response = await ctx.client.requestJson<BrandKitResponse>({
    method: "GET",
    path: `/api/v1/brand-kits/${id}`,
  });

  return response.data.brandKit;
};

const listSupportedFiles = async (rootDir: string): Promise<string[]> => {
  const output: string[] = [];
  const entries = await readdir(rootDir, { withFileTypes: true });

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const absolutePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      output.push(...await listSupportedFiles(absolutePath));
      continue;
    }

    if (entry.isFile() && isSupportedUploadPath(absolutePath)) {
      output.push(absolutePath);
    }
  }

  return output;
};

const getFileSignature = async (filePath: string) => {
  try {
    const details = await stat(filePath);
    if (!details.isFile()) {
      return null;
    }
    return `${details.size}:${details.mtimeMs}`;
  } catch {
    return null;
  }
};

const pollUntilStopped = async (
  intervalMs: number,
  callback: () => Promise<void>,
) => {
  let stopped = false;
  const stop = () => {
    stopped = true;
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  try {
    while (!stopped) {
      await sleep(intervalMs);
      if (stopped) {
        break;
      }
      await callback();
    }
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
};

const emitWatchEvent = (ctx: CliContext, event: WatchEvent) => {
  if (ctx.globalOptions.streamJson) {
    printStreamJsonEvent(event);
    return;
  }

  if (ctx.globalOptions.json || ctx.globalOptions.quiet) {
    return;
  }

  if (event.type === "scan-start") {
    printLines([
      `Scanning ${event.rootDir}${event.continuous ? " and starting watch mode" : ""}...`,
    ]);
    return;
  }

  if (event.type === "watch-ready") {
    printLines([
      `Watching ${event.rootDir} for new assets every ${event.intervalMs}ms.`,
    ]);
    return;
  }

  if (event.type === "asset-uploaded") {
    printLines([
      `Uploaded ${path.basename(event.path)} -> ${event.asset.folder}/${event.asset.id}`,
    ]);
    return;
  }

  if (event.type === "post-created") {
    printLines([
      `Created draft ${event.post.id} (${event.post.title}).`,
    ]);
    return;
  }

  if (event.type === "file-error") {
    printLines([
      `Failed ${path.basename(event.path)}: ${event.message}`,
    ]);
  }
};

const printWatchSummary = (summary: WatchSummary) => {
  printKeyValue([
    ["rootDir", summary.rootDir],
    ["continuous", String(summary.continuous)],
    ["processed", String(summary.processedCount)],
    ["errors", String(summary.errorCount)],
    ["startedAt", summary.startedAt],
    ["endedAt", summary.endedAt],
  ]);
};

const parseIntervalMs = (value?: string) => {
  if (value === undefined) {
    return DEFAULT_INTERVAL_MS;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new CliError(`Invalid interval value: ${value}`, EXIT_CODES.usage);
  }

  return parsed;
};

const normalizeFolder = (value?: string): UploadFolder | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!VALID_FOLDERS.has(value as UploadFolder)) {
    throw new CliError(
      `Invalid watch folder: ${value}`,
      EXIT_CODES.usage,
    );
  }

  return value as UploadFolder;
};

const assertDirectory = async (rootDir: string) => {
  try {
    const details = await stat(rootDir);
    if (!details.isDirectory()) {
      throw new CliError(`Not a directory: ${rootDir}`, EXIT_CODES.usage);
    }
  } catch (error) {
    if (error instanceof CliError) {
      throw error;
    }

    throw new CliError(`Directory not found: ${rootDir}`, EXIT_CODES.usage);
  }
};

const sleep = (durationMs: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs);
  });

const pushCapped = <T>(items: T[], value: T) => {
  if (items.length < MAX_SUMMARY_ITEMS) {
    items.push(value);
  }
};
