import { z } from "zod";

import { apiError, type ApiErrorCode, apiOk } from "@/lib/api/v1/envelope";
import { toPublishJobResource } from "@/lib/api/v1/publish-jobs";
import { resolveActorFromRequest } from "@/services/actors";
import {
  MetaMediaPreflightError,
  getPublishJob,
  PublishJobServiceError,
  updatePublishJob,
} from "@/services/publish-jobs";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const errorCodeForStatus = (status: PublishJobServiceError["status"]): ApiErrorCode => {
  switch (status) {
    case 400:
      return "INVALID_INPUT";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    default:
      return "INTERNAL_ERROR";
  }
};

export async function GET(
  req: Request,
  { params }: RouteContext,
) {
  try {
    const actor = await resolveActorFromRequest(req);
    if (!actor) {
      return apiError(401, "AUTH_REQUIRED", "Login required");
    }

    const { id } = await params;
    const row = await getPublishJob(actor, id);
    if (!row) {
      return apiError(404, "NOT_FOUND", "Publish job not found");
    }

    return apiOk({
      job: toPublishJobResource(row),
    });
  } catch (error) {
    console.error("[api/v1/publish-jobs/id]", error);
    return apiError(500, "INTERNAL_ERROR", "Failed to load publish job");
  }
}

export async function PATCH(
  req: Request,
  { params }: RouteContext,
) {
  try {
    const actor = await resolveActorFromRequest(req);
    if (!actor) {
      return apiError(401, "AUTH_REQUIRED", "Login required");
    }

    const { id } = await params;
    const row = await updatePublishJob(actor, id, await req.json());
    return apiOk({
      job: toPublishJobResource(row),
    });
  } catch (error) {
    if (
      error instanceof SyntaxError ||
      error instanceof z.ZodError ||
      error instanceof MetaMediaPreflightError
    ) {
      return apiError(400, "INVALID_INPUT", "Invalid request body");
    }

    if (error instanceof PublishJobServiceError) {
      return apiError(error.status, errorCodeForStatus(error.status), error.message);
    }

    console.error("[api/v1/publish-jobs/id]", error);
    return apiError(500, "INTERNAL_ERROR", "Failed to update publish job");
  }
}
