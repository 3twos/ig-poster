import { parseCommandOptions } from "../args";
import type { CliContext } from "../context";
import { CliError, exitCodeFromStatus } from "../errors";
import {
  ApplePhotosBridgeRequestError,
  listRecentApplePhotos,
  searchApplePhotos,
  type ApplePhotosAssetListResponse,
  type ApplePhotosMediaType,
} from "../photos-bridge";
import {
  printApplePhotosAssets,
  printJsonEnvelope,
  printKeyValue,
} from "../output";

type SharedPhotoOptions = {
  since?: string;
  limit?: string;
  media?: string;
  favorite?: boolean;
};

type SearchPhotoOptions = SharedPhotoOptions & {
  album?: string;
};

const PHOTO_USAGE = "Usage: ig photos <recent|search>";
const RECENT_USAGE =
  "Usage: ig photos recent [--since <7d|ISO>] [--limit <n>] [--media <image|video|live-photo>] [--favorite]";
const SEARCH_USAGE =
  "Usage: ig photos search [--album <name>] [--since <7d|ISO>] [--limit <n>] [--media <image|video|live-photo>] [--favorite]";

export const runPhotosCommand = async (ctx: CliContext, argv: string[]) => {
  const action = argv[0];

  switch (action) {
    case "recent":
      return listRecent(ctx, argv.slice(1));
    case "search":
      return listSearch(ctx, argv.slice(1));
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
