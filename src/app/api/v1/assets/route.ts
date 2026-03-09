import { apiError, type ApiErrorCode, apiOk } from "@/lib/api/v1/envelope";
import { toAssetResource } from "@/lib/api/v1/assets";
import { resolveActorFromRequest } from "@/services/actors";
import { AssetUploadServiceError, uploadAsset } from "@/services/assets";

export const runtime = "nodejs";

const errorCodeForStatus = (status: AssetUploadServiceError["status"]): ApiErrorCode =>
  status === 503 ? "INTERNAL_ERROR" : "INVALID_INPUT";

export async function POST(req: Request) {
  try {
    const actor = await resolveActorFromRequest(req);
    if (!actor) {
      return apiError(401, "AUTH_REQUIRED", "Login required");
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const folder = formData.get("folder");
    const asset = await uploadAsset(file instanceof File ? file : null, String(folder ?? ""));

    return apiOk(
      {
        asset: toAssetResource(asset),
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof AssetUploadServiceError) {
      return apiError(error.status, errorCodeForStatus(error.status), error.message);
    }

    console.error("[api/v1/assets]", error);
    return apiError(500, "INTERNAL_ERROR", "Failed to upload asset");
  }
}
