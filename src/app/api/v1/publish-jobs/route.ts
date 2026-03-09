import { z } from "zod";

import { apiError, apiOk } from "@/lib/api/v1/envelope";
import { PublishJobStatusSchema, toPublishJobResource } from "@/lib/api/v1/publish-jobs";
import { resolveActorFromRequest } from "@/services/actors";
import { listPublishJobs } from "@/services/publish-jobs";

export const runtime = "nodejs";

const parseStatuses = (value: string | null) => {
  if (!value) {
    return undefined;
  }

  return z.array(PublishJobStatusSchema).parse(
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
};

const parseLimit = (value: string | null) => {
  if (!value) {
    return undefined;
  }

  return z.coerce.number().int().positive().max(250).parse(value);
};

export async function GET(req: Request) {
  try {
    const actor = await resolveActorFromRequest(req);
    if (!actor) {
      return apiError(401, "AUTH_REQUIRED", "Login required");
    }

    const url = new URL(req.url);
    const rows = await listPublishJobs(actor, {
      statuses: parseStatuses(url.searchParams.get("status")),
      limit: parseLimit(url.searchParams.get("limit")),
    });

    return apiOk({
      jobs: rows.map(toPublishJobResource),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(400, "INVALID_INPUT", "Invalid query parameters");
    }

    console.error("[api/v1/publish-jobs]", error);
    return apiError(500, "INTERNAL_ERROR", "Failed to list publish jobs");
  }
}
