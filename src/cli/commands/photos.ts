import { parseCommandOptions } from "../args";
import { IgPosterClient } from "../client";
import type { CliContext } from "../context";
import { CliError, EXIT_CODES, exitCodeFromStatus } from "../errors";
import {
  ApplePhotosBridgeRequestError,
  getApplePhotosBridgeHealth,
  importApplePhotosSelection,
  listRecentApplePhotos,
  openApplePhotosCompanion,
  searchApplePhotos,
  type ApplePhotosAssetListResponse,
  type ApplePhotosBridgeImportResult,
  type ApplePhotosMediaType,
} from "../photos-bridge";
import {
  printApplePhotosAssets,
  printAssetsTable,
  printGenerationVariantsTable,
  printJsonEnvelope,
  printKeyValue,
} from "../output";
import {
  buildUploadFormDataFromFile,
  inferMediaType,
  inferUploadFolder,
  type UploadedAsset,
  type UploadFolder,
} from "../upload";

type SharedPhotoOptions = {
  since?: string;
  limit?: string;
  media?: string;
  favorite?: boolean;
};

type SearchPhotoOptions = SharedPhotoOptions & {
  album?: string;
};

type ImportPhotoOptions = {
  ids?: string;
  folder?: string;
};

type PickPhotoOptions = {
  createDraft?: boolean;
  brandKit?: string;
  draftTitle?: string;
  folder?: string;
};

type ProposePhotoOptions = SharedPhotoOptions & {
  album?: string;
  brandKit?: string;
  draftTitle?: string;
  count?: string;
  folder?: string;
};

type AssetResponse = {
  ok: true;
  data: {
    asset: UploadedAsset;
  };
};

type PostRecord = {
  id: string;
  title: string;
  status: string;
};

type PostResponse = {
  ok: true;
  data: {
    post: PostRecord;
  };
};

type GenerationVariant = {
  id: string;
  name: string;
  postType: string;
  score?: number;
};

type GenerationResult = {
  strategy: string;
  variants: GenerationVariant[];
};

type ScoredApplePhotosAsset = ApplePhotosAssetListResponse["assets"][number] & {
  score: number;
  reasons: string[];
};

type PhotosProposeResponse = {
  mode: "recent" | "search";
  fetchedAt: string;
  importedAt: string;
  selectedAssets: ScoredApplePhotosAsset[];
  uploadedAssets: UploadedAsset[];
  post: PostRecord;
  draftUrl: string;
  generation: {
    summary: string;
    fallbackUsed: boolean;
    result: GenerationResult;
    topVariants: GenerationVariant[];
  };
};

type PhotosPickResponse = {
  importedAt: string;
  importedAssets: ImportedBridgeAsset[];
  uploadedAssets: UploadedAsset[];
  post?: PostRecord;
  draftUrl?: string;
};

type ImportedBridgeAsset = Awaited<
  ReturnType<typeof importApplePhotosSelection>
>["assets"][number];

const PHOTO_USAGE = "Usage: ig photos <pick|recent|search|import|propose>";
const PICK_USAGE =
  "Usage: ig photos pick [--create-draft] [--brand-kit <id>] [--draft-title <title>] [--folder <assets|videos|logos|renders>]";
const RECENT_USAGE =
  "Usage: ig photos recent [--since <7d|ISO>] [--limit <n>] [--media <image|video|live-photo>] [--favorite]";
const SEARCH_USAGE =
  "Usage: ig photos search [--album <name>] [--since <7d|ISO>] [--limit <n>] [--media <image|video|live-photo>] [--favorite]";
const IMPORT_USAGE =
  "Usage: ig photos import [--ids <id,id,...>] [--folder <assets|videos|logos|renders>]";
const PROPOSE_USAGE =
  "Usage: ig photos propose [--album <name>] [--since <7d|ISO>] [--limit <n>] [--count <n>] [--media <image|video|live-photo>] [--favorite] [--brand-kit <id>] [--draft-title <title>] [--folder <assets|videos|logos|renders>]";
const APPLE_PHOTOS_PICK_WAIT_TIMEOUT_MS = 300_000;

export const runPhotosCommand = async (ctx: CliContext, argv: string[]) => {
  const action = argv[0];

  switch (action) {
    case "pick":
      return pickSelection(ctx, argv.slice(1));
    case "recent":
      return listRecent(ctx, argv.slice(1));
    case "search":
      return listSearch(ctx, argv.slice(1));
    case "import":
      return importSelection(ctx, argv.slice(1));
    case "propose":
      return proposeSelection(ctx, argv.slice(1));
    default:
      throw new CliError(PHOTO_USAGE);
  }
};

const pickSelection = async (ctx: CliContext, argv: string[]) => {
  const { options, positionals } = parseCommandOptions<PickPhotoOptions>(argv, {
    "create-draft": "boolean",
    "brand-kit": "string",
    "draft-title": "string",
    folder: "string",
  });

  if (positionals.length > 0) {
    throw new CliError(PICK_USAGE);
  }

  if (!options.createDraft && (options.brandKit || options.draftTitle)) {
    throw new CliError(
      "--brand-kit and --draft-title require --create-draft for `ig photos pick`.",
    );
  }

  const folder = parseUploadFolder(options.folder);

  if (ctx.globalOptions.dryRun) {
    return printPickDryRun(ctx, {
      createDraft: options.createDraft === true,
      brandKitId: options.brandKit,
      draftTitle: options.draftTitle,
      folder,
    });
  }

  try {
    if (!ctx.globalOptions.quiet) {
      process.stderr.write("Opening IG Poster Companion for Apple Photos selection...\n");
    }

    const initialHealth = await getApplePhotosBridgeHealth();
    const launched = await openApplePhotosCompanion({ action: "pick" });
    const minUpdatedAt = Math.max(
      parseSelectionUpdatedAt(initialHealth.selection?.updatedAt),
      parseSelectionUpdatedAt(launched.launchedAt),
    );

    if (!ctx.globalOptions.quiet) {
      process.stderr.write("Waiting for IG Poster Companion to export the selected photos...\n");
    }

    const imported = await waitForCompanionSelection({
      timeoutMs: APPLE_PHOTOS_PICK_WAIT_TIMEOUT_MS,
      minUpdatedAt,
    });
    const uploadedAssets = await uploadImportedSelection(ctx, imported, folder);
    const result: PhotosPickResponse = {
      importedAt: imported.importedAt,
      importedAssets: imported.assets,
      uploadedAssets,
    };

    if (options.createDraft) {
      const post = await createDraftPost(ctx, {
        title: options.draftTitle,
        brandKitId: options.brandKit,
        uploadedAssets,
        importedAssets: imported.assets,
      });
      result.post = post;
      result.draftUrl = buildDraftUrl(ctx.host, post.id);
    }

    if (ctx.globalOptions.json) {
      printJsonEnvelope(result, ctx.globalOptions.jq);
      return;
    }

    printKeyValue([
      ["importedAt", result.importedAt],
      ["selectedCount", String(result.importedAssets.length)],
      ["uploadedCount", String(result.uploadedAssets.length)],
      ["postId", result.post?.id],
      ["title", result.post?.title],
      ["status", result.post?.status],
      ["draftUrl", result.draftUrl],
    ]);
    process.stdout.write("\n");
    printAssetsTable(result.uploadedAssets);
  } catch (error) {
    normalizeBridgeError(error);
  }
};

const listRecent = async (ctx: CliContext, argv: string[]) => {
  const { options, positionals } = parseCommandOptions<SharedPhotoOptions>(argv, {
    since: "string",
    limit: "string",
    media: "string",
    favorite: "boolean",
  });

  if (positionals.length > 0) {
    throw new CliError(RECENT_USAGE);
  }

  try {
    const response = await listRecentApplePhotos({
      since: options.since,
      limit: parseLimit(options.limit),
      mediaType: parseMediaType(options.media),
      favorite: options.favorite,
    });
    return printResult(ctx, response);
  } catch (error) {
    normalizeBridgeError(error);
  }
};

const listSearch = async (ctx: CliContext, argv: string[]) => {
  const { options, positionals } = parseCommandOptions<SearchPhotoOptions>(argv, {
    since: "string",
    limit: "string",
    media: "string",
    favorite: "boolean",
    album: "string",
  });

  if (positionals.length > 0) {
    throw new CliError(SEARCH_USAGE);
  }

  try {
    const response = await searchApplePhotos({
      since: options.since,
      limit: parseLimit(options.limit),
      album: options.album,
      mediaType: parseMediaType(options.media),
      favorite: options.favorite,
    });
    return printResult(ctx, response);
  } catch (error) {
    normalizeBridgeError(error);
  }
};

const importSelection = async (ctx: CliContext, argv: string[]) => {
  const { options, positionals } = parseCommandOptions<ImportPhotoOptions>(argv, {
    ids: "string",
    folder: "string",
  });

  if (positionals.length > 0) {
    throw new CliError(IMPORT_USAGE);
  }

  try {
    const { imported, uploadedAssets } = await importAndUploadSelection(
      ctx,
      parseIds(options.ids),
      parseUploadFolder(options.folder),
    );

    if (ctx.globalOptions.json) {
      printJsonEnvelope(
        {
          importedAt: imported.importedAt,
          importedAssets: imported.assets,
          uploadedAssets,
        },
        ctx.globalOptions.jq,
      );
      return;
    }

    printKeyValue([
      ["importedAt", imported.importedAt],
      ["selectedCount", String(imported.assets.length)],
      ["uploadedCount", String(uploadedAssets.length)],
    ]);
    process.stdout.write("\n");
    printAssetsTable(uploadedAssets);
  } catch (error) {
    normalizeBridgeError(error);
  }
};

const proposeSelection = async (ctx: CliContext, argv: string[]) => {
  const { options, positionals } = parseCommandOptions<ProposePhotoOptions>(argv, {
    since: "string",
    limit: "string",
    count: "string",
    media: "string",
    favorite: "boolean",
    album: "string",
    "brand-kit": "string",
    "draft-title": "string",
    folder: "string",
  });

  if (positionals.length > 0) {
    throw new CliError(PROPOSE_USAGE);
  }

  try {
    const listed = await listCandidatePhotos({
      album: options.album,
      since: options.since,
      limit: parseLimit(options.limit),
      mediaType: parseMediaType(options.media),
      favorite: options.favorite,
    });
    const selectedAssets = selectProposedAssets(
      listed.assets,
      parseCount(options.count),
    );

    if (selectedAssets.length === 0) {
      throw new CliError("No Apple Photos assets matched the propose criteria.");
    }

    if (ctx.globalOptions.dryRun) {
      return printProposeDryRun(ctx, listed, selectedAssets);
    }

    const { imported, uploadedAssets } = await importAndUploadSelection(
      ctx,
      selectedAssets.map((asset) => asset.id),
      parseUploadFolder(options.folder),
    );
    const post = await createDraftPost(ctx, {
      title: options.draftTitle,
      brandKitId: options.brandKit,
      uploadedAssets,
      importedAssets: imported.assets,
    });
    const generation = await runGenerationForPost(ctx, post.id);
    const result: PhotosProposeResponse = {
      mode: listed.query.mode,
      fetchedAt: listed.fetchedAt,
      importedAt: imported.importedAt,
      selectedAssets,
      uploadedAssets,
      post,
      draftUrl: buildDraftUrl(ctx.host, post.id),
      generation: {
        ...generation,
        topVariants: generation.result.variants.slice(0, 3),
      },
    };

    if (ctx.globalOptions.json) {
      printJsonEnvelope(result, ctx.globalOptions.jq);
      return;
    }

    printKeyValue([
      ["mode", result.mode],
      ["selectedCount", String(result.selectedAssets.length)],
      ["uploadedCount", String(result.uploadedAssets.length)],
      ["postId", result.post.id],
      ["title", result.post.title],
      ["status", result.post.status],
      ["draftUrl", result.draftUrl],
      ["generationSummary", result.generation.summary],
      ["variantCount", String(result.generation.result.variants.length)],
    ]);
    process.stdout.write("\n");
    printApplePhotosAssets(result.selectedAssets);
    process.stdout.write("\n");
    printAssetsTable(result.uploadedAssets);
    process.stdout.write("\n");
    printGenerationVariantsTable(result.generation.topVariants);
  } catch (error) {
    normalizeBridgeError(error);
  }
};

const parseLimit = (value?: string) => {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new CliError(`Invalid Photos limit: ${value}`);
  }

  return parsed;
};

const parseCount = (value?: string) => {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new CliError(`Invalid Photos count: ${value}`);
  }

  return parsed;
};

const parseMediaType = (value?: string): ApplePhotosMediaType | undefined => {
  if (!value) {
    return undefined;
  }

  if (value === "image" || value === "video" || value === "live-photo") {
    return value;
  }

  throw new CliError(`Unsupported Photos media type: ${value}`);
};

const parseIds = (value?: string) =>
  value
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const parseUploadFolder = (value?: string): UploadFolder | undefined => {
  if (!value) {
    return undefined;
  }

  if (
    value === "assets" ||
    value === "videos" ||
    value === "logos" ||
    value === "renders"
  ) {
    return value;
  }

  throw new CliError(`Unsupported upload folder: ${value}`);
};

const listCandidatePhotos = async (query: {
  album?: string;
  since?: string;
  limit?: number;
  mediaType?: ApplePhotosMediaType;
  favorite?: boolean;
}) => {
  if (query.album) {
    return searchApplePhotos(query);
  }

  return listRecentApplePhotos(query);
};

const scoreAsset = (
  asset: ApplePhotosAssetListResponse["assets"][number],
  index: number,
): ScoredApplePhotosAsset => {
  let score = 0;
  const reasons: string[] = [];

  if (asset.favorite) {
    score += 100;
    reasons.push("favorite");
  }

  if (asset.mediaType === "image") {
    score += 30;
    reasons.push("image");
  } else if (asset.mediaType === "live-photo") {
    score += 20;
    reasons.push("live-photo");
  } else {
    score += 10;
    reasons.push("video");
  }

  const createdAtMs = Date.parse(asset.createdAt);
  if (!Number.isNaN(createdAtMs)) {
    const ageHours = Math.max(0, (Date.now() - createdAtMs) / (1000 * 60 * 60));
    const freshnessScore = Math.max(0, 48 - Math.min(ageHours, 48));
    score += freshnessScore;
    reasons.push("recent");
  }

  const rankScore = Math.max(0, 12 - index);
  if (rankScore > 0) {
    score += rankScore;
    reasons.push("high-rank");
  }

  return {
    ...asset,
    score: Number(score.toFixed(2)),
    reasons,
  };
};

const selectProposedAssets = (
  assets: ApplePhotosAssetListResponse["assets"],
  count?: number,
) => {
  const desiredCount = count ?? Math.min(4, Math.max(1, assets.length));

  return assets
    .map(scoreAsset)
    .sort((left, right) => right.score - left.score)
    .slice(0, desiredCount);
};

const importAndUploadSelection = async (
  ctx: CliContext,
  ids: string[] | undefined,
  folder: UploadFolder | undefined,
) => {
  const imported = await importApplePhotosSelection({ ids });
  const uploadedAssets = await uploadImportedSelection(ctx, imported, folder);

  return { imported, uploadedAssets };
};

const uploadImportedSelection = async (
  ctx: CliContext,
  imported: ApplePhotosBridgeImportResult,
  folder: UploadFolder | undefined,
) => {
  const uploadedAssets = await Promise.all(
    imported.files.map(async (file) => {
      const body = buildUploadFormDataFromFile(
        file,
        folder ?? inferUploadFolder(file.name),
      );
      const response = await ctx.client.requestJson<AssetResponse>({
        method: "POST",
        path: "/api/v1/assets",
        body,
      });
      return response.data.asset;
    }),
  );

  return uploadedAssets;
};

const toStoredAsset = (asset: UploadedAsset, importedAsset?: ImportedBridgeAsset) => ({
  id: asset.id,
  name: asset.name,
  mediaType:
    importedAsset?.mediaType === "video" ? "video" : inferMediaType(asset.contentType),
  durationSec:
    typeof importedAsset?.durationMs === "number"
      ? Number((importedAsset.durationMs / 1000).toFixed(2))
      : undefined,
  url: asset.url,
  ...(importedAsset?.mediaType === "video" ? {} : { posterUrl: asset.url }),
});

const createDraftPost = async (
  ctx: CliContext,
  input: {
    title?: string;
    brandKitId?: string;
    uploadedAssets: UploadedAsset[];
    importedAssets: ImportedBridgeAsset[];
  },
) => {
  const response = await ctx.client.requestJson<PostResponse>({
    method: "POST",
    path: "/api/v1/posts",
    body: {
      ...(input.title ? { title: input.title } : {}),
      ...(input.brandKitId ? { brandKitId: input.brandKitId } : {}),
      assets: input.uploadedAssets.map((asset, index) =>
        toStoredAsset(asset, input.importedAssets[index]),
      ),
    },
  });

  return response.data.post;
};

const runGenerationForPost = async (ctx: CliContext, postId: string) => {
  const client =
    ctx.host
      ? new IgPosterClient({
          host: ctx.host,
          token: ctx.token,
          timeoutMs: Math.max(ctx.globalOptions.timeoutMs ?? 30_000, 120_000),
        })
      : ctx.client;

  const response = await client.requestStream({
    method: "POST",
    path: "/api/v1/generate",
    headers: {
      accept: "text/event-stream",
    },
    body: { postId },
  });
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return {
      summary: "Generation completed with fallback output.",
      fallbackUsed: true,
      result: parseGenerationResult(await response.json()),
    };
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new CliError("No generation response stream was returned.");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult:
    | {
        summary: string;
        fallbackUsed: boolean;
        result: GenerationResult;
      }
    | null = null;

  const processLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) {
      return;
    }

    const payload = trimmed.slice("data:".length).trimStart();
    if (!payload) {
      return;
    }

    const event = JSON.parse(payload) as {
      type?: unknown;
      summary?: unknown;
      fallbackUsed?: unknown;
      result?: unknown;
      detail?: unknown;
    };

    if (event.type === "run-error" && typeof event.detail === "string") {
      throw new CliError(event.detail);
    }

    if (
      event.type === "run-complete" &&
      typeof event.summary === "string" &&
      typeof event.fallbackUsed === "boolean"
    ) {
      finalResult = {
        summary: event.summary,
        fallbackUsed: event.fallbackUsed,
        result: parseGenerationResult(event.result),
      };
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const segments = buffer.split("\n");
    buffer = segments.pop() ?? "";
    for (const segment of segments) {
      processLine(segment);
    }
  }

  buffer += decoder.decode();
  if (buffer) {
    processLine(buffer);
  }

  if (!finalResult) {
    throw new CliError("Generation completed without a final result.");
  }

  return finalResult;
};

const parseGenerationResult = (value: unknown): GenerationResult => {
  if (!value || typeof value !== "object") {
    throw new CliError("Generation returned an invalid final result.");
  }

  const candidate = value as {
    strategy?: unknown;
    variants?: unknown;
  };
  if (typeof candidate.strategy !== "string") {
    throw new CliError("Generation returned an invalid strategy.");
  }

  if (!Array.isArray(candidate.variants)) {
    throw new CliError("Generation returned an invalid variants list.");
  }

  return {
    strategy: candidate.strategy,
    variants: candidate.variants.map((variant) => {
      if (!variant || typeof variant !== "object") {
        throw new CliError("Generation returned an incomplete variant.");
      }

      const candidateVariant = variant as {
        id?: unknown;
        name?: unknown;
        postType?: unknown;
        score?: unknown;
      };
      if (
        typeof candidateVariant.id !== "string" ||
        typeof candidateVariant.name !== "string" ||
        typeof candidateVariant.postType !== "string"
      ) {
        throw new CliError("Generation returned an incomplete variant.");
      }

      return {
        id: candidateVariant.id,
        name: candidateVariant.name,
        postType: candidateVariant.postType,
        score:
          typeof candidateVariant.score === "number"
            ? candidateVariant.score
            : undefined,
      };
    }),
  };
};

const buildDraftUrl = (host: string | undefined, postId: string) => {
  if (!host) {
    return `/?post=${encodeURIComponent(postId)}`;
  }

  const url = new URL(host);
  url.pathname = "/";
  url.search = "";
  url.searchParams.set("post", postId);
  return url.toString();
};

const printPickDryRun = (
  ctx: CliContext,
  input: {
    createDraft: boolean;
    brandKitId?: string;
    draftTitle?: string;
    folder?: UploadFolder;
  },
) => {
  const payload = {
    action: "pick",
    createDraft: input.createDraft,
    brandKitId: input.brandKitId,
    draftTitle: input.draftTitle,
    folder: input.folder,
    dryRun: true,
  };

  if (ctx.globalOptions.json) {
    printJsonEnvelope(payload, ctx.globalOptions.jq);
    return;
  }

  printKeyValue([
    ["action", "pick"],
    ["createDraft", String(input.createDraft)],
    ["brandKitId", input.brandKitId],
    ["draftTitle", input.draftTitle],
    ["folder", input.folder],
    ["dryRun", "true"],
  ]);
};

const printProposeDryRun = (
  ctx: CliContext,
  listed: ApplePhotosAssetListResponse,
  selectedAssets: ScoredApplePhotosAsset[],
) => {
  const payload = {
    mode: listed.query.mode,
    fetchedAt: listed.fetchedAt,
    selectedAssets,
    dryRun: true,
  };

  if (ctx.globalOptions.json) {
    printJsonEnvelope(payload, ctx.globalOptions.jq);
    return;
  }

  printKeyValue([
    ["mode", listed.query.mode],
    ["selectedCount", String(selectedAssets.length)],
    ["dryRun", "true"],
  ]);
  process.stdout.write("\n");
  printApplePhotosAssets(selectedAssets);
};

const printResult = (
  ctx: CliContext,
  response: ApplePhotosAssetListResponse,
) => {
  if (ctx.globalOptions.json) {
    printJsonEnvelope(response, ctx.globalOptions.jq);
    return;
  }

  printKeyValue([
    ["mode", response.query.mode],
    ["count", String(response.assets.length)],
    ["fetchedAt", response.fetchedAt],
    ["since", response.query.since],
    ["album", response.query.album],
    ["mediaType", response.query.mediaType],
    [
      "favoriteOnly",
      response.query.favorite === undefined ? undefined : String(response.query.favorite),
    ],
  ]);
  process.stdout.write("\n");
  printApplePhotosAssets(response.assets);
};

const normalizeBridgeError = (error: unknown): never => {
  if (error instanceof CliError) {
    throw error;
  }

  if (error instanceof ApplePhotosBridgeRequestError) {
    throw new CliError(error.message, exitCodeFromStatus(error.status));
  }

  if (error instanceof Error) {
    throw new CliError(error.message, EXIT_CODES.transport);
  }

  throw new CliError(
    "Apple Photos bridge request failed.",
    EXIT_CODES.transport,
  );
};

const parseSelectionUpdatedAt = (value?: string) => {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const waitForCompanionSelection = async ({
  timeoutMs,
  minUpdatedAt,
}: {
  timeoutMs: number;
  minUpdatedAt: number;
}) => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const health = await getApplePhotosBridgeHealth();
    const selection = health.selection;

    if (
      selection &&
      selection.assetCount > 0 &&
      parseSelectionUpdatedAt(selection.updatedAt) >= minUpdatedAt
    ) {
      return importApplePhotosSelection();
    }

    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }

  throw new CliError(
    "Timed out waiting for IG Poster Companion to export a Photos selection.",
    EXIT_CODES.transport,
  );
};
