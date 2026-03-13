import {
  APPLE_PHOTOS_COMPANION_APP_NAME,
  buildApplePhotosCompanionLaunchUrl,
  getApplePhotosBridgeUrls,
  type ApplePhotosBridgeHealthResponse,
} from "@/lib/apple-photos-bridge";

export type ApplePhotosFallbackInfo = {
  code:
    | "MACOS_COMPANION_REQUIRED"
    | "MACOS_BRIDGE_UNAVAILABLE"
    | "UNSUPPORTED_PLATFORM";
  title: string;
  description: string;
  actionLabel: string;
};

export type ApplePhotosBridgeProbeResult =
  | {
      available: true;
      health: ApplePhotosBridgeHealthResponse;
      launchUrl: string;
    }
  | {
      available: false;
      code: "MACOS_BRIDGE_UNAVAILABLE";
      message: string;
    };

export const APPLE_PHOTOS_BRIDGE_PROBE_TIMEOUT_MS = 1_500;

export const isMacOsUserAgent = (userAgent: string) =>
  /(Macintosh|Mac OS X)/i.test(userAgent) && !/(iPhone|iPad|iPod)/i.test(userAgent);

export const getApplePhotosFallbackInfo = (
  userAgent: string,
  code:
    | "MACOS_BRIDGE_UNAVAILABLE"
    | "MACOS_COMPANION_REQUIRED" = "MACOS_COMPANION_REQUIRED",
): ApplePhotosFallbackInfo => {
  if (isMacOsUserAgent(userAgent)) {
    if (code === "MACOS_BRIDGE_UNAVAILABLE") {
      return {
        code,
        title: "Bridge unavailable, use regular upload for now",
        description:
          `${APPLE_PHOTOS_COMPANION_APP_NAME} did not expose a reachable local bridge on this Mac. Start the bridge if it is installed, or keep working by uploading files you have already exported from Photos.`,
        actionLabel: "Use regular upload",
      };
    }

    return {
      code,
      title: "Use regular upload for now",
      description:
        `Apple Photos import will eventually launch ${APPLE_PHOTOS_COMPANION_APP_NAME} from this draft. Until that signed helper is installed on this Mac, keep working by uploading files you have already exported from Photos.`,
      actionLabel: "Use regular upload",
    };
  }

  return {
    code: "UNSUPPORTED_PLATFORM",
    title: "Apple Photos import is planned for macOS",
    description:
      `This draft editor will eventually hand off to ${APPLE_PHOTOS_COMPANION_APP_NAME} for Apple Photos browsing. On this device, keep using the regular upload flow for exported files.`,
    actionLabel: "Use regular upload",
  };
};

const isApplePhotosBridgeHealthResponse = (
  value: unknown,
): value is ApplePhotosBridgeHealthResponse => {
  if (!value || typeof value !== "object") return false;

  const candidate = value as ApplePhotosBridgeHealthResponse;
  return (
    typeof candidate.appName === "string" &&
    typeof candidate.version === "string" &&
    typeof candidate.bridge?.origin === "string" &&
    typeof candidate.bridge?.healthUrl === "string" &&
    Array.isArray(candidate.capabilities)
  );
};

export const probeApplePhotosBridge = async ({
  fetchImpl = fetch,
  timeoutMs = APPLE_PHOTOS_BRIDGE_PROBE_TIMEOUT_MS,
  returnTo,
  draftId,
  profile,
}: {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  returnTo?: string;
  draftId?: string;
  profile?: string;
} = {}): Promise<ApplePhotosBridgeProbeResult> => {
  const bridgeUrls = getApplePhotosBridgeUrls();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(bridgeUrls.healthUrl, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        available: false,
        code: "MACOS_BRIDGE_UNAVAILABLE",
        message:
          "The local Apple Photos bridge did not return a healthy response.",
      };
    }

    const payload: unknown = await response.json();
    if (!isApplePhotosBridgeHealthResponse(payload)) {
      return {
        available: false,
        code: "MACOS_BRIDGE_UNAVAILABLE",
        message:
          "The local Apple Photos bridge returned an unexpected health payload.",
      };
    }

    if (payload.bridge.origin !== bridgeUrls.origin) {
      return {
        available: false,
        code: "MACOS_BRIDGE_UNAVAILABLE",
        message:
          "The local Apple Photos bridge advertised an unexpected origin.",
      };
    }

    return {
      available: true,
      health: payload,
      launchUrl: buildApplePhotosCompanionLaunchUrl("pick", {
        returnTo,
        draftId,
        profile,
        bridgeOrigin: bridgeUrls.origin,
      }),
    };
  } catch {
    return {
      available: false,
      code: "MACOS_BRIDGE_UNAVAILABLE",
      message:
        "The local Apple Photos bridge is not running on this Mac yet.",
    };
  } finally {
    clearTimeout(timeout);
  }
};
