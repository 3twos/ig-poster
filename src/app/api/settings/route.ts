import { NextResponse } from "next/server";

import { isBlobEnabled, putJson, readJsonByPath } from "@/lib/blob-store";
import {
  getUserSettingsPath,
  UserSettingsSchema,
  type UserSettings,
} from "@/lib/user-settings";
import { readWorkspaceSessionFromRequest } from "@/lib/workspace-auth";

export const runtime = "nodejs";

const noStore = (res: NextResponse) => {
  res.headers.set("Cache-Control", "no-store");
  return res;
};

export async function GET(req: Request) {
  try {
    const session = await readWorkspaceSessionFromRequest(req);
    if (!session) {
      return noStore(
        NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
      );
    }

    if (!isBlobEnabled()) {
      return noStore(
        NextResponse.json(
          { error: "Blob storage not configured" },
          { status: 503 },
        ),
      );
    }

    const path = getUserSettingsPath(session.email);
    const raw = await readJsonByPath<unknown>(path);
    const parsed = raw ? UserSettingsSchema.safeParse(raw) : null;

    const fallback: UserSettings = {
      email: session.email,
      updatedAt: new Date().toISOString(),
    };

    const settings = parsed?.success ? parsed.data : fallback;
    return noStore(NextResponse.json(settings));
  } catch {
    return noStore(
      NextResponse.json({ error: "Failed to load settings" }, { status: 500 }),
    );
  }
}

const UpdateBodySchema = UserSettingsSchema.partial().omit({
  email: true,
  updatedAt: true,
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

    const rawBody = await req.json();
    const bodyResult = UpdateBodySchema.safeParse(rawBody);
    if (!bodyResult.success) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }

    const body = bodyResult.data;
    const path = getUserSettingsPath(session.email);
    const existing = await readJsonByPath<UserSettings>(path);

    const merged: UserSettings = {
      ...existing,
      ...body,
      email: session.email,
      updatedAt: new Date().toISOString(),
      brand: {
        ...existing?.brand,
        ...body?.brand,
      },
      aiConfig: {
        ...existing?.aiConfig,
        ...body?.aiConfig,
      },
      promptConfig: {
        ...existing?.promptConfig,
        ...body?.promptConfig,
      },
      brandMemory: {
        ...existing?.brandMemory,
        ...body?.brandMemory,
      },
    };

    const validated = UserSettingsSchema.parse(merged);
    await putJson(path, validated);

    return NextResponse.json(validated);
  } catch {
    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 },
    );
  }
}
