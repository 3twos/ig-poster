import { parseCommandOptions } from "../args";
import { CliError } from "../errors";
import { readJsonInput } from "../input";
import { printJson, printKeyValue, printPostsTable } from "../output";
import type { CliContext } from "../context";

type PostSummary = {
  id: string;
  status: string;
  title: string;
  updatedAt: string;
};

type PostsListResponse = {
  ok: true;
  data: {
    posts: PostSummary[];
  };
};

type PostResponse = {
  ok: true;
  data: {
    post: Record<string, unknown>;
  };
};

type ListOptions = {
  status?: string;
  archived?: boolean;
};

type CreateOptions = {
  title?: string;
  body?: string;
};

type UpdateOptions = {
  patch?: string;
};

export const runPostsCommand = async (ctx: CliContext, argv: string[]) => {
  const action = argv[0];

  switch (action) {
    case "list":
      return listPosts(ctx, argv.slice(1));
    case "get":
      return getPost(ctx, argv.slice(1));
    case "create":
      return createPost(ctx, argv.slice(1));
    case "update":
      return updatePost(ctx, argv.slice(1));
    case "duplicate":
      return duplicatePost(ctx, argv.slice(1));
    case "archive":
      return archivePost(ctx, argv.slice(1));
    default:
      throw new CliError("Usage: ig posts <list|get|create|update|duplicate|archive>");
  }
};

const listPosts = async (ctx: CliContext, argv: string[]) => {
  const { options, positionals } = parseCommandOptions<ListOptions>(argv, {
    status: "string",
    archived: "boolean",
  });

  if (positionals.length > 0) {
    throw new CliError("Usage: ig posts list [--status <status>] [--archived]");
  }

  const search = new URLSearchParams();
  if (options.status) {
    search.set("status", options.status);
  }
  if (options.archived) {
    search.set("archived", "true");
  }

  const response = await ctx.client.requestJson<PostsListResponse>({
    method: "GET",
    path: `/api/v1/posts${search.size > 0 ? `?${search.toString()}` : ""}`,
  });

  if (ctx.globalOptions.json) {
    printJson(response, ctx.globalOptions.jq);
    return;
  }

  printPostsTable(response.data.posts);
};

const getPost = async (ctx: CliContext, argv: string[]) => {
  const [id] = argv;
  if (!id) {
    throw new CliError("Usage: ig posts get <id>");
  }

  const response = await ctx.client.requestJson<PostResponse>({
    method: "GET",
    path: `/api/v1/posts/${id}`,
  });

  if (ctx.globalOptions.json) {
    printJson(response, ctx.globalOptions.jq);
    return;
  }

  printJson(response.data.post);
};

const createPost = async (ctx: CliContext, argv: string[]) => {
  const { options, positionals } = parseCommandOptions<CreateOptions>(argv, {
    title: "string",
    body: "string",
  });

  if (positionals.length > 0) {
    throw new CliError("Usage: ig posts create [--title <value>] [--body @file.json]");
  }

  const body = options.body
    ? await readJsonInput<Record<string, unknown>>(options.body)
    : {};
  if (options.title) {
    body.title = options.title;
  }

  const response = await ctx.client.requestJson<PostResponse>({
    method: "POST",
    path: "/api/v1/posts",
    body,
  });

  if (ctx.globalOptions.json) {
    printJson(response, ctx.globalOptions.jq);
    return;
  }

  printKeyValue([
    ["id", String(response.data.post.id ?? "")],
    ["title", String(response.data.post.title ?? "")],
    ["status", String(response.data.post.status ?? "")],
  ]);
};

const updatePost = async (ctx: CliContext, argv: string[]) => {
  const { options, positionals } = parseCommandOptions<UpdateOptions>(argv, {
    patch: "string",
  });
  const [id] = positionals;

  if (!id || !options.patch) {
    throw new CliError("Usage: ig posts update <id> --patch @patch.json");
  }

  const patch = await readJsonInput<Record<string, unknown>>(options.patch);
  const response = await ctx.client.requestJson<PostResponse>({
    method: "PATCH",
    path: `/api/v1/posts/${id}`,
    body: patch,
  });

  if (ctx.globalOptions.json) {
    printJson(response, ctx.globalOptions.jq);
    return;
  }

  printKeyValue([
    ["id", String(response.data.post.id ?? "")],
    ["status", String(response.data.post.status ?? "")],
    ["title", String(response.data.post.title ?? "")],
  ]);
};

const duplicatePost = async (ctx: CliContext, argv: string[]) => {
  const [id] = argv;
  if (!id) {
    throw new CliError("Usage: ig posts duplicate <id>");
  }

  const response = await ctx.client.requestJson<PostResponse>({
    method: "POST",
    path: `/api/v1/posts/${id}/duplicate`,
  });

  if (ctx.globalOptions.json) {
    printJson(response, ctx.globalOptions.jq);
    return;
  }

  printKeyValue([
    ["id", String(response.data.post.id ?? "")],
    ["status", String(response.data.post.status ?? "")],
    ["title", String(response.data.post.title ?? "")],
  ]);
};

const archivePost = async (ctx: CliContext, argv: string[]) => {
  const [id] = argv;
  if (!id) {
    throw new CliError("Usage: ig posts archive <id>");
  }

  const response = await ctx.client.requestJson<PostResponse>({
    method: "POST",
    path: `/api/v1/posts/${id}/archive`,
  });

  if (ctx.globalOptions.json) {
    printJson(response, ctx.globalOptions.jq);
    return;
  }

  printKeyValue([
    ["id", String(response.data.post.id ?? "")],
    ["status", String(response.data.post.status ?? "")],
    ["title", String(response.data.post.title ?? "")],
  ]);
};
