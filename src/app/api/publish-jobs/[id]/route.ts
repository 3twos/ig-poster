import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse } from "@/lib/api-error";
import { resolveActorFromRequest } from "@/services/actors";
import {
  MetaMediaPreflightError,
  PublishJobServiceError,
  updatePublishJob,
} from "@/services/publish-jobs";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const actor = await resolveActorFromRequest(req);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;
    const updated = await updatePublishJob(actor, id, await req.json());
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof PublishJobServiceError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    const isClientError = error instanceof z.ZodError ||
      error instanceof MetaMediaPreflightError;
    return apiErrorResponse(error, {
      fallback: "Could not update publish job",
      status: isClientError ? 400 : 500,
    });
  }
}
