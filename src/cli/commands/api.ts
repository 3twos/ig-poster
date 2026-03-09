import { parseCommandOptions } from "../args";
import { CliError } from "../errors";
import { readJsonInput } from "../input";
import { printJson, printValue } from "../output";
import type { CliContext } from "../context";

type ApiOptions = {
  body?: string;
};

export const runApiCommand = async (ctx: CliContext, argv: string[]) => {
  const { options, positionals } = parseCommandOptions<ApiOptions>(argv, {
    body: "string",
  });
  const [method, routePath] = positionals;

  if (!method || !routePath) {
    throw new CliError("Usage: ig api <METHOD> <PATH> [--body @file.json]");
  }

  const body = options.body ? await readJsonInput(options.body) : undefined;
  const response = await ctx.client.request({
    method: method.toUpperCase(),
    path: routePath,
    body,
  });

  if (ctx.globalOptions.json || typeof response.data === "object") {
    printJson(response.data, ctx.globalOptions.jq);
    return;
  }

  printValue(response.data);
};
