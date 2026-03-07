import { isIP } from "node:net";

import type { MetaScheduleRequest } from "@/lib/meta-schemas";
import { isAbortError } from "@/lib/server-utils";

type MediaTarget = {
  label: string;
  expectedType: "image" | "video";
  url: string;
};

type MediaPreflightOptions = {
  probeRemote?: boolean;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 8_000;
const HEAD_FALLBACK_STATUSES = new Set([400, 403, 405, 406, 415, 500, 501]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;

export class MetaMediaPreflightError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetaMediaPreflightError";
  }
}

const isPrivateIpv4 = (hostname: string) => {
  const octets = hostname.split(".").map((value) => Number(value));
  if (octets.length !== 4 || octets.some((value) => Number.isNaN(value))) {
    return false;
  }

  const [a, b] = octets;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
};

const mappedIpv4FromIpv6 = (hostname: string) => {
  const normalized = hostname.toLowerCase();
  if (!normalized.startsWith("::ffff:")) {
    return null;
  }

  const suffix = normalized.slice("::ffff:".length);
  if (isIP(suffix) === 4) {
    return suffix;
  }

  const hexPair = suffix.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hexPair) {
    return null;
  }

  const left = Number.parseInt(hexPair[1], 16);
  const right = Number.parseInt(hexPair[2], 16);
  if (Number.isNaN(left) || Number.isNaN(right)) {
    return null;
  }

  return [
    (left >> 8) & 0xff,
    left & 0xff,
    (right >> 8) & 0xff,
    right & 0xff,
  ].join(".");
};

const isPrivateIpv6 = (hostname: string) => {
  const normalized = hostname.toLowerCase();
  const mappedIpv4 = mappedIpv4FromIpv6(normalized);
  if (mappedIpv4 && isPrivateIpv4(mappedIpv4)) {
    return true;
  }
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) {
    return true;
  }
  return false;
};

const isPrivateHost = (hostname: string) => {
  const normalized = hostname.trim().toLowerCase().replace(/^\[(.*)\]$/, "$1");
  if (!normalized) return true;
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal")
  ) {
    return true;
  }

  const hostIpVersion = isIP(normalized);
  if (hostIpVersion === 4) {
    return isPrivateIpv4(normalized);
  }
  if (hostIpVersion === 6) {
    return isPrivateIpv6(normalized);
  }
  return false;
};

const collectMediaTargets = (media: MetaScheduleRequest["media"]): MediaTarget[] => {
  if (media.mode === "image") {
    return [
      { label: "Image URL", expectedType: "image", url: media.imageUrl },
    ];
  }

  if (media.mode === "reel") {
    return [
      { label: "Reel video URL", expectedType: "video", url: media.videoUrl },
      ...(media.coverUrl
        ? [{ label: "Reel cover URL", expectedType: "image" as const, url: media.coverUrl }]
        : []),
    ];
  }

  return media.items.map((item, index) => ({
    label: `Carousel item ${index + 1} URL`,
    expectedType: item.mediaType,
    url: item.url,
  }));
};

const assertPublicHttpsUrl = (target: MediaTarget) => {
  assertPublicHttpsParsedUrl(target, parseTargetUrl(target));
};

const parseTargetUrl = (target: MediaTarget) => {
  try {
    return new URL(target.url);
  } catch {
    throw new MetaMediaPreflightError(`${target.label} is not a valid URL.`);
  }
};

const assertPublicHttpsParsedUrl = (target: MediaTarget, parsed: URL) => {
  if (parsed.protocol !== "https:") {
    throw new MetaMediaPreflightError(`${target.label} must use HTTPS.`);
  }

  if (isPrivateHost(parsed.hostname)) {
    throw new MetaMediaPreflightError(
      `${target.label} must use a public host (not localhost/private network).`,
    );
  }
};

const closeResponseBody = async (response: Response | null | undefined) => {
  if (!response?.body) return;
  try {
    await response.body.cancel();
  } catch {
    // Best-effort connection cleanup.
  }
};

const fetchWithValidatedRedirects = async (
  target: MediaTarget,
  method: "HEAD" | "GET",
  signal: AbortSignal,
) => {
  let currentUrl = target.url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetch(currentUrl, {
      method,
      cache: "no-store",
      redirect: "manual",
      headers: method === "GET" ? { Range: "bytes=0-0" } : undefined,
      signal,
    });

    if (!REDIRECT_STATUSES.has(response.status)) {
      return response;
    }

    if (hop === MAX_REDIRECTS) {
      await closeResponseBody(response);
      throw new MetaMediaPreflightError(
        `${target.label} redirected too many times.`,
      );
    }

    const location = response.headers.get("location");
    await closeResponseBody(response);
    if (!location) {
      throw new MetaMediaPreflightError(
        `${target.label} redirect response was missing a location header.`,
      );
    }

    const redirectedUrl = new URL(location, currentUrl);
    assertPublicHttpsParsedUrl(target, redirectedUrl);
    currentUrl = redirectedUrl.toString();
  }

  throw new MetaMediaPreflightError(`${target.label} could not be reached.`);
};

const probeRemoteTarget = async (
  target: MediaTarget,
  timeoutMs: number,
) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response | null = null;
  try {
    response = await fetchWithValidatedRedirects(
      target,
      "HEAD",
      controller.signal,
    );
    if (HEAD_FALLBACK_STATUSES.has(response.status)) {
      await closeResponseBody(response);
      response = await fetchWithValidatedRedirects(
        target,
        "GET",
        controller.signal,
      );
    }

    if (!response.ok && response.status !== 206) {
      throw new MetaMediaPreflightError(
        `${target.label} could not be reached (status ${response.status}).`,
      );
    }

    const contentType = (response.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!contentType.startsWith(`${target.expectedType}/`)) {
      const rendered = contentType || "unknown";
      throw new MetaMediaPreflightError(
        `${target.label} must return ${target.expectedType} content-type (received ${rendered}).`,
      );
    }
  } catch (error) {
    if (error instanceof MetaMediaPreflightError) {
      throw error;
    }

    if (isAbortError(error)) {
      throw new MetaMediaPreflightError(
        `${target.label} probe timed out after ${Math.round(timeoutMs / 1000)}s.`,
      );
    }

    throw new MetaMediaPreflightError(
      `${target.label} could not be probed from the server.`,
    );
  } finally {
    await closeResponseBody(response);
    clearTimeout(timeout);
  }
};

export const preflightMetaMediaForPublish = async (
  media: MetaScheduleRequest["media"],
  options: MediaPreflightOptions = {},
) => {
  const targets = collectMediaTargets(media);
  for (const target of targets) {
    assertPublicHttpsUrl(target);
  }

  if (options.probeRemote === false) {
    return;
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const uniqueTargets = Array.from(
    new Map(
      targets.map((target) => [`${target.expectedType}:${target.url}`, target]),
    ).values(),
  );
  await Promise.all(
    uniqueTargets.map((target) => probeRemoteTarget(target, timeoutMs)),
  );
};
