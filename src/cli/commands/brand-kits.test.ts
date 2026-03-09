import { afterEach, describe, expect, it, vi } from "vitest";

import { runBrandKitsCommand } from "@/cli/commands/brand-kits";

describe("runBrandKitsCommand", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requests the v1 list endpoint and prints json when requested", async () => {
    const requestJson = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        brandKits: [{ id: "kit-1", name: "Default", updatedAt: "2026-03-08T10:00:00.000Z", isDefault: true }],
      },
    });
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await runBrandKitsCommand(
      {
        client: { requestJson },
        globalOptions: {
          json: true,
          quiet: false,
          noColor: false,
          yes: false,
          dryRun: false,
        },
      } as never,
      ["list"],
    );

    expect(requestJson).toHaveBeenCalledWith({
      method: "GET",
      path: "/api/v1/brand-kits",
    });
    expect(stdout).toHaveBeenCalled();
  });
});
