import type { PublishJobRow } from "@/db/schema";
import {
  publishFacebookPageContent,
  publishInstagramContent,
  publishInstagramFirstComment,
  type MetaPublishResult,
  type MetaAuthContext,
} from "@/lib/meta";
import { getMetaMetadataValidationIssues } from "@/lib/meta-schemas";
import type { MetaScheduleRequest } from "@/lib/meta-schemas";

type PublishablePayload = {
  media: MetaScheduleRequest["media"];
  caption: string;
  firstComment?: string | null;
  locationId?: string | null;
  userTags?: MetaScheduleRequest["userTags"] | null;
};

export type PublishExecutionResult = MetaPublishResult;

export type PublishExecutionOutcome = {
  publish: PublishExecutionResult;
  firstCommentWarning?: string;
};

export class UnsupportedPublishDestinationError extends Error {
  readonly destination: PublishJobRow["destination"];

  constructor(destination: PublishJobRow["destination"]) {
    super(`Unsupported publish destination: ${destination}.`);
    this.name = "UnsupportedPublishDestinationError";
    this.destination = destination;
  }
}

const getDestinationValidationError = (
  destination: PublishJobRow["destination"],
  payload: PublishablePayload,
) => getMetaMetadataValidationIssues({
  destination,
  media: payload.media,
  firstComment: payload.firstComment,
  locationId: payload.locationId,
  userTags: payload.userTags,
})[0]?.message;

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

const publishFacebookPayload = async (
  payload: PublishablePayload,
  auth: MetaAuthContext,
): Promise<PublishExecutionOutcome> => {
  const publish = await publishFacebookPageContent(
    {
      ...payload.media,
      caption: payload.caption,
    },
    auth,
  );

  return { publish };
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
  const validationError = getDestinationValidationError(job.destination, job);
  if (validationError) {
    throw new Error(validationError);
  }

  if (job.destination === "instagram") {
    return publishInstagramPayload(job, auth);
  }

  if (job.destination === "facebook") {
    return publishFacebookPayload(job, auth);
  }

  throw new UnsupportedPublishDestinationError(job.destination);
};

export const executeImmediatePublish = async (
  payload: PublishablePayload & {
    destination?: PublishJobRow["destination"];
  },
  auth: MetaAuthContext,
): Promise<PublishExecutionOutcome> =>
  executePublishJob(
    {
      destination: payload.destination ?? "instagram",
      media: payload.media,
      caption: payload.caption,
      firstComment: payload.firstComment ?? null,
      locationId: payload.locationId ?? null,
      userTags: payload.userTags ?? null,
    },
    auth,
  );
