export {
  CarouselItemSchema,
  MetaScheduleRequestSchema,
  type CarouselItem,
  type MetaScheduleRequest,
} from "@/lib/meta-schemas";

import type { CarouselItem, MetaScheduleRequest } from "@/lib/meta-schemas";

export type MetaAuthContext = {
  accessToken: string;
  instagramUserId: string;
  graphVersion: string;
};

export const getEnvMetaAuth = (): MetaAuthContext | null => {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const instagramUserId = process.env.INSTAGRAM_BUSINESS_ID;
  const graphVersion = process.env.META_GRAPH_VERSION ?? "v22.0";

  if (!accessToken || !instagramUserId) {
    return null;
  }

  return { accessToken, instagramUserId, graphVersion };
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

const callGraphGet = async (path: string, auth: MetaAuthContext, fields?: string[]) => {
  const url = new URL(`https://graph.facebook.com/${auth.graphVersion}/${path}`);
  url.searchParams.set("access_token", auth.accessToken);
  if (fields?.length) {
    url.searchParams.set("fields", fields.join(","));
  }

  const response = await fetch(url, { cache: "no-store" });
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

const createMediaContainer = (params: URLSearchParams, auth: MetaAuthContext) =>
  callGraphPost(`${auth.instagramUserId}/media`, params, auth);

const publishContainer = (creationId: string, auth: MetaAuthContext) =>
  callGraphPost(
    `${auth.instagramUserId}/media_publish`,
    new URLSearchParams({ creation_id: creationId }),
    auth,
  );

const waitForContainerReady = async (creationId: string, auth: MetaAuthContext) => {
  const maxAttempts = 20;
  const baseDelay = 3000;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const status = await callGraphGet(creationId, auth, ["status_code", "status"]);
    const code = status.status_code ?? status.status ?? "";

    if (["FINISHED", "PUBLISHED", "SUCCESS"].includes(code.toUpperCase())) {
      return;
    }

    if (["ERROR", "EXPIRED"].includes(code.toUpperCase())) {
      throw new Error(`Container ${creationId} failed with status ${code}`);
    }

    const delay = Math.min(baseDelay * Math.pow(1.3, attempt), 15000);
    await sleep(delay);
  }

  throw new Error(`Container ${creationId} did not finish processing in time`);
};

const publishSingleImage = async (
  payload: { imageUrl: string; caption: string },
  auth: MetaAuthContext,
) => {
  const createMedia = await createMediaContainer(
    new URLSearchParams({
      image_url: payload.imageUrl,
      caption: payload.caption,
    }),
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
  payload: { videoUrl: string; caption: string; coverUrl?: string },
  auth: MetaAuthContext,
) => {
  const params = new URLSearchParams({
    media_type: "REELS",
    video_url: payload.videoUrl,
    caption: payload.caption,
    share_to_feed: "true",
  });

  if (payload.coverUrl) {
    params.set("cover_url", payload.coverUrl);
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
    params.set("media_type", "VIDEO");
    params.set("video_url", item.url);
  } else {
    params.set("image_url", item.url);
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
  payload: { items: CarouselItem[]; caption: string },
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
  payload: MetaScheduleRequest["media"] & { caption: string },
  auth?: MetaAuthContext,
) => {
  const resolvedAuth = auth ?? getEnvMetaAuth();
  if (!resolvedAuth) {
    throw new Error("Missing Instagram publishing credentials");
  }

  if (payload.mode === "image") {
    return publishSingleImage(
      { imageUrl: payload.imageUrl, caption: payload.caption },
      resolvedAuth,
    );
  }

  if (payload.mode === "reel") {
    return publishReel(
      {
        videoUrl: payload.videoUrl,
        caption: payload.caption,
        coverUrl: payload.coverUrl,
      },
      resolvedAuth,
    );
  }

  return publishCarousel(
    {
      items: payload.items,
      caption: payload.caption,
    },
    resolvedAuth,
  );
};
