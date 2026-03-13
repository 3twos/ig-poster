import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/cli/context", () => ({
  createContext: vi.fn(async () => ({
    globalOptions: {
      json: false,
      streamJson: false,
      quiet: false,
      noColor: false,
      yes: false,
      dryRun: false,
    },
  })),
}));

vi.mock("@/cli/commands/photos", () => ({
  runPhotosCommand: vi.fn(async () => undefined),
}));

import { createContext } from "@/cli/context";
import { runCli } from "@/cli/index";

describe("runCli auth refresh for photos commands", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("skips auth refresh for bridge-only photos recent", async () => {
    await expect(runCli(["photos", "recent"])).resolves.toBe(0);

    expect(vi.mocked(createContext)).toHaveBeenCalledWith(
      expect.any(Object),
      { refreshAuth: false },
    );
  });

  it("refreshes auth for photos pick because it uploads through the API", async () => {
    await expect(runCli(["photos", "pick"])).resolves.toBe(0);

    expect(vi.mocked(createContext)).toHaveBeenCalledWith(
      expect.any(Object),
      { refreshAuth: true },
    );
  });
});
