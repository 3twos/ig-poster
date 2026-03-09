import { parseGlobalOptions } from "./args";
import { runApiCommand } from "./commands/api";
import { runAssetsCommand } from "./commands/assets";
import { runAuthCommand } from "./commands/auth";
import { runBrandKitsCommand } from "./commands/brand-kits";
import { runConfigCommand } from "./commands/config";
import { runPostsCommand } from "./commands/posts";
import { runQueueCommand } from "./commands/queue";
import { runStatusCommand } from "./commands/status";
import { createContext } from "./context";
import { CliError, EXIT_CODES } from "./errors";

const HELP_TEXT = `ig: IG Poster CLI (preview)

Usage:
  ig status
  ig auth <login|logout|status|test>
  ig assets <upload>
  ig brand-kits <list|get>
  ig config <list|get|set>
  ig api <METHOD> <PATH> [--body @file.json]
  ig posts <list|get|create|update|duplicate|archive>
  ig queue <list|get|cancel|retry|move-to-draft|update>

Global options:
  --host <url>
  --profile <name>
  --json
  --jq <expr>
  --timeout <ms>
  --quiet
  --dry-run
`;

export const runCli = async (argv: string[]) => {
  try {
    const { options, rest } = parseGlobalOptions(argv);
    const [command, ...commandArgs] = rest;

    if (!command || command === "help" || command === "--help") {
      process.stdout.write(HELP_TEXT);
      return EXIT_CODES.ok;
    }

    const ctx = await createContext(options);

    switch (command) {
      case "status":
        await runStatusCommand(ctx);
        break;
      case "auth":
        await runAuthCommand(ctx, commandArgs);
        break;
      case "assets":
        await runAssetsCommand(ctx, commandArgs);
        break;
      case "config":
        await runConfigCommand(ctx, commandArgs);
        break;
      case "brand-kits":
        await runBrandKitsCommand(ctx, commandArgs);
        break;
      case "api":
        await runApiCommand(ctx, commandArgs);
        break;
      case "posts":
        await runPostsCommand(ctx, commandArgs);
        break;
      case "queue":
        await runQueueCommand(ctx, commandArgs);
        break;
      default:
        throw new CliError(`Unknown command: ${command}`);
    }

    return EXIT_CODES.ok;
  } catch (error) {
    if (error instanceof CliError) {
      process.stderr.write(`${error.message}\n`);
      return error.exitCode;
    }

    process.stderr.write(
      `${error instanceof Error ? error.message : "Unexpected error"}\n`,
    );
    return EXIT_CODES.transport;
  }
};
