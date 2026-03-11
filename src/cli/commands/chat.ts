import { parseCommandOptions } from "../args";
import type { CliContext } from "../context";
import { CliError, EXIT_CODES } from "../errors";
import { readJsonInput, readTextInput } from "../input";
import { printJsonEnvelope, printStreamJsonEvent } from "../output";

type AskOptions = {
  history?: string;
  message?: string;
  post?: string;
  systemPrompt?: string;
  temperature?: string;
};

type ChatStreamEvent =
  | { type: "token"; content: string }
  | { type: "done"; tokenCount?: number }
  | { type: "error"; detail: string }
  | { type: "heartbeat" };

export const runChatCommand = async (ctx: CliContext, argv: string[]) => {
  const action = argv[0];

  switch (action) {
    case "ask":
      return askChat(ctx, argv.slice(1));
    default:
      throw new CliError("Usage: ig chat <ask>");
  }
};

const askChat = async (ctx: CliContext, argv: string[]) => {
  const { options, positionals } = parseCommandOptions<AskOptions>(argv, {
    history: "string",
    message: "string",
    post: "string",
    "system-prompt": "string",
    temperature: "string",
  });

  if (options.message && positionals.length > 0) {
    throw new CliError(
      "Choose either --message or a positional chat prompt.",
      EXIT_CODES.usage,
    );
  }

  const message = (
    options.message
      ? await readTextInput(options.message)
      : positionals.join(" ")
  ).trim();
  if (!message) {
    throw new CliError(
      "Usage: ig chat ask [--post <id>] [--message <text|@file|->] [--history @history.json] [--temperature <0-2>] [--system-prompt <text>] <message>",
      EXIT_CODES.usage,
    );
  }

  const temperature = parseTemperature(options.temperature);
  const response = await ctx.client.requestStream({
    method: "POST",
    path: "/api/v1/chat",
    headers: {
      accept: "text/event-stream",
    },
    body: {
      message,
      ...(options.post ? { postId: options.post } : {}),
      ...(options.history
        ? {
            history: await readJsonInput<Array<{ role: string; content: string }>>(
              options.history,
            ),
          }
        : {}),
      ...(temperature !== undefined ? { temperature } : {}),
      ...(options.systemPrompt
        ? { systemPrompt: options.systemPrompt }
        : {}),
    },
  });

  const reader = response.body?.getReader();
  if (!reader) {
    throw new CliError("No chat response stream was returned.");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let assistantMessage = "";
  let tokenCount: number | undefined;

  const processLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) {
      return;
    }

    const payload = trimmed.slice("data:".length).trimStart();
    if (!payload) {
      return;
    }

    const event = JSON.parse(payload) as unknown;
    if (!isChatStreamEvent(event)) {
      return;
    }

    if (ctx.globalOptions.streamJson) {
      printStreamJsonEvent(event);
    }

    if (event.type === "error") {
      throw new CliError(event.detail);
    }

    if (event.type === "token") {
      assistantMessage += event.content;
      if (!ctx.globalOptions.streamJson && !ctx.globalOptions.json) {
        process.stdout.write(event.content);
      }
      return;
    }

    if (event.type === "done") {
      tokenCount = event.tokenCount;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const segments = buffer.split("\n");
    buffer = segments.pop() ?? "";
    for (const segment of segments) {
      processLine(segment);
    }
  }

  buffer += decoder.decode();
  if (buffer) {
    processLine(buffer);
  }

  if (ctx.globalOptions.streamJson) {
    return;
  }

  if (ctx.globalOptions.json) {
    printJsonEnvelope(
      {
        message: assistantMessage,
        tokenCount: tokenCount ?? null,
      },
      ctx.globalOptions.jq,
    );
    return;
  }

  if (assistantMessage && !assistantMessage.endsWith("\n")) {
    process.stdout.write("\n");
  }
};

const parseTemperature = (value?: string) => {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 2) {
    throw new CliError(
      `Invalid temperature value: ${value}`,
      EXIT_CODES.usage,
    );
  }

  return parsed;
};

const isChatStreamEvent = (value: unknown): value is ChatStreamEvent => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const event = value as Record<string, unknown>;
  if (event.type === "token") {
    return typeof event.content === "string";
  }
  if (event.type === "done") {
    return (
      event.tokenCount === undefined || typeof event.tokenCount === "number"
    );
  }
  if (event.type === "error") {
    return typeof event.detail === "string";
  }
  return event.type === "heartbeat";
};
