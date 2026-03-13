import readline from "node:readline";

import type { GlobalOptions } from "../args";
import { CliError, EXIT_CODES } from "../errors";

type JsonRpcId = string | number | null;

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
};

type JsonRpcResponse =
  | {
      jsonrpc: "2.0";
      id: JsonRpcId;
      result: unknown;
    }
  | {
      jsonrpc: "2.0";
      id: JsonRpcId;
      error: {
        code: number;
        message: string;
        data?: unknown;
      };
    };

type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  buildArgv: (args: Record<string, unknown>) => string[];
};

type InvocationResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  parsed: unknown;
};

const SUPPORTED_PROTOCOL_VERSIONS = [
  "2025-11-05",
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
] as const;

const TOOLS: ToolDefinition[] = [
  {
    name: "status",
    description: "Return the current IG Poster auth, provider, and publish-window status.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    buildArgv: () => ["status"],
  },
  {
    name: "brand_kits_list",
    description: "List available brand kits for the current account.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    buildArgv: () => ["brand-kits", "list"],
  },
  {
    name: "posts_list",
    description: "List posts, optionally filtered by status or archive state.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string" },
        archived: { type: "boolean" },
      },
      additionalProperties: false,
    },
    buildArgv: (args) => [
      "posts",
      "list",
      ...(typeof args.status === "string" ? ["--status", args.status] : []),
      ...(args.archived === true ? ["--archived"] : []),
    ],
  },
  {
    name: "posts_get",
    description: "Fetch a single saved post by id.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
      },
      additionalProperties: false,
    },
    buildArgv: (args) => ["posts", "get", expectString(args.id, "id")],
  },
  {
    name: "generate_run",
    description: "Run generation for a saved post id and return the final structured result.",
    inputSchema: {
      type: "object",
      required: ["postId"],
      properties: {
        postId: { type: "string" },
      },
      additionalProperties: false,
    },
    buildArgv: (args) => [
      "generate",
      "run",
      "--post",
      expectString(args.postId, "postId"),
    ],
  },
  {
    name: "generate_refine",
    description: "Refine a saved generated variant for a post.",
    inputSchema: {
      type: "object",
      required: ["postId", "instruction"],
      properties: {
        postId: { type: "string" },
        instruction: { type: "string" },
        variantId: { type: "string" },
      },
      additionalProperties: false,
    },
    buildArgv: (args) => [
      "generate",
      "refine",
      "--post",
      expectString(args.postId, "postId"),
      "--instruction",
      expectString(args.instruction, "instruction"),
      ...(typeof args.variantId === "string" ? ["--variant", args.variantId] : []),
    ],
  },
  {
    name: "photos_recent",
    description: "List recent Apple Photos assets from the local macOS companion bridge.",
    inputSchema: {
      type: "object",
      properties: {
        since: { type: "string" },
        limit: { type: "integer" },
        mediaType: { type: "string", enum: ["image", "video", "live-photo"] },
        favorite: { type: "boolean" },
      },
      additionalProperties: false,
    },
    buildArgv: (args) => [
      "photos",
      "recent",
      ...(typeof args.since === "string" ? ["--since", args.since] : []),
      ...(typeof args.limit === "number" ? ["--limit", String(args.limit)] : []),
      ...(typeof args.mediaType === "string" ? ["--media", args.mediaType] : []),
      ...(args.favorite === true ? ["--favorite"] : []),
    ],
  },
  {
    name: "photos_search",
    description: "Search Apple Photos assets by album/media filters through the local macOS companion bridge.",
    inputSchema: {
      type: "object",
      properties: {
        album: { type: "string" },
        since: { type: "string" },
        limit: { type: "integer" },
        mediaType: { type: "string", enum: ["image", "video", "live-photo"] },
        favorite: { type: "boolean" },
      },
      additionalProperties: false,
    },
    buildArgv: (args) => [
      "photos",
      "search",
      ...(typeof args.album === "string" ? ["--album", args.album] : []),
      ...(typeof args.since === "string" ? ["--since", args.since] : []),
      ...(typeof args.limit === "number" ? ["--limit", String(args.limit)] : []),
      ...(typeof args.mediaType === "string" ? ["--media", args.mediaType] : []),
      ...(args.favorite === true ? ["--favorite"] : []),
    ],
  },
  {
    name: "photos_import",
    description: "Import exported Apple Photos assets through the local companion bridge, then upload them into IG Poster.",
    inputSchema: {
      type: "object",
      properties: {
        ids: {
          type: "array",
          items: { type: "string" },
        },
        folder: {
          type: "string",
          enum: ["assets", "videos", "logos", "renders"],
        },
      },
      additionalProperties: false,
    },
    buildArgv: (args) => [
      "photos",
      "import",
      ...(Array.isArray(args.ids) && args.ids.every((id) => typeof id === "string")
        ? ["--ids", args.ids.join(",")]
        : []),
      ...(typeof args.folder === "string" ? ["--folder", args.folder] : []),
    ],
  },
  {
    name: "chat_ask",
    description: "Ask the IG Poster chat assistant, optionally grounded to a saved post.",
    inputSchema: {
      type: "object",
      required: ["message"],
      properties: {
        message: { type: "string" },
        postId: { type: "string" },
        systemPrompt: { type: "string" },
        temperature: { type: "number" },
      },
      additionalProperties: false,
    },
    buildArgv: (args) => [
      "chat",
      "ask",
      ...(typeof args.postId === "string" ? ["--post", args.postId] : []),
      ...(typeof args.systemPrompt === "string"
        ? ["--system-prompt", args.systemPrompt]
        : []),
      ...(typeof args.temperature === "number"
        ? ["--temperature", String(args.temperature)]
        : []),
      "--message",
      expectString(args.message, "message"),
    ],
  },
  {
    name: "publish",
    description: "Publish or schedule direct media through the CLI publish flow.",
    inputSchema: {
      type: "object",
      required: ["caption"],
      properties: {
        image: { type: "string" },
        video: { type: "string" },
        carousel: { type: "string" },
        cover: { type: "string" },
        caption: { type: "string" },
        firstComment: { type: "string" },
        schedule: { type: "string" },
        locationId: { type: "string" },
        connection: { type: "string" },
        shareToFeed: { type: "boolean" },
        dryRun: { type: "boolean" },
      },
      additionalProperties: false,
    },
    buildArgv: (args) => [
      ...(args.dryRun === true ? ["--dry-run"] : []),
      "publish",
      ...resolvePublishMediaArgs(args),
      "--caption",
      expectString(args.caption, "caption"),
      ...(typeof args.firstComment === "string"
        ? ["--first-comment", args.firstComment]
        : []),
      ...(typeof args.schedule === "string" ? ["--schedule", args.schedule] : []),
      ...(typeof args.locationId === "string"
        ? ["--location-id", args.locationId]
        : []),
      ...(typeof args.connection === "string"
        ? ["--connection", args.connection]
        : []),
      ...(args.shareToFeed === true ? ["--share-to-feed"] : []),
      ...(args.shareToFeed === false ? ["--no-share-to-feed"] : []),
      ...(typeof args.cover === "string" ? ["--cover", args.cover] : []),
    ],
  },
  {
    name: "queue_list",
    description: "List publish jobs from the IG Poster queue.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string" },
        limit: { type: "integer" },
      },
      additionalProperties: false,
    },
    buildArgv: (args) => [
      "queue",
      "list",
      ...(typeof args.status === "string" ? ["--status", args.status] : []),
      ...(typeof args.limit === "number" ? ["--limit", String(args.limit)] : []),
    ],
  },
];

export const runMcpCommand = async (
  baseOptions: GlobalOptions,
  argv: string[],
) => {
  if (argv.length > 0) {
    throw new CliError("Usage: ig mcp");
  }

  process.stdin.setEncoding("utf8");
  const lineReader = readline.createInterface({
    input: process.stdin,
    terminal: false,
    crlfDelay: Infinity,
  });

  for await (const line of lineReader) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const response = await handleMessage(baseOptions, trimmed);
    if (response) {
      process.stdout.write(`${JSON.stringify(response)}\n`);
    }
  }

  return EXIT_CODES.ok;
};

const handleMessage = async (
  baseOptions: GlobalOptions,
  rawLine: string,
): Promise<JsonRpcResponse | null> => {
  let request: JsonRpcRequest;
  try {
    request = JSON.parse(rawLine) as JsonRpcRequest;
  } catch {
    return jsonRpcError(null, -32700, "Invalid JSON.");
  }

  if (request.jsonrpc !== "2.0" || typeof request.method !== "string") {
    return request.id === undefined
      ? null
      : jsonRpcError(request.id ?? null, -32600, "Invalid JSON-RPC request.");
  }

  if (request.method === "notifications/initialized") {
    return null;
  }

  if (request.method === "ping") {
    return request.id === undefined
      ? null
      : {
          jsonrpc: "2.0",
          id: request.id,
          result: {},
        };
  }

  if (request.method === "initialize") {
    if (request.id === undefined) {
      return null;
    }

    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: negotiateProtocolVersion(request.params),
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: "ig",
          version: "0.1.0",
        },
        instructions:
          "Use the exposed tools to inspect posts, run generation, chat, and publish through the IG Poster CLI.",
      },
    };
  }

  if (request.method === "tools/list") {
    if (request.id === undefined) {
      return null;
    }

    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        tools: TOOLS.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      },
    };
  }

  if (request.method === "tools/call") {
    if (request.id === undefined) {
      return null;
    }

    try {
      const result = await callTool(baseOptions, request.params);
      return {
        jsonrpc: "2.0",
        id: request.id,
        result,
      };
    } catch (error) {
      return jsonRpcError(
        request.id,
        -32000,
        error instanceof Error ? error.message : "Tool call failed.",
      );
    }
  }

  return request.id === undefined
    ? null
    : jsonRpcError(request.id ?? null, -32601, `Method not found: ${request.method}`);
};

const callTool = async (
  baseOptions: GlobalOptions,
  params: unknown,
) => {
  const record =
    params && typeof params === "object"
      ? (params as Record<string, unknown>)
      : null;
  const toolName = typeof record?.name === "string" ? record.name : "";
  const tool = TOOLS.find((candidate) => candidate.name === toolName);

  if (!tool) {
    throw new CliError(`Unknown MCP tool: ${toolName}`);
  }

  const args =
    record?.arguments && typeof record.arguments === "object"
      ? (record.arguments as Record<string, unknown>)
      : {};
  const invocation = await invokeCliJson(baseOptions, tool.buildArgv(args));
  const structuredContent =
    invocation.parsed ??
    (invocation.stdout.trim()
      ? { raw: invocation.stdout.trim() }
      : { raw: invocation.stderr.trim() });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(structuredContent, null, 2),
      },
    ],
    structuredContent,
    isError: invocation.exitCode !== EXIT_CODES.ok,
  };
};

const invokeCliJson = async (
  baseOptions: GlobalOptions,
  argv: string[],
): Promise<InvocationResult> => {
  const { runCli } = await import("../index");
  const fullArgv = [
    ...(baseOptions.local ? ["--local"] : []),
    ...(baseOptions.host ? ["--host", baseOptions.host] : []),
    ...(baseOptions.profile ? ["--profile", baseOptions.profile] : []),
    ...(baseOptions.timeoutMs ? ["--timeout", String(baseOptions.timeoutMs)] : []),
    "--json",
    ...argv,
  ];
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);

  try {
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdoutChunks.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderrChunks.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;

    const exitCode = await runCli(fullArgv);
    const stdout = stdoutChunks.join("");
    const stderr = stderrChunks.join("");
    let parsed: unknown = null;

    if (stdout.trim()) {
      try {
        parsed = JSON.parse(stdout);
      } catch {
        parsed = null;
      }
    }

    return {
      exitCode,
      stdout,
      stderr,
      parsed,
    };
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }
};

const jsonRpcError = (
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse => ({
  jsonrpc: "2.0",
  id,
  error: {
    code,
    message,
    ...(data === undefined ? {} : { data }),
  },
});

const negotiateProtocolVersion = (params: unknown) => {
  const requested =
    params &&
    typeof params === "object" &&
    typeof (params as { protocolVersion?: unknown }).protocolVersion === "string"
      ? (params as { protocolVersion: string }).protocolVersion
      : undefined;

  return requested &&
    (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
    ? requested
    : SUPPORTED_PROTOCOL_VERSIONS[0];
};

const expectString = (value: unknown, name: string) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new CliError(`MCP tool argument \`${name}\` must be a non-empty string.`);
  }

  return value;
};

const resolvePublishMediaArgs = (args: Record<string, unknown>) => {
  const mediaEntries = [
    typeof args.image === "string" ? ["--image", args.image] : null,
    typeof args.video === "string" ? ["--video", args.video] : null,
    typeof args.carousel === "string" ? ["--carousel", args.carousel] : null,
  ].filter(Boolean) as string[][];

  if (mediaEntries.length !== 1) {
    throw new CliError(
      "MCP publish requires exactly one of `image`, `video`, or `carousel`.",
    );
  }

  return mediaEntries[0];
};

export const handleMcpMessage = handleMessage;
