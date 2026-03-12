export {
  CarouselItemSchema,
  MetaScheduleRequestSchema,
  type CarouselItem,
  type MetaLocationSearchResult,
  type MetaUserTag,
  type MetaScheduleRequest,
} from "@/lib/meta-schemas";

import type {
  CarouselItem,
  MetaLocationSearchResult,
  MetaScheduleRequest,
  MetaUserTag,
} from "@/lib/meta-schemas";

export type MetaAuthContext = {
  accessToken: string;
  instagramUserId: string;
  pageId?: string;
  graphVersion: string;
};

export const getEnvMetaAuth = (): MetaAuthContext | null => {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const instagramUserId = process.env.INSTAGRAM_BUSINESS_ID;
  const pageId =
    process.env.META_PAGE_ID?.trim() || process.env.FACEBOOK_PAGE_ID?.trim();
  const graphVersion = process.env.META_GRAPH_VERSION ?? "v22.0";

  if (!accessToken || !instagramUserId) {
    return null;
  }

  return {
    accessToken,
    instagramUserId,
    graphVersion,
    ...(pageId ? { pageId } : {}),
  };
};

type GraphResponse = {
  id?: string;
  status_code?: string;
  status?: string;
  error?: {
    message?: string;
  };
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const callGraphPost = async (
  path: string,
  params: URLSearchParams,
  auth: MetaAuthContext,
) => {
  params.set("access_token", auth.accessToken);

  const response = await fetch(
    `https://graph.facebook.com/${auth.graphVersion}/${path}`,
    {
      method: "POST",
      body: params,
      cache: "no-store",
    },
  );

  let json: GraphResponse;
  try {
    json = (await response.json()) as GraphResponse;
  } catch {
    throw new Error(`Meta API returned non-JSON response on ${path} (${response.status})`);
  }
  if (!response.ok || json.error) {
    throw new Error(json.error?.message ?? `Meta API call failed on ${path}`);
  }

  return json;
};

const callGraphGetWithParams = async <
  T extends GraphResponse = GraphResponse,
>(
  path: string,
  auth: MetaAuthContext,
  options: {
    fields?: string[];
    params?: Record<string, string | undefined>;
  } = {},
) => {
  const url = new URL(`https://graph.facebook.com/${auth.graphVersion}/${path}`);
  url.searchParams.set("access_token", auth.accessToken);
  if (options.fields?.length) {
    url.searchParams.set("fields", options.fields.join(","));
  }
  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined) {
        url.searchParams.set(key, value);
      }
    }
  }

  const response = await fetch(url, { cache: "no-store" });
  let json: T;
  try {
    json = (await response.json()) as T;
  } catch {
    throw new Error(`Meta API returned non-JSON response on ${path} (${response.status})`);
  }

  if (!response.ok || json.error) {
    throw new Error(json.error?.message ?? `Meta API call failed on ${path}`);
  }

  return json;
};

const callGraphGet = async (
  path: string,
  auth: MetaAuthContext,
  fields?: string[],
) => callGraphGetWithParams(path, auth, { fields });

const createMediaContainer = (params: URLSearchParams, auth: MetaAuthContext) =>
  callGraphPost(`${auth.instagramUserId}/media`, params, auth);

const publishContainer = (creationId: string, auth: MetaAuthContext) =>
  callGraphPost(
    `${auth.instagramUserId}/media_publish`,
    new URLSearchParams({ creation_id: creationId }),
    auth,
  );

const waitForContainerReady = async (creationId: string, auth: MetaAuthContext) => {
  const maxAttempts = 10;
  const baseDelay = 3000;
  const maxTotalMs = 60_000;
  const start = Date.now();

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const status = await callGraphGet(creationId, auth, ["status_code", "status"]);
    const code = status.status_code ?? status.status ?? "";

    if (["FINISHED", "PUBLISHED", "SUCCESS"].includes(code.toUpperCase())) {
      return;
    }

    if (["ERROR", "EXPIRED"].includes(code.toUpperCase())) {
      throw new Error(`Container ${creationId} failed with status ${code}`);
    }

    const delay = Math.min(baseDelay * Math.pow(1.3, attempt), 10000);
    if (Date.now() - start + delay > maxTotalMs) {
      throw new Error(`Container ${creationId} did not finish processing within ${maxTotalMs / 1000}s`);
    }
    await sleep(delay);
  }

  throw new Error(`Container ${creationId} did not finish processing in time`);
};

const publishSingleImage = async (
  payload: {
    imageUrl: string;
    caption: string;
    locationId?: string;
    userTags?: MetaUserTag[];
  },
  auth: MetaAuthContext,
) => {
  const params = new URLSearchParams({
    image_url: payload.imageUrl,
    caption: payload.caption,
  });
  if (payload.locationId) {
    params.set("location_id", payload.locationId);
  }
  if (payload.userTags?.length) {
    params.set("user_tags", JSON.stringify(payload.userTags));
  }

  const createMedia = await createMediaContainer(
    params,
    auth,
  );

  if (!createMedia.id) {
    throw new Error("Meta API did not return media creation id");
  }

  const publishMedia = await publishContainer(createMedia.id, auth);

  return {
    mode: "image" as const,
    creationId: createMedia.id,
    publishId: publishMedia.id,
  };
};

const publishReel = async (
  payload: {
    videoUrl: string;
    caption: string;
    coverUrl?: string;
    shareToFeed?: boolean;
    locationId?: string;
    userTags?: MetaUserTag[];
  },
  auth: MetaAuthContext,
) => {
  const params = new URLSearchParams({
    media_type: "REELS",
    video_url: payload.videoUrl,
    caption: payload.caption,
    share_to_feed: payload.shareToFeed === false ? "false" : "true",
  });

  if (payload.coverUrl) {
    params.set("cover_url", payload.coverUrl);
  }
  if (payload.locationId) {
    params.set("location_id", payload.locationId);
  }
  if (payload.userTags?.length) {
    params.set("user_tags", JSON.stringify(payload.userTags));
  }

  const createMedia = await createMediaContainer(params, auth);

  if (!createMedia.id) {
    throw new Error("Meta API did not return reel creation id");
  }

  await waitForContainerReady(createMedia.id, auth);
  const publishMedia = await publishContainer(createMedia.id, auth);

  return {
    mode: "reel" as const,
    creationId: createMedia.id,
    publishId: publishMedia.id,
  };
};

const createCarouselChild = async (item: CarouselItem, auth: MetaAuthContext) => {
  const params = new URLSearchParams({
    is_carousel_item: "true",
  });

  if (item.mediaType === "video") {
    if (item.userTags?.length) {
      throw new Error("Meta does not support user tags on carousel videos.");
    }
    params.set("media_type", "VIDEO");
    params.set("video_url", item.url);
  } else {
    params.set("image_url", item.url);
    if (item.userTags?.length) {
      params.set("user_tags", JSON.stringify(item.userTags));
    }
  }

  const child = await createMediaContainer(params, auth);
  if (!child.id) {
    throw new Error("Failed to create carousel child container");
  }

  if (item.mediaType === "video") {
    await waitForContainerReady(child.id, auth);
  }

  return child.id;
};

const publishCarousel = async (
  payload: {
    items: CarouselItem[];
    caption: string;
    locationId?: string;
  },
  auth: MetaAuthContext,
) => {
  const limitedItems = payload.items.slice(0, 10);
  if (limitedItems.length < 2) {
    throw new Error("Carousel posts require at least 2 media items");
  }

  const concurrency = 3;
  const children: string[] = [];
  for (let i = 0; i < limitedItems.length; i += concurrency) {
    const batch = limitedItems.slice(i, i + concurrency);
    const ids = await Promise.all(
      batch.map((item) => createCarouselChild(item, auth)),
    );
    children.push(...ids);
  }

  const parent = await createMediaContainer(
    new URLSearchParams({
      media_type: "CAROUSEL",
      children: children.join(","),
      caption: payload.caption,
      ...(payload.locationId ? { location_id: payload.locationId } : {}),
    }),
    auth,
  );

  if (!parent.id) {
    throw new Error("Failed to create carousel parent container");
  }

  await waitForContainerReady(parent.id, auth);
  const publishMedia = await publishContainer(parent.id, auth);

  return {
    mode: "carousel" as const,
    creationId: parent.id,
    children,
    publishId: publishMedia.id,
  };
};

export const publishInstagramContent = async (
  payload: MetaScheduleRequest["media"] & {
    caption: string;
    locationId?: string;
    userTags?: MetaUserTag[];
  },
  auth?: MetaAuthContext,
) => {
  const resolvedAuth = auth ?? getEnvMetaAuth();
  if (!resolvedAuth) {
    throw new Error("Missing Instagram publishing credentials");
  }

  if (payload.mode === "image") {
    return publishSingleImage(
      {
        imageUrl: payload.imageUrl,
        caption: payload.caption,
        locationId: payload.locationId,
        userTags: payload.userTags,
      },
      resolvedAuth,
    );
  }

  if (payload.mode === "reel") {
    return publishReel(
      {
        videoUrl: payload.videoUrl,
        caption: payload.caption,
        coverUrl: payload.coverUrl,
        shareToFeed: payload.shareToFeed,
        locationId: payload.locationId,
        userTags: payload.userTags,
      },
      resolvedAuth,
    );
  }

  return publishCarousel(
    {
      items: payload.items,
      caption: payload.caption,
      locationId: payload.locationId,
    },
    resolvedAuth,
  );
};

export const publishInstagramFirstComment = async (
  mediaId: string,
  comment: string,
  auth?: MetaAuthContext,
) => {
  const resolvedAuth = auth ?? getEnvMetaAuth();
  if (!resolvedAuth) {
    throw new Error("Missing Instagram publishing credentials");
  }

  const trimmed = comment.trim();
  if (!trimmed) {
    throw new Error("First comment cannot be empty");
  }

  const response = await callGraphPost(
    `${mediaId}/comments`,
    new URLSearchParams({
      message: trimmed,
    }),
    resolvedAuth,
  );

  if (!response.id) {
    throw new Error("Meta API did not return comment id");
  }

  return response.id;
};

type LocationSearchGraphResponse = GraphResponse & {
  data?: Array<{
    id?: string;
    name?: string;
    location?: {
      city?: string;
      state?: string;
      country?: string;
      street?: string;
      zip?: string;
    };
  }>;
};

export const searchMetaLocations = async (
  query: string,
  auth?: MetaAuthContext,
): Promise<MetaLocationSearchResult[]> => {
  const resolvedAuth = auth ?? getEnvMetaAuth();
  if (!resolvedAuth) {
    throw new Error("Missing Instagram publishing credentials");
  }

  const trimmed = query.trim();
  if (trimmed.length < 2) {
    throw new Error("Search query must be at least 2 characters.");
  }

  const response = await callGraphGetWithParams<LocationSearchGraphResponse>(
    "search",
    resolvedAuth,
    {
      fields: ["name", "location"],
      params: {
        type: "place",
        q: trimmed,
        limit: "8",
      },
    },
  );

  return (response.data ?? [])
    .flatMap((item) => {
      if (!item.id || !item.name) {
        return [];
      }

      return [{
        id: item.id,
        name: item.name,
        city: item.location?.city,
        state: item.location?.state,
        country: item.location?.country,
        street: item.location?.street,
        zip: item.location?.zip,
      }];
    });
};

type MediaInsights = {
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
};

type InsightsDataItem = {
  name: string;
  values: { value: number }[];
};

type InsightsResponse = {
  data?: InsightsDataItem[];
  error?: { message?: string };
};

export const getMediaInsights = async (
  mediaId: string,
  auth: MetaAuthContext,
): Promise<MediaInsights | null> => {
  try {
    const url = new URL(`https://graph.facebook.com/${auth.graphVersion}/${mediaId}/insights`);
    url.searchParams.set("access_token", auth.accessToken);
    url.searchParams.set("metric", "impressions,reach,likes,comments,saved,shares");

    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }

    const json = (await response.json()) as InsightsResponse;
    if (json.error || !json.data) {
      return null;
    }

    const metricMap = new Map<string, number>();
    for (const item of json.data) {
      metricMap.set(item.name, item.values?.[0]?.value ?? 0);
    }

    return {
      impressions: metricMap.get("impressions") ?? 0,
      reach: metricMap.get("reach") ?? 0,
      likes: metricMap.get("likes") ?? 0,
      comments: metricMap.get("comments") ?? 0,
      saves: metricMap.get("saved") ?? 0,
      shares: metricMap.get("shares") ?? 0,
    };
  } catch {
    return null;
  }
};
