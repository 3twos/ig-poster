import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse } from "@/lib/api-error";
import { resolveMetaAuthFromRequest } from "@/lib/meta-auth";
import { searchMetaLocations } from "@/lib/meta";
import { readWorkspaceSessionFromRequest } from "@/lib/workspace-auth";

const MetaLocationSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(80),
});

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const session = await readWorkspaceSessionFromRequest(req);
    if (!session) {
      return NextResponse.json(
        { error: "Workspace authentication required for Meta location search." },
        { status: 401 },
      );
    }

    const url = new URL(req.url);
    const query = MetaLocationSearchQuerySchema.parse({
      q: url.searchParams.get("q") ?? "",
    });
    const resolvedAuth = await resolveMetaAuthFromRequest(req);
    const locations = await searchMetaLocations(query.q, resolvedAuth.auth);

    return NextResponse.json({ locations });
  } catch (error) {
    const isClientError = error instanceof z.ZodError;
    return apiErrorResponse(error, {
      fallback: "Could not search Meta locations",
      status: isClientError ? 400 : 502,
    });
  }
}
