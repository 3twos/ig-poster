import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/facebook-page-webhooks", () => ({
  handleFacebookPageWebhook: vi.fn(),
}));

import { GET, POST } from "@/app/api/webhooks/meta/page/route";
import { handleFacebookPageWebhook } from "@/services/facebook-page-webhooks";

const mockedHandleFacebookPageWebhook = vi.mocked(handleFacebookPageWebhook);

describe("/api/webhooks/meta/page", () => {
  beforeEach(() => {
    mockedHandleFacebookPageWebhook.mockReset();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the challenge when the verify token matches", async () => {
    vi.stubEnv("META_WEBHOOK_VERIFY_TOKEN", "verify-me");

    const response = await GET(
      new Request(
        "http://localhost/api/webhooks/meta/page?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345",
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("12345");
  });

  it("rejects GET verification when the token is invalid", async () => {
    vi.stubEnv("META_WEBHOOK_VERIFY_TOKEN", "verify-me");

    const response = await GET(
      new Request(
        "http://localhost/api/webhooks/meta/page?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=12345",
      ),
    );

    expect(response.status).toBe(403);
  });

  it("rejects POST payloads with an invalid signature when an app secret is configured", async () => {
    vi.stubEnv("META_APP_SECRET", "app-secret");

    const response = await POST(
      new Request("http://localhost/api/webhooks/meta/page", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-hub-signature-256": "sha256=bad",
        },
        body: JSON.stringify({
          object: "page",
          entry: [{ id: "page-id" }],
        }),
      }),
    );

    expect(response.status).toBe(401);
    expect(mockedHandleFacebookPageWebhook).not.toHaveBeenCalled();
  });

  it("processes valid POST payloads", async () => {
    mockedHandleFacebookPageWebhook.mockResolvedValue({
      ignored: false,
      receivedEntries: 1,
      pageIds: ["page-id"],
      matchedAccounts: 1,
      syncedAccounts: 1,
      failures: 0,
      unmatchedPageIds: [],
    });

    const payload = JSON.stringify({
      object: "page",
      entry: [{ id: "page-id", changes: [{ field: "feed" }] }],
    });

    const response = await POST(
      new Request("http://localhost/api/webhooks/meta/page", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: payload,
      }),
    );

    expect(response.status).toBe(200);
    expect(mockedHandleFacebookPageWebhook).toHaveBeenCalledWith(
      JSON.parse(payload),
    );
    await expect(response.json()).resolves.toEqual({
      received: true,
      result: {
        ignored: false,
        receivedEntries: 1,
        pageIds: ["page-id"],
        matchedAccounts: 1,
        syncedAccounts: 1,
        failures: 0,
        unmatchedPageIds: [],
      },
    });
  });
});
