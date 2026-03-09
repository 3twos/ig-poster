import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-error";
import { AssetUploadServiceError, uploadAsset } from "@/services/assets";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const folder = String(formData.get("folder") ?? "assets");
    const asset = await uploadAsset(file instanceof File ? file : null, folder);

    return NextResponse.json({
      id: asset.id,
      name: asset.name,
      url: asset.url,
      pathname: asset.pathname,
      size: asset.size,
    });
  } catch (error) {
    if (error instanceof AssetUploadServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return apiErrorResponse(error, { fallback: "Failed to upload file" });
  }
}
