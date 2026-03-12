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
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining('if [[ -z "$command" ]]; then'),
    );
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining("publish"));
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining("chat"));
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining("watch"));
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining("mcp"));
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining("--stream-json"));
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

  it("rejects extra positional arguments", async () => {
    await expect(runCompletionCommand(["bash", "extra"])).rejects.toMatchObject(
      {
        message: "Usage: ig completion <bash|zsh|fish>",
      },
    );
  });
});
