import { NextResponse } from "next/server";

import { isBlobEnabled, putJson, readJsonByPath } from "@/lib/blob-store";
import {
  getUserSettingsPath,
  UserSettingsSchema,
  type UserSettings,
} from "@/lib/user-settings";
import { readWorkspaceSessionFromRequest } from "@/lib/workspace-auth";

export async function GET(req: Request) {
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

  const path = getUserSettingsPath(session.email);
  const settings = await readJsonByPath<UserSettings>(path);

  return NextResponse.json(settings ?? { email: session.email });
}

export async function PUT(req: Request) {
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

  const body = await req.json();
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
  };

  const validated = UserSettingsSchema.parse(merged);
  await putJson(path, validated);

  return NextResponse.json(validated);
}
