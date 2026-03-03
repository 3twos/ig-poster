import { z } from "zod";

export const MetaScheduleRequestSchema = z.object({
  imageUrl: z.string().url(),
  caption: z.string().trim().min(1).max(2200),
  publishAt: z.string().datetime().optional(),
});

export type MetaScheduleRequest = z.infer<typeof MetaScheduleRequestSchema>;

const getMetaConfig = () => {
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
  error?: {
    message?: string;
  };
};

const callGraph = async (path: string, body: URLSearchParams) => {
  const config = getMetaConfig();
  if (!config) {
    throw new Error("Missing INSTAGRAM_ACCESS_TOKEN or INSTAGRAM_BUSINESS_ID");
  }

  body.set("access_token", config.accessToken);

  const response = await fetch(
    `https://graph.facebook.com/${config.graphVersion}/${config.instagramUserId}/${path}`,
    {
      method: "POST",
      body,
      cache: "no-store",
    },
  );

  const json = (await response.json()) as GraphResponse;
  if (!response.ok || json.error) {
    throw new Error(json.error?.message ?? `Meta API call failed on ${path}`);
  }

  return json;
};

export const publishToInstagramNow = async (payload: {
  imageUrl: string;
  caption: string;
}) => {
  const createMedia = await callGraph(
    "media",
    new URLSearchParams({
      image_url: payload.imageUrl,
      caption: payload.caption,
    }),
  );

  if (!createMedia.id) {
    throw new Error("Meta API did not return media creation id");
  }

  const publishMedia = await callGraph(
    "media_publish",
    new URLSearchParams({
      creation_id: createMedia.id,
    }),
  );

  return {
    creationId: createMedia.id,
    publishId: publishMedia.id,
  };
};
