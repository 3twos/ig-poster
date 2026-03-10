import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, unknown>();

vi.mock("@/lib/private-credential-store", () => ({
  isCredentialStoreEnabled: vi.fn(() => true),
  deleteCredentialRecord: vi.fn(async (namespace: string, credentialId: string) =>
    store.delete(`${namespace}:${credentialId}`)),
  putCredentialRecord: vi.fn(async (namespace: string, credentialId: string, payload: unknown) => {
    store.set(`${namespace}:${credentialId}`, structuredClone(payload));
  }),
  readCredentialRecord: vi.fn(async (namespace: string, credentialId: string) => {
    const value = store.get(`${namespace}:${credentialId}`);
    return value ? structuredClone(value) : null;
  }),
  listCredentialRecords: vi.fn(async (namespace: string) =>
    [...store.entries()]
      .filter(([key]) => key.startsWith(`${namespace}:`))
      .map(([key, payload]) => ({
        credentialId: key.slice(namespace.length + 1),
        payload: structuredClone(payload),
      }))),
}));

import type { Actor } from "@/services/actors";
import { hashEmail } from "@/lib/server-utils";
import {
  approveCliDeviceCode,
  createCliDeviceCode,
  createCliAuthorizationCode,
  listCliSessions,
  pollCliDeviceCode,
  refreshCliSession,
  revokeCliSessionById,
  revokeCliSessionByRefreshToken,
  verifyCliAccessToken,
  exchangeCliAuthorizationCode,
} from "@/services/auth/cli";

const actor: Actor = {
  type: "workspace-user",
  subjectId: "user-1",
  email: "person@example.com",
  domain: "example.com",
  ownerHash: hashEmail("person@example.com"),
  authSource: "cookie",
  scopes: [
    "posts:read",
    "posts:write",
    "assets:write",
    "brand-kits:read",
    "queue:read",
    "queue:write",
    "api:raw",
  ],
  issuedAt: "2026-03-08T10:00:00.000Z",
  expiresAt: "2026-03-08T22:00:00.000Z",
};

const buildChallenge = (verifier: string) =>
  createHash("sha256").update(verifier).digest("base64url");

describe("services/auth/cli", () => {
  beforeEach(() => {
    store.clear();
    process.env.WORKSPACE_AUTH_SECRET = "test-workspace-secret";
    process.env.GOOGLE_WORKSPACE_DOMAIN = "example.com";
  });

  it("exchanges an authorization code into access and refresh tokens", async () => {
    const verifier = "v".repeat(64);
    const code = await createCliAuthorizationCode({
      actor,
      codeChallenge: buildChallenge(verifier),
      redirectUri: "http://127.0.0.1:51234/callback",
    });

    const tokens = await exchangeCliAuthorizationCode({
      code,
      codeVerifier: verifier,
      label: "Laptop",
      userAgent: "ig-cli/test",
    });

    expect(tokens.session.label).toBe("Laptop");
    expect(tokens.refreshToken).toContain(`${tokens.session.id}.`);

    const resolvedActor = await verifyCliAccessToken(tokens.accessToken);
    expect(resolvedActor).toMatchObject({
      email: "person@example.com",
      domain: "example.com",
      authSource: "bearer",
      scopes: actor.scopes,
    });

    await expect(listCliSessions(actor)).resolves.toMatchObject([
      {
        id: tokens.session.id,
        label: "Laptop",
        userAgent: "ig-cli/test",
      },
    ]);
  });

  it("rotates the refresh token on refresh", async () => {
    const verifier = "r".repeat(64);
    const code = await createCliAuthorizationCode({
      actor,
      codeChallenge: buildChallenge(verifier),
      redirectUri: "http://127.0.0.1:51234/callback",
    });

    const initial = await exchangeCliAuthorizationCode({
      code,
      codeVerifier: verifier,
    });
    const refreshed = await refreshCliSession(initial.refreshToken, "ig-cli/test");

    expect(refreshed.refreshToken).not.toBe(initial.refreshToken);
    await expect(refreshCliSession(initial.refreshToken)).rejects.toThrow(
      "Invalid refresh token.",
    );
  });

  it("supports session revoke and logout", async () => {
    const verifier = "z".repeat(64);
    const code = await createCliAuthorizationCode({
      actor,
      codeChallenge: buildChallenge(verifier),
      redirectUri: "http://127.0.0.1:51234/callback",
    });

    const tokens = await exchangeCliAuthorizationCode({
      code,
      codeVerifier: verifier,
      label: "Desktop",
    });

    const revoked = await revokeCliSessionById(actor, tokens.session.id);
    expect(revoked.revokedAt).toBeTruthy();
    await expect(refreshCliSession(tokens.refreshToken)).rejects.toThrow(
      "CLI session has been revoked.",
    );
    await expect(revokeCliSessionByRefreshToken(tokens.refreshToken)).resolves.toBe(
      false,
    );
  });

  it("starts, approves, and exchanges a device-code login", async () => {
    const started = await createCliDeviceCode({
      origin: "https://igposter.3twos.com",
      label: "Laptop",
      userAgent: "ig-cli/test",
    });

    await expect(pollCliDeviceCode(started.deviceCode)).resolves.toMatchObject({
      status: "pending",
      intervalSeconds: 5,
    });

    await approveCliDeviceCode({
      actor,
      userCode: started.userCode.toLowerCase(),
    });

    await expect(pollCliDeviceCode(started.deviceCode, "ig-cli/test")).resolves.toMatchObject(
      {
        status: "approved",
        session: {
          label: "Laptop",
          email: actor.email,
        },
      },
    );
  });

  it("marks expired device codes as expired and removes them", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-10T22:00:00.000Z"));

    const started = await createCliDeviceCode({
      origin: "https://igposter.3twos.com",
    });

    vi.setSystemTime(new Date("2026-03-10T22:11:00.000Z"));

    await expect(pollCliDeviceCode(started.deviceCode)).resolves.toMatchObject({
      status: "expired",
    });
    await expect(pollCliDeviceCode(started.deviceCode)).rejects.toThrow(
      "Invalid or expired CLI device code.",
    );

    vi.useRealTimers();
  });

  it("skips invalid stored session payloads when listing sessions", async () => {
    store.set("cli_session:broken", { nope: true });
    const verifier = "y".repeat(64);
    const code = await createCliAuthorizationCode({
      actor,
      codeChallenge: buildChallenge(verifier),
      redirectUri: "http://127.0.0.1:51234/callback",
    });
    await exchangeCliAuthorizationCode({
      code,
      codeVerifier: verifier,
      label: "Laptop",
    });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const sessions = await listCliSessions(actor);

      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.label).toBe("Laptop");
      expect(warning).toHaveBeenCalledWith(
        "[services/auth/cli] Ignoring invalid cli_session record broken",
      );
    } finally {
      warning.mockRestore();
    }
  });
});
