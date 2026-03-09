import { CliError } from "../errors";
import { printBrandKitsTable, printJson } from "../output";
import type { CliContext } from "../context";

type BrandKitSummary = {
  id: string;
  name: string;
  updatedAt: string;
  isDefault: boolean;
};

type BrandKitsResponse = {
  ok: true;
  data: {
    brandKits: BrandKitSummary[];
  };
};

type BrandKitResponse = {
  ok: true;
  data: {
    brandKit: Record<string, unknown>;
  };
};

export const runBrandKitsCommand = async (ctx: CliContext, argv: string[]) => {
  const action = argv[0];

  switch (action) {
    case "list":
      return listBrandKits(ctx, argv.slice(1));
    case "get":
      return getBrandKit(ctx, argv.slice(1));
    default:
      throw new CliError("Usage: ig brand-kits <list|get>");
  }
};

const listBrandKits = async (ctx: CliContext, argv: string[]) => {
  if (argv.length > 0) {
    throw new CliError("Usage: ig brand-kits list");
  }

  const response = await ctx.client.requestJson<BrandKitsResponse>({
    method: "GET",
    path: "/api/v1/brand-kits",
  });

  if (ctx.globalOptions.json) {
    printJson(response, ctx.globalOptions.jq);
    return;
  }

  printBrandKitsTable(response.data.brandKits);
};

const getBrandKit = async (ctx: CliContext, argv: string[]) => {
  const [id] = argv;
  if (!id) {
    throw new CliError("Usage: ig brand-kits get <id>");
  }

  const response = await ctx.client.requestJson<BrandKitResponse>({
    method: "GET",
    path: `/api/v1/brand-kits/${id}`,
  });

  if (ctx.globalOptions.json) {
    printJson(response, ctx.globalOptions.jq);
    return;
  }

  printJson(response.data.brandKit);
};
