import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse } from "@/lib/api-error";
import { isBlobEnabled, putJson, readJsonByPath } from "@/lib/blob-store";
import { MultiModelModeSchema } from "@/lib/llm-constants";
import {
  getUserSettingsPath,
  UserSettingsSchema,
  type UserSettings,
} from "@/lib/user-settings";
import { readWorkspaceSessionFromRequest } from "@/lib/workspace-auth";

export const runtime = "nodejs";

const ReorderSchema = z.object({
  connectionOrder: z.array(z.string().min(1)).max(10),
  mode: MultiModelModeSchema,
});

export async function PUT(req: Request) {
  try {
    const session = await readWorkspaceSessionFromRequest(req);
    if (!session) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 },
      );
    }

    if (!isBlobEnabled()) {
      return NextResponse.json(
        { error: "Blob storage not configured" },
        { status: 503 },
      );
    }

    const body = ReorderSchema.parse(await req.json());
    const path = getUserSettingsPath(session.email);
    const existing = await readJsonByPath<UserSettings>(path);

    const merged: UserSettings = {
      ...existing,
      email: session.email,
      updatedAt: new Date().toISOString(),
      aiConfig: {
        ...existing?.aiConfig,
        mode: body.mode,
        connectionOrder: body.connectionOrder,
      },
    };

    const validated = UserSettingsSchema.parse(merged);
    await putJson(path, validated);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, {
      fallback: "Failed to save model ordering",
      status: 400,
    });
  }
}
