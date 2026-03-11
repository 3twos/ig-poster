import { parseCommandOptions } from "../args";
import type { CliContext } from "../context";
import { CliError } from "../errors";
import { printAssetsTable, printJson } from "../output";
import {
  buildUploadFormData,
  type UploadedAsset,
} from "../upload";

type UploadOptions = {
  folder?: string;
};

type AssetResponse = {
  ok: true;
  data: {
    asset: UploadedAsset;
  };
};

export const runAssetsCommand = async (ctx: CliContext, argv: string[]) => {
  const action = argv[0];

  switch (action) {
    case "upload":
      return uploadAssets(ctx, argv.slice(1));
    default:
      throw new CliError("Usage: ig assets <upload>");
  }
};

const uploadAssets = async (ctx: CliContext, argv: string[]) => {
  const { options, positionals } = parseCommandOptions<UploadOptions>(argv, {
    folder: "string",
  });

  if (positionals.length === 0) {
    throw new CliError(
      "Usage: ig assets upload <file...> [--folder <assets|videos|logos|renders>]",
    );
  }

  const uploaded: UploadedAsset[] = [];
  for (const filePath of positionals) {
    const body = await buildUploadFormData(filePath, options.folder);
    const response = await ctx.client.requestJson<AssetResponse>({
      method: "POST",
      path: "/api/v1/assets",
      body,
    });
    uploaded.push(response.data.asset);
  }

  const result = { ok: true, data: { assets: uploaded } };
  if (ctx.globalOptions.json) {
    printJson(result, ctx.globalOptions.jq);
    return;
  }

  printAssetsTable(uploaded);
};
