import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/blob-store", () => ({
  readJsonByPath: vi.fn(),
}));

vi.mock("@/lib/publish-jobs", () => ({
  getPublishWindowUsage: vi.fn(),
}));

vi.mock("@/services/meta-auth", () => ({
  resolveMetaAuthForApi: vi.fn(),
}));

import { getDb } from "@/db";
import { readJsonByPath } from "@/lib/blob-store";
import { getPublishWindowUsage } from "@/lib/publish-jobs";
import type { Actor } from "@/services/actors";
import { resolveMetaAuthForApi } from "@/services/meta-auth";
import { getApiStatus } from "@/services/status";

const mockedGetDb = vi.mocked(getDb);
const mockedReadJsonByPath = vi.mocked(readJsonByPath);
const mockedGetPublishWindowUsage = vi.mocked(getPublishWindowUsage);
const mockedResolveMetaAuthForApi = vi.mocked(resolveMetaAuthForApi);

const actor: Actor = {
  type: "workspace-user",
  subjectId: "user-1",
  email: "person@example.com",
  domain: "example.com",
  ownerHash: "owner-hash",
  authSource: "bearer",
  scopes: ["posts:read"],
  issuedAt: "2026-03-10T10:00:00.000Z",
  expiresAt: "2026-03-10T11:00:00.000Z",
};

describe("getApiStatus", () => {
  beforeEach(() => {
    mockedGetDb.mockReset();
    mockedReadJsonByPath.mockReset();
    mockedGetPublishWindowUsage.mockReset();
    mockedResolveMetaAuthForApi.mockReset();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("aggregates meta, llm, and publish window state", async () => {
    mockedResolveMetaAuthForApi.mockResolvedValueOnce({
      source: "oauth",
      auth: {
        accessToken: "secret",
        instagramUserId: "ig_123",
        pageId: "page_123",
        graphVersion: "v22.0",
      },
      account: {
        connectionId: "meta-1",
        accountKey: "page_123:ig_123",
        pageId: "page_123",
        instagramUserId: "ig_123",
        instagramUsername: "brand",
        pageName: "Brand Page",
        capabilities: {
          facebook: {
            destination: "facebook",
            publishEnabled: true,
            syncMode: "remote_authoritative",
            sourceOfTruth: "meta",
          },
          instagram: {
            destination: "instagram",
            publishEnabled: true,
            syncMode: "app_managed",
            sourceOfTruth: "app",
          },
        },
        tokenExpiresAt: "2026-03-20T00:00:00.000Z",
      },
    });
    mockedReadJsonByPath.mockResolvedValueOnce({
      aiConfig: {
        mode: "parallel",
        connectionOrder: ["env-anthropic", "env-openai"],
      },
    });
    mockedGetDb.mockReturnValueOnce({} as never);
    mockedGetPublishWindowUsage.mockResolvedValueOnce({
      limit: 50,
      used: 12,
      remaining: 38,
      windowStart: new Date("2026-03-09T12:00:00.000Z"),
    });
    vi.stubEnv("OPENAI_API_KEY", "openai-secret");
    vi.stubEnv("ANTHROPIC_API_KEY", "anthropic-secret");

    const status = await getApiStatus(actor);

    expect(status.actor.email).toBe("person@example.com");
    expect(status.meta).toMatchObject({
      connected: true,
      source: "oauth",
      account: {
        instagramUsername: "brand",
        pageName: "Brand Page",
      },
    });
    expect(status.llm).toMatchObject({
      connected: true,
      mode: "parallel",
      source: "env",
      provider: "anthropic",
    });
    expect(status.llm.connections.map((connection) => connection.id)).toEqual([
      "env-anthropic",
      "env-openai",
    ]);
    expect(status.publishWindow).toEqual({
      available: true,
      limit: 50,
      used: 12,
      remaining: 38,
      windowStart: "2026-03-09T12:00:00.000Z",
    });
    expect(mockedResolveMetaAuthForApi).toHaveBeenCalledWith({
      ownerHash: "owner-hash",
    });
  });

  it("returns graceful fallback details when remote status is unavailable", async () => {
    mockedResolveMetaAuthForApi.mockRejectedValueOnce(new Error("Not connected"));
    mockedReadJsonByPath.mockRejectedValueOnce(new Error("Blob unavailable"));
    mockedGetDb.mockImplementationOnce(() => {
      throw new Error("Database URL is not set. Configure POSTGRES_URL or DATABASE_URL.");
    });

    const status = await getApiStatus(actor);

    expect(status.meta).toEqual({
      connected: false,
      source: null,
      detail: "Not connected",
    });
    expect(status.llm).toMatchObject({
      connected: false,
      mode: "fallback",
      connections: [],
      source: null,
    });
    expect(status.publishWindow).toEqual({
      available: false,
      limit: null,
      used: null,
      remaining: null,
      windowStart: null,
      detail: "Database URL is not set. Configure POSTGRES_URL or DATABASE_URL.",
    });
  });
});
