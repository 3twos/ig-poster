import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { apiErrorResponse } from "@/lib/api-error";
import { PublishJobStatusSchema } from "@/lib/meta-schemas";
import { listPublishJobsForOwner } from "@/lib/publish-jobs";
import { hashEmail } from "@/lib/server-utils";
import { readWorkspaceSessionFromRequest } from "@/lib/workspace-auth";

export const runtime = "nodejs";

const ListQuerySchema = z.object({
  status: z.string().optional(),
  limit: z
    .string()
    .optional()
    .transform((value) => {
      if (!value) return undefined;
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) ? parsed : undefined;
    }),
});

export async function GET(req: Request) {
  try {
    const session = await readWorkspaceSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ownerHash = hashEmail(session.email);
    const query = ListQuerySchema.parse(
      Object.fromEntries(new URL(req.url).searchParams.entries()),
    );
    const statuses = query.status
      ? z.array(PublishJobStatusSchema).parse(
          query.status
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean),
        )
      : undefined;

    const jobs = await listPublishJobsForOwner(getDb(), ownerHash, {
      statuses,
      limit: query.limit,
    });

    return NextResponse.json({ jobs });
  } catch (error) {
    const isValidationError = error instanceof z.ZodError;
    return apiErrorResponse(error, {
      fallback: "Could not list publish jobs",
      status: isValidationError ? 400 : 500,
    });
  }
}
