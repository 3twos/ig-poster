import { parseCommandOptions } from "../args";
import type { CliContext } from "../context";
import { CliError } from "../errors";
import { readJsonInput } from "../input";
import { printJson, printKeyValue, printQueueTable } from "../output";

type QueueJobSummary = {
  id: string;
  status: string;
  publishAt: string;
  attempts: number;
  maxAttempts: number;
  postId?: string | null;
};

type QueueListResponse = {
  ok: true;
  data: {
    jobs: QueueJobSummary[];
  };
};

type QueueJobResponse = {
  ok: true;
  data: {
    job: Record<string, unknown>;
  };
};

type ListOptions = {
  status?: string;
  limit?: string;
};

type UpdateOptions = {
  patch?: string;
};

export const runQueueCommand = async (ctx: CliContext, argv: string[]) => {
  const action = argv[0];

  switch (action) {
    case "list":
      return listQueue(ctx, argv.slice(1));
    case "get":
      return getQueueJob(ctx, argv.slice(1));
    case "cancel":
      return cancelQueueJob(ctx, argv.slice(1));
    case "retry":
      return retryQueueJob(ctx, argv.slice(1));
    case "move-to-draft":
      return moveQueueJobToDraft(ctx, argv.slice(1));
    case "update":
      return updateQueueJob(ctx, argv.slice(1));
    default:
      throw new CliError(
        "Usage: ig queue <list|get|cancel|retry|move-to-draft|update>",
      );
  }
};

const listQueue = async (ctx: CliContext, argv: string[]) => {
  const { options, positionals } = parseCommandOptions<ListOptions>(argv, {
    status: "string",
    limit: "string",
  });

  if (positionals.length > 0) {
    throw new CliError("Usage: ig queue list [--status <a,b>] [--limit <n>]");
  }

  const search = new URLSearchParams();
  if (options.status) {
    search.set("status", options.status);
  }
  if (options.limit) {
    search.set("limit", options.limit);
  }

  const response = await ctx.client.requestJson<QueueListResponse>({
    method: "GET",
    path: `/api/v1/publish-jobs${search.size > 0 ? `?${search.toString()}` : ""}`,
  });

  if (ctx.globalOptions.json) {
    printJson(response, ctx.globalOptions.jq);
    return;
  }

  printQueueTable(response.data.jobs);
};

const getQueueJob = async (ctx: CliContext, argv: string[]) => {
  const [id] = argv;
  if (!id) {
    throw new CliError("Usage: ig queue get <id>");
  }

  const response = await ctx.client.requestJson<QueueJobResponse>({
    method: "GET",
    path: `/api/v1/publish-jobs/${id}`,
  });

  if (ctx.globalOptions.json) {
    printJson(response, ctx.globalOptions.jq);
    return;
  }

  printJson(response.data.job);
};

const cancelQueueJob = async (ctx: CliContext, argv: string[]) => {
  const [id] = argv;
  if (!id) {
    throw new CliError("Usage: ig queue cancel <id>");
  }

  return mutateQueueJob(ctx, id, { action: "cancel" });
};

const retryQueueJob = async (ctx: CliContext, argv: string[]) => {
  const [id] = argv;
  if (!id) {
    throw new CliError("Usage: ig queue retry <id>");
  }

  return mutateQueueJob(ctx, id, { action: "retry-now" });
};

const moveQueueJobToDraft = async (ctx: CliContext, argv: string[]) => {
  const [id] = argv;
  if (!id) {
    throw new CliError("Usage: ig queue move-to-draft <id>");
  }

  return mutateQueueJob(ctx, id, { action: "move-to-draft" });
};

const updateQueueJob = async (ctx: CliContext, argv: string[]) => {
  const { options, positionals } = parseCommandOptions<UpdateOptions>(argv, {
    patch: "string",
  });
  const [id] = positionals;

  if (!id || !options.patch) {
    throw new CliError("Usage: ig queue update <id> --patch @patch.json");
  }

  const patch = await readJsonInput<Record<string, unknown>>(options.patch);
  return mutateQueueJob(ctx, id, patch);
};

const mutateQueueJob = async (
  ctx: CliContext,
  id: string,
  body: Record<string, unknown>,
) => {
  const response = await ctx.client.requestJson<QueueJobResponse>({
    method: "PATCH",
    path: `/api/v1/publish-jobs/${id}`,
    body,
  });

  if (ctx.globalOptions.json) {
    printJson(response, ctx.globalOptions.jq);
    return;
  }

  printKeyValue([
    ["id", String(response.data.job.id ?? "")],
    ["status", String(response.data.job.status ?? "")],
    ["publishAt", String(response.data.job.publishAt ?? "")],
    ["postId", String(response.data.job.postId ?? "")],
  ]);
};
