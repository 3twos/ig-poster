import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/actors", () => ({
  requireActorFromRequest: vi.fn(),
}));

vi.mock("@/services/auth/cli", () => ({
  CliAuthServiceError: class CliAuthServiceError extends Error {
    readonly status: 400 | 401 | 404 | 503;

    constructor(status: 400 | 401 | 404 | 503, message: string) {
      super(message);
      this.status = status;
    }
  },
  approveCliDeviceCode: vi.fn(),
}));

import { POST } from "@/app/api/auth/cli/device/approve/route";
import { requireActorFromRequest } from "@/services/actors";
import { approveCliDeviceCode } from "@/services/auth/cli";

const mockedRequireActorFromRequest = vi.mocked(requireActorFromRequest);
const mockedApproveCliDeviceCode = vi.mocked(approveCliDeviceCode);

describe("POST /api/auth/cli/device/approve", () => {
  beforeEach(() => {
    mockedRequireActorFromRequest.mockReset();
    mockedApproveCliDeviceCode.mockReset();
  });

  it("redirects to the success page after approval", async () => {
    mockedRequireActorFromRequest.mockResolvedValue({
      type: "workspace-user",
      subjectId: "user-1",
      email: "person@example.com",
      domain: "example.com",
      ownerHash: "owner-1",
      authSource: "cookie",
      scopes: ["posts:read"],
      issuedAt: "2026-03-10T22:00:00.000Z",
      expiresAt: "2026-03-11T10:00:00.000Z",
    });
    mockedApproveCliDeviceCode.mockResolvedValue({
      userCode: "ABCD-EFGH",
      email: "person@example.com",
      expiresAt: "2026-03-10T23:00:00.000Z",
      approvedAt: "2026-03-10T22:30:00.000Z",
    });

    const formData = new FormData();
    formData.set("user_code", "ABCD-EFGH");

    const response = await POST(
      new Request("https://app.example.com/api/auth/cli/device/approve", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.example.com/cli/device?user_code=ABCD-EFGH&status=approved",
    );
  });
});
