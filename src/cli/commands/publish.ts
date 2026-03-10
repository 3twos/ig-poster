import { parseCommandOptions } from "../args";
import type { CliContext } from "../context";
import { CliError, EXIT_CODES } from "../errors";
import { readTextInput } from "../input";
import { printJson, printKeyValue } from "../output";

type PublishOptions = {
  image?: string;
  video?: string;
  carousel?: string;
  cover?: string;
  caption?: string;
  captionFile?: string;
  firstComment?: string;
  schedule?: string;
  location?: string;
  locationId?: string;
  connection?: string;
  shareToFeed?: boolean;
  noShareToFeed?: boolean;
};

type PublishResponse = {
  ok: true;
  data: {
    publish: {
      status: "validated" | "scheduled" | "published";
      mode: "image" | "reel" | "carousel";
      authSource: "oauth" | "env";
      connectionId?: string | null;
      publishAt?: string | null;
      scheduled?: boolean;
      id?: string;
      publishId?: string | null;
      creationId?: string | null;
      children?: string[] | null;
      firstCommentStatus?: "posted" | "failed";
      firstCommentWarning?: string;
    };
  };
};

type LocationSearchResponse = {
  ok: true;
  data: {
    locations: Array<{
      id: string;
      name: string;
      city?: string;
      state?: string;
      country?: string;
    }>;
  };
};

export const runPublishCommand = async (ctx: CliContext, argv: string[]) => {
  const { options, positionals } = parseCommandOptions<PublishOptions>(argv, {
    image: "string",
    video: "string",
    carousel: "string",
    cover: "string",
    caption: "string",
    "caption-file": "string",
    "first-comment": "string",
    schedule: "string",
    location: "string",
    "location-id": "string",
    connection: "string",
    "share-to-feed": "boolean",
    "no-share-to-feed": "boolean",
  });

  if (positionals.length > 0) {
    throw new CliError(
      "Usage: ig publish (--image <url> | --video <url> | --carousel <url,...>) (--caption <text> | --caption-file <file>) [--schedule <iso-datetime>] [--first-comment <text>] [--location <query> | --location-id <id>] [--connection <id>]",
    );
  }

  const media = resolveMedia(options);
  const caption = await resolveCaption(options);
  const locationId = await resolveLocationId(ctx, options);

  const response = await ctx.client.requestJson<PublishResponse>({
    method: "POST",
    path: "/api/v1/publish",
    body: {
      caption,
      ...(options.firstComment ? { firstComment: options.firstComment } : {}),
      ...(options.schedule ? { publishAt: options.schedule } : {}),
      ...(locationId ? { locationId } : {}),
      ...(options.connection ? { connectionId: options.connection } : {}),
      ...(ctx.globalOptions.dryRun ? { dryRun: true } : {}),
      media,
    },
  });

  if (ctx.globalOptions.json) {
    printJson(response, ctx.globalOptions.jq);
    return;
  }

  const publish = response.data.publish;
  printKeyValue([
    ["status", publish.status],
    ["mode", publish.mode],
    ["authSource", publish.authSource],
    ["connectionId", publish.connectionId ?? ""],
    ["scheduled", publish.scheduled?.toString()],
    ["publishAt", publish.publishAt ?? ""],
    ["jobId", publish.id],
    ["publishId", publish.publishId ?? ""],
    ["creationId", publish.creationId ?? ""],
    ["firstCommentStatus", publish.firstCommentStatus],
    ["firstCommentWarning", publish.firstCommentWarning],
  ]);
};

const resolveCaption = async (options: PublishOptions) => {
  const suppliedCaptions = [options.caption, options.captionFile].filter(
    Boolean,
  ).length;
  if (suppliedCaptions !== 1) {
    throw new CliError(
      "Choose exactly one of --caption or --caption-file for `ig publish`.",
      EXIT_CODES.usage,
    );
  }

  const caption = options.captionFile
    ? await readTextInput(`@${options.captionFile}`)
    : (options.caption as string);
  const trimmed = caption.trim();
  if (!trimmed) {
    throw new CliError("Caption cannot be empty.", EXIT_CODES.usage);
  }

  return trimmed;
};

const resolveMedia = (options: PublishOptions) => {
  const suppliedMedia = [options.image, options.video, options.carousel].filter(
    Boolean,
  ).length;
  if (suppliedMedia !== 1) {
    throw new CliError(
      "Choose exactly one of --image, --video, or --carousel for `ig publish`.",
      EXIT_CODES.usage,
    );
  }

  if (options.shareToFeed && options.noShareToFeed) {
    throw new CliError(
      "Choose only one of --share-to-feed or --no-share-to-feed.",
      EXIT_CODES.usage,
    );
  }

  if (options.image) {
    rejectUnexpectedReelOptions(options);
    return {
      mode: "image" as const,
      imageUrl: options.image,
    };
  }

  if (options.video) {
    return {
      mode: "reel" as const,
      videoUrl: options.video,
      ...(options.cover ? { coverUrl: options.cover } : {}),
      ...(options.noShareToFeed
        ? { shareToFeed: false }
        : options.shareToFeed
          ? { shareToFeed: true }
          : {}),
    };
  }

  rejectUnexpectedReelOptions(options);
  const items = (options.carousel as string)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((rawUrl) => ({
      mediaType: inferCarouselMediaType(rawUrl),
      url: normalizeMediaUrl(rawUrl),
    }));

  if (items.length < 2) {
    throw new CliError(
      "Carousel publishing requires at least 2 comma-separated media URLs.",
      EXIT_CODES.usage,
    );
  }

  return {
    mode: "carousel" as const,
    items,
  };
};

const rejectUnexpectedReelOptions = (options: PublishOptions) => {
  if (options.cover) {
    throw new CliError(
      "--cover is only valid with --video.",
      EXIT_CODES.usage,
    );
  }

  if (options.shareToFeed || options.noShareToFeed) {
    throw new CliError(
      "--share-to-feed and --no-share-to-feed are only valid with --video.",
      EXIT_CODES.usage,
    );
  }
};

const resolveLocationId = async (ctx: CliContext, options: PublishOptions) => {
  if (options.location && options.locationId) {
    throw new CliError(
      "Choose only one of --location or --location-id.",
      EXIT_CODES.usage,
    );
  }

  if (options.locationId) {
    return options.locationId;
  }

  if (!options.location) {
    return undefined;
  }

  const search = new URLSearchParams({ q: options.location });
  if (options.connection) {
    search.set("connectionId", options.connection);
  }

  const response = await ctx.client.requestJson<LocationSearchResponse>({
    method: "GET",
    path: `/api/v1/meta/locations?${search.toString()}`,
  });
  const matches = response.data.locations;

  if (matches.length === 0) {
    throw new CliError(
      `No Meta locations matched "${options.location}".`,
      EXIT_CODES.usage,
    );
  }

  if (matches.length === 1) {
    return matches[0]?.id;
  }

  const exactMatch = matches.find(
    (location) => location.name.toLowerCase() === options.location?.toLowerCase(),
  );
  if (exactMatch) {
    return exactMatch.id;
  }

  const suggestions = matches
    .slice(0, 3)
    .map((location) => `${location.id}:${location.name}`)
    .join(", ");
  throw new CliError(
    `Location query matched multiple results. Use --location-id instead. Matches: ${suggestions}`,
    EXIT_CODES.usage,
  );
};

const inferCarouselMediaType = (value: string) => {
  if (value.startsWith("image:")) {
    return "image";
  }

  if (value.startsWith("video:")) {
    return "video";
  }

  try {
    const url = new URL(value);
    const pathname = url.pathname.toLowerCase();
    if (/\.(mp4|mov|m4v|webm)$/i.test(pathname)) {
      return "video";
    }
  } catch {
    // Let server-side validation reject malformed URLs later.
  }

  return "image";
};

const normalizeMediaUrl = (value: string) =>
  value.replace(/^(image|video):/i, "");
