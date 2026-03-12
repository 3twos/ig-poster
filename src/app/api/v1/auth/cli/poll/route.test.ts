import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/auth/cli", () => ({
  CliAuthServiceError: class CliAuthServiceError extends Error {
    readonly status: 400 | 401 | 404 | 503;

    constructor(status: 400 | 401 | 404 | 503, message: string) {
      super(message);
      this.status = status;
    }
  },
  pollCliDeviceCode: vi.fn(),
}));

import { POST } from "@/app/api/v1/auth/cli/poll/route";
import { pollCliDeviceCode } from "@/services/auth/cli";

const mockedPollCliDeviceCode = vi.mocked(pollCliDeviceCode);

describe("POST /api/v1/auth/cli/poll", () => {
  beforeEach(() => {
    mockedPollCliDeviceCode.mockReset();
  });

  it("returns pending device-code status", async () => {
    mockedPollCliDeviceCode.mockResolvedValue({
      status: "pending",
      expiresAt: "2026-03-10T23:00:00.000Z",
      intervalSeconds: 5,
    });

    const response = await POST(
      new Request("https://app.example.com/api/v1/auth/cli/poll", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "ig-cli/test",
        },
        body: JSON.stringify({ deviceCode: "device-code-123" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockedPollCliDeviceCode).toHaveBeenCalledWith(
      "device-code-123",
      "ig-cli/test",
    );
  });

  it("returns 400 for invalid poll payloads", async () => {
    const response = await POST(
      new Request("https://app.example.com/api/v1/auth/cli/poll", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
  });
});
