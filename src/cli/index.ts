import {
  expandGlobalArgv,
  finalizeGlobalOptions,
  parseGlobalOptions,
} from "./args";
import { runApiCommand } from "./commands/api";
import { runAssetsCommand } from "./commands/assets";
import { runAuthCommand } from "./commands/auth";
import { runBrandKitsCommand } from "./commands/brand-kits";
import { runChatCommand } from "./commands/chat";
import { runCompletionCommand } from "./commands/completion";
import { runConfigCommand } from "./commands/config";
import { runGenerateCommand } from "./commands/generate";
import { runLinkCommand, runUnlinkCommand } from "./commands/link";
import { runMcpCommand } from "./commands/mcp";
import { runPhotosCommand } from "./commands/photos";
import { runPostsCommand } from "./commands/posts";
import { runPublishCommand } from "./commands/publish";
import { runQueueCommand } from "./commands/queue";
import { runStatusCommand } from "./commands/status";
import { runWatchCommand } from "./commands/watch";
import { createContext } from "./context";
import {
  CliError,
  EXIT_CODES,
  errorCodeFromExitCode,
} from "./errors";
import {
  printJsonErrorEnvelope,
  printStreamJsonEvent,
} from "./output";

const HELP_TEXT = `ig: IG Poster CLI (preview)

Usage:
  ig status
  ig auth <login|logout|status|test|sessions>
  ig assets <upload>
  ig brand-kits <list|get>
  ig chat <ask>
  ig config <list|get|set>
  ig generate <run|refine>
  ig photos <recent|search|import>
  ig link [--host <url>] [--profile <name>] [--brand-kit <id>] [--output-dir <path>]
  ig unlink
  ig completion <bash|zsh|fish>
  ig watch <dir>
  ig mcp
  ig publish (--image <url> | --video <url> | --carousel <url,...>)
  ig api <METHOD> <PATH> [--body @file.json]
  ig posts <list|get|create|update|duplicate|archive>
  ig queue <list|get|cancel|retry|move-to-draft|update>

Global options:
  --flags-file <path>
  --host <url>
  --profile <name>
  --json
  --stream-json
  --jq <expr>
  --timeout <ms>
  --quiet
  --dry-run
`;

export const runCli = async (argv: string[]) => {
  let outputMode: { json?: boolean; streamJson?: boolean } | null =
    detectRequestedOutputMode(argv);

  try {
    const parsed = parseGlobalOptions(argv);
    const [command, ...commandArgs] = parsed.rest;
    const options = finalizeGlobalOptions(parsed.options, {
      command,
      stdoutIsTTY: process.stdout.isTTY,
    });
    outputMode = options;

    if (!command || command === "help" || command === "--help") {
      process.stdout.write(HELP_TEXT);
      return EXIT_CODES.ok;
    }

    if (command === "completion") {
      await runCompletionCommand(commandArgs);
      return EXIT_CODES.ok;
    }

    if (command === "mcp") {
      return runMcpCommand(options, commandArgs);
    }

    const ctx = await createContext(options, {
      refreshAuth: !shouldSkipAuthRefresh(command, commandArgs),
    });

    let result: number | void;
    switch (command) {
      case "status":
        result = await runStatusCommand(ctx);
        break;
      case "auth":
        result = await runAuthCommand(ctx, commandArgs);
        break;
      case "assets":
        result = await runAssetsCommand(ctx, commandArgs);
        break;
      case "config":
        result = await runConfigCommand(ctx, commandArgs);
        break;
      case "generate":
        result = await runGenerateCommand(ctx, commandArgs);
        break;
      case "link":
        result = await runLinkCommand(ctx, commandArgs);
        break;
      case "unlink":
        result = await runUnlinkCommand(ctx, commandArgs);
        break;
      case "publish":
        result = await runPublishCommand(ctx, commandArgs);
        break;
      case "photos":
        result = await runPhotosCommand(ctx, commandArgs);
        break;
      case "brand-kits":
        result = await runBrandKitsCommand(ctx, commandArgs);
        break;
      case "chat":
        result = await runChatCommand(ctx, commandArgs);
        break;
      case "api":
        result = await runApiCommand(ctx, commandArgs);
        break;
      case "posts":
        result = await runPostsCommand(ctx, commandArgs);
        break;
      case "queue":
        result = await runQueueCommand(ctx, commandArgs);
        break;
      case "watch":
        result = await runWatchCommand(ctx, commandArgs);
        break;
      default:
        throw new CliError(`Unknown command: ${command}`);
    }

    return typeof result === "number" ? result : EXIT_CODES.ok;
  } catch (error) {
    const cliError =
      error instanceof CliError
        ? error
        : new CliError(
            error instanceof Error ? error.message : "Unexpected error",
            EXIT_CODES.transport,
          );

    if (outputMode?.streamJson) {
      printStreamJsonEvent({
        type: "error",
        error: {
          code: errorCodeFromExitCode(cliError.exitCode),
          message: cliError.message,
          exitCode: cliError.exitCode,
        },
      });
      return cliError.exitCode;
    }

    if (outputMode?.json) {
      printJsonErrorEnvelope({
        code: errorCodeFromExitCode(cliError.exitCode),
        message: cliError.message,
        exitCode: cliError.exitCode,
      });
      return cliError.exitCode;
    }

    process.stderr.write(`${cliError.message}\n`);
    return cliError.exitCode;
  }
};

const detectRequestedOutputMode = (argv: string[]) => {
  const expandedArgv = safelyExpandGlobalArgv(argv);

  return {
    json: expandedArgv.some(
      (token) => token === "--json" || token.startsWith("--json="),
    ),
    streamJson: expandedArgv.some(
      (token) =>
        token === "--stream-json" || token.startsWith("--stream-json="),
    ),
  };
};

const safelyExpandGlobalArgv = (argv: string[]) => {
  try {
    return expandGlobalArgv(argv);
  } catch {
    return argv;
  }
};

const shouldSkipAuthRefresh = (command: string, commandArgs: string[]) =>
  command === "mcp" ||
  command === "config" ||
  command === "link" ||
  command === "unlink" ||
  command === "photos" ||
  (command === "auth" &&
    (commandArgs[0] === "login" || commandArgs[0] === "logout"));
