import { APPLE_PHOTOS_COMPANION_APP_NAME } from "@/lib/apple-photos-bridge";

export type ApplePhotosFallbackInfo = {
  code: "MACOS_COMPANION_REQUIRED" | "UNSUPPORTED_PLATFORM";
  title: string;
  description: string;
  actionLabel: string;
};

export const isMacOsUserAgent = (userAgent: string) =>
  /(Macintosh|Mac OS X)/i.test(userAgent) && !/(iPhone|iPad|iPod)/i.test(userAgent);

export const getApplePhotosFallbackInfo = (
  userAgent: string,
): ApplePhotosFallbackInfo => {
  if (isMacOsUserAgent(userAgent)) {
    return {
      code: "MACOS_COMPANION_REQUIRED",
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
