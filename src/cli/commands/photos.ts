import { parseCommandOptions } from "../args";
import type { CliContext } from "../context";
import { CliError, exitCodeFromStatus } from "../errors";
import {
  ApplePhotosBridgeRequestError,
  importApplePhotosSelection,
  listRecentApplePhotos,
  searchApplePhotos,
  type ApplePhotosAssetListResponse,
  type ApplePhotosMediaType,
} from "../photos-bridge";
import {
  printApplePhotosAssets,
  printAssetsTable,
  printJsonEnvelope,
  printKeyValue,
} from "../output";
import {
  buildUploadFormDataFromFile,
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

type AssetResponse = {
  ok: true;
  data: {
    asset: UploadedAsset;
  };
};

const PHOTO_USAGE = "Usage: ig photos <recent|search|import>";
const RECENT_USAGE =
  "Usage: ig photos recent [--since <7d|ISO>] [--limit <n>] [--media <image|video|live-photo>] [--favorite]";
const SEARCH_USAGE =
  "Usage: ig photos search [--album <name>] [--since <7d|ISO>] [--limit <n>] [--media <image|video|live-photo>] [--favorite]";
const IMPORT_USAGE =
  "Usage: ig photos import [--ids <id,id,...>] [--folder <assets|videos|logos|renders>]";

export const runPhotosCommand = async (ctx: CliContext, argv: string[]) => {
  const action = argv[0];

  switch (action) {
    case "recent":
      return listRecent(ctx, argv.slice(1));
    case "search":
      return listSearch(ctx, argv.slice(1));
    case "import":
      return importSelection(ctx, argv.slice(1));
    default:
      throw new CliError(PHOTO_USAGE);
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

  const ids = parseIds(options.ids);
  const folder = parseUploadFolder(options.folder);

  try {
    const imported = await importApplePhotosSelection({ ids });
    const uploadedAssets: UploadedAsset[] = [];

    for (const file of imported.files) {
      const body = buildUploadFormDataFromFile(
        file,
        folder ?? inferUploadFolder(file.name),
      );
      const response = await ctx.client.requestJson<AssetResponse>({
        method: "POST",
        path: "/api/v1/assets",
        body,
      });
      uploadedAssets.push(response.data.asset);
    }

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
  if (error instanceof ApplePhotosBridgeRequestError) {
    throw new CliError(error.message, exitCodeFromStatus(error.status));
  }

  if (error instanceof Error) {
    throw new CliError(error.message);
  }

  throw new CliError("Apple Photos bridge request failed.");
};
