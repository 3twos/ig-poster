import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse } from "@/lib/api-error";
import { searchMetaLocations } from "@/lib/meta";
import { hashEmail } from "@/lib/server-utils";
import { readWorkspaceSessionFromRequest } from "@/lib/workspace-auth";
import { resolveMetaAuthForRequest } from "@/services/meta-auth";

const MetaLocationSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(80),
});

class MetaLocationSearchClientError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "MetaLocationSearchClientError";
    this.status = status;
  }
}

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
    let resolvedAuth;
    try {
      resolvedAuth = await resolveMetaAuthForRequest(req, {
        ownerHash: hashEmail(session.email),
      });
    } catch (error) {
      throw new MetaLocationSearchClientError(
        error instanceof Error
          ? error.message
          : "Instagram account is not connected for Meta location search.",
        401,
      );
    }
    const locations = await searchMetaLocations(query.q, resolvedAuth.auth);

    return NextResponse.json({ locations });
  } catch (error) {
    const isClientError =
      error instanceof z.ZodError ||
      error instanceof MetaLocationSearchClientError;
    return apiErrorResponse(error, {
      fallback: error instanceof MetaLocationSearchClientError
        ? error.message
        : "Could not search Meta locations",
      status: error instanceof MetaLocationSearchClientError
        ? error.status
        : isClientError
          ? 400
          : 502,
    });
  }
}
