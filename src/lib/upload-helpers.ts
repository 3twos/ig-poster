import type { AssetMediaType, UploadStatus } from "@/lib/types";
import { withPerf } from "@/lib/perf";

export const parseApiError = async (response: Response) => {
  try {
    const json = await response.json();
    if (typeof json?.detail === "string") {
      return json.detail;
    }

    if (typeof json?.error === "string") {
      return json.error;
    }

    return `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
};

export const revokeObjectUrlIfNeeded = (url: string) => {
  if (url.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
};

export const statusChip = (status: UploadStatus) => {
  if (status === "uploaded") {
    return "border-emerald-300/40 bg-emerald-400/10 text-emerald-200";
  }

  if (status === "uploading") {
    return "border-blue-300/40 bg-blue-400/10 text-blue-200";
  }

  if (status === "failed") {
    return "border-red-300/40 bg-red-400/10 text-red-200";
  }

  return "border-white/20 bg-white/5 text-slate-200";
};

export const mediaTypeFromFile = (file: File): AssetMediaType =>
  file.type.startsWith("video/") ? "video" : "image";

export const formatDuration = (durationSec: number) => {
  const total = Math.round(durationSec);
  const mins = Math.floor(total / 60);
  const secs = total % 60;

  if (mins === 0) {
    return `${secs}s`;
  }

  return `${mins}:${String(secs).padStart(2, "0")}`;
};

export const extractVideoMetadata = async (objectUrl: string) => {
  return withPerf("extractVideoMetadata", () => new Promise<{
    durationSec: number;
    width: number;
    height: number;
    posterUrl: string;
  }>((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;

    const cleanup = () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
    };

    video.onloadedmetadata = () => {
      const targetTime = Math.min(0.5, Math.max(video.duration / 4, 0.1));

      const capture = () => {
        try {
          const maxW = 640;
          const nativeW = video.videoWidth;
          const nativeH = video.videoHeight;
          const scale = nativeW > maxW ? maxW / nativeW : 1;
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(nativeW * scale);
          canvas.height = Math.round(nativeH * scale);
          const ctx = canvas.getContext("2d");

          if (!ctx) {
            throw new Error("Canvas context unavailable");
          }

          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const posterUrl = canvas.toDataURL("image/jpeg", 0.7);

          resolve({
            durationSec: Number(video.duration.toFixed(2)),
            width: nativeW,
            height: nativeH,
            posterUrl,
          });
        } catch (error) {
          reject(error instanceof Error ? error : new Error("Video metadata parsing failed"));
        } finally {
          cleanup();
        }
      };

      video.currentTime = targetTime;
      video.onseeked = capture;
      video.onerror = () => {
        cleanup();
        reject(new Error("Video metadata parsing failed"));
      };
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("Could not load uploaded video"));
    };
  }));
};
