import type { PublishJobRow } from "@/db/schema";
import {
  publishInstagramContent,
  publishInstagramFirstComment,
  type MetaAuthContext,
} from "@/lib/meta";
import type { MetaScheduleRequest } from "@/lib/meta-schemas";

type PublishablePayload = {
  media: MetaScheduleRequest["media"];
  caption: string;
  firstComment?: string | null;
  locationId?: string | null;
  userTags?: MetaScheduleRequest["userTags"] | null;
};

export type PublishExecutionResult = Awaited<
  ReturnType<typeof publishInstagramContent>
>;

export type PublishExecutionOutcome = {
  publish: PublishExecutionResult;
  firstCommentWarning?: string;
};

export class UnsupportedPublishDestinationError extends Error {
  readonly destination: PublishJobRow["destination"];

  constructor(destination: PublishJobRow["destination"]) {
    super(
      destination === "facebook"
        ? "Facebook publish execution is not implemented yet."
        : `Unsupported publish destination: ${destination}.`,
    );
    this.name = "UnsupportedPublishDestinationError";
    this.destination = destination;
  }
}

const publishInstagramPayload = async (
  payload: PublishablePayload,
  auth: MetaAuthContext,
): Promise<PublishExecutionOutcome> => {
  const publish = await publishInstagramContent(
    {
      ...payload.media,
      caption: payload.caption,
      locationId: payload.locationId ?? undefined,
      userTags: payload.userTags ?? undefined,
    },
    auth,
  );

  if (!payload.firstComment) {
    return { publish };
  }

  if (!publish.publishId) {
    return {
      publish,
      firstCommentWarning:
        "Published media id unavailable; could not post first comment.",
    };
  }

  try {
    await publishInstagramFirstComment(
      publish.publishId,
      payload.firstComment,
      auth,
    );
    return { publish };
  } catch (error) {
    return {
      publish,
      firstCommentWarning:
        error instanceof Error
          ? error.message
          : "Could not post first comment.",
    };
  }
};

export const executePublishJob = async (
  job: Pick<
    PublishJobRow,
    | "destination"
    | "caption"
    | "firstComment"
    | "locationId"
    | "userTags"
    | "media"
  >,
  auth: MetaAuthContext,
): Promise<PublishExecutionOutcome> => {
  if (job.destination === "instagram") {
    return publishInstagramPayload(job, auth);
  }

  throw new UnsupportedPublishDestinationError(job.destination);
};

export const executeImmediateInstagramPublish = async (
  payload: PublishablePayload,
  auth: MetaAuthContext,
): Promise<PublishExecutionOutcome> =>
  publishInstagramPayload(payload, auth);
