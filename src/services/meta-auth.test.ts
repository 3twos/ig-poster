import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/meta", () => ({
  getEnvMetaAuth: vi.fn(),
}));

vi.mock("@/lib/meta-auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/meta-auth")>(
    "@/lib/meta-auth",
  );
  return {
    ...actual,
    getEncryptionSecret: vi.fn(),
    getMetaConnection: vi.fn(),
  };
});

vi.mock("@/lib/private-credential-store", () => ({
  isCredentialStoreEnabled: vi.fn(),
  listCredentialRecords: vi.fn(),
}));

vi.mock("@/lib/secure", () => ({
  decryptString: vi.fn(),
}));

import { getEnvMetaAuth } from "@/lib/meta";
import { getEncryptionSecret, getMetaConnection } from "@/lib/meta-auth";
import {
  isCredentialStoreEnabled,
  listCredentialRecords,
} from "@/lib/private-credential-store";
import { decryptString } from "@/lib/secure";
import {
  MetaAuthServiceError,
  resolveMetaAuthForApi,
} from "@/services/meta-auth";

const mockedGetEnvMetaAuth = vi.mocked(getEnvMetaAuth);
const mockedGetEncryptionSecret = vi.mocked(getEncryptionSecret);
const mockedGetMetaConnection = vi.mocked(getMetaConnection);
const mockedIsCredentialStoreEnabled = vi.mocked(isCredentialStoreEnabled);
const mockedListCredentialRecords = vi.mocked(listCredentialRecords);
const mockedDecryptString = vi.mocked(decryptString);

const makeConnection = (id: string) => ({
  id,
  createdAt: "2026-03-09T23:00:00.000Z",
  updatedAt: "2026-03-09T23:00:00.000Z",
  graphVersion: "v22.0",
  pageId: `page-${id}`,
  pageName: `Page ${id}`,
  instagramUserId: `ig-${id}`,
  instagramUsername: `user_${id}`,
  instagramName: `User ${id}`,
  instagramPictureUrl: "https://cdn.example.com/profile.jpg",
  tokenExpiresAt: "2026-04-09T23:00:00.000Z",
  encryptedAccessToken: "encrypted-token-12345",
});

describe("resolveMetaAuthForApi", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedGetEncryptionSecret.mockReturnValue("secret");
    mockedDecryptString.mockReturnValue("decrypted-token");
    mockedGetEnvMetaAuth.mockReturnValue(null);
    mockedIsCredentialStoreEnabled.mockReturnValue(false);
    mockedListCredentialRecords.mockResolvedValue([]);
    mockedGetMetaConnection.mockResolvedValue(null);
  });

  it("resolves an explicit stored connection id", async () => {
    mockedIsCredentialStoreEnabled.mockReturnValue(true);
    mockedGetMetaConnection.mockResolvedValue(makeConnection("conn-1"));

    await expect(
      resolveMetaAuthForApi({ connectionId: "conn-1" }),
    ).resolves.toMatchObject({
      source: "oauth",
      auth: {
        accessToken: "decrypted-token",
        instagramUserId: "ig-conn-1",
        pageId: "page-conn-1",
      },
      account: {
        connectionId: "conn-1",
        accountKey: "page-conn-1:ig-conn-1",
        pageId: "page-conn-1",
        pageName: "Page conn-1",
        capabilities: {
          facebook: {
            publishEnabled: true,
            syncMode: "remote_authoritative",
          },
          instagram: {
            publishEnabled: true,
            syncMode: "app_managed",
          },
        },
      },
    });

    expect(mockedGetMetaConnection).toHaveBeenCalledWith("conn-1");
  });

  it("rejects explicit stored connection ids when credential storage is disabled", async () => {
    await expect(
      resolveMetaAuthForApi({ connectionId: "conn-1" }),
    ).rejects.toMatchObject({
      name: "MetaAuthServiceError",
      status: 400,
      message:
        "Stored Meta OAuth connections require POSTGRES_URL or DATABASE_URL.",
    } satisfies Partial<MetaAuthServiceError>);
  });

  it("uses the latest stored connection when none is specified", async () => {
    mockedIsCredentialStoreEnabled.mockReturnValue(true);
    mockedListCredentialRecords.mockResolvedValue([
      { credentialId: "conn-1", payload: makeConnection("conn-1") },
      { credentialId: "conn-2", payload: makeConnection("conn-2") },
    ]);

    await expect(resolveMetaAuthForApi()).resolves.toMatchObject({
      source: "oauth",
      auth: {
        accessToken: "decrypted-token",
        instagramUserId: "ig-conn-2",
        pageId: "page-conn-2",
      },
      account: {
        connectionId: "conn-2",
        accountKey: "page-conn-2:ig-conn-2",
      },
    });
  });

  it("falls back to env auth when no stored connection exists", async () => {
    mockedGetEnvMetaAuth.mockReturnValue({
      accessToken: "env-token",
      instagramUserId: "ig-env",
      pageId: "page-env",
      graphVersion: "v22.0",
    });

    await expect(resolveMetaAuthForApi()).resolves.toEqual({
      source: "env",
      auth: {
        accessToken: "env-token",
        instagramUserId: "ig-env",
        pageId: "page-env",
        graphVersion: "v22.0",
      },
      account: {
        accountKey: "page-env:ig-env",
        pageId: "page-env",
        instagramUserId: "ig-env",
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
      },
    });
  });

  it("returns a connection error when no Meta auth is available", async () => {
    await expect(resolveMetaAuthForApi()).rejects.toMatchObject({
      name: "MetaAuthServiceError",
      status: 401,
    } satisfies Partial<MetaAuthServiceError>);
  });
});
