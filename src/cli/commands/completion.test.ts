import { afterEach, describe, expect, it, vi } from "vitest";

import { runCompletionCommand } from "@/cli/commands/completion";

describe("runCompletionCommand", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints a bash completion script", async () => {
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await runCompletionCommand(["bash"]);

    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining("complete -F _ig ig"),
    );
  });

  it("prints a zsh completion script", async () => {
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await runCompletionCommand(["zsh"]);

    expect(stdout).toHaveBeenCalledWith(expect.stringContaining("#compdef ig"));
  });

  it("prints a fish completion script", async () => {
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await runCompletionCommand(["fish"]);

    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining("complete -c ig -f"),
    );
  });
});
