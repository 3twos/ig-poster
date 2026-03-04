import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const HTTP_PROTOCOL_RE = /^https?:\/\//i;
const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const HEX_COLOR_RE = /#(?:[A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})\b/g;
const MAX_HTML_CHARS = 180_000;
const MAX_HTML_BYTES = 1_000_000;
const MAX_REDIRECT_HOPS = 3;
const REQUEST_TIMEOUT_MS = 4_500;
const MAX_BODY_TEXT_CHARS = 3_000;

const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

const GENERIC_FONTS = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "emoji",
  "math",
  "fangsong",
  "inherit",
  "initial",
  "unset",
]);

const clip = (value: string, max = 220) =>
  value.length > max ? `${value.slice(0, max - 3)}...` : value;

const cleanWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const decodeBasicEntities = (value: string) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

const parseAttributes = (tag: string): Record<string, string> => {
  const attrs: Record<string, string> = {};
  const attrRe = /([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match: RegExpExecArray | null = attrRe.exec(tag);

  while (match) {
    const [, key, dq, sq, bare] = match;
    attrs[key.toLowerCase()] = decodeBasicEntities(dq ?? sq ?? bare ?? "");
    match = attrRe.exec(tag);
  }

  return attrs;
};

const normalizeHex = (color: string) => {
  const raw = color.trim().toUpperCase();
  if (/^#[A-F0-9]{6}$/.test(raw)) {
    return raw;
  }

  if (/^#[A-F0-9]{3}$/.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
  }

  return null;
};

const unique = (values: string[], limit: number) => {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }

    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    out.push(trimmed);

    if (out.length >= limit) {
      break;
    }
  }

  return out;
};

const sanitizeUrlForNotes = (value: string) => {
  try {
    const url = new URL(value);
    url.hash = "";
    url.username = "";
    url.password = "";
    url.search = "";
    return url.toString();
  } catch {
    return value;
  }
};

const normalizeWebsiteUrl = (website: string) => {
  const trimmed = website.trim();
  if (!trimmed) {
    return null;
  }

  const withProtocol = HTTP_PROTOCOL_RE.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }

    // Keep fetch target constrained to origin + path to avoid leaking sensitive query material.
    url.hash = "";
    url.username = "";
    url.password = "";
    url.search = "";
    return url.toString();
  } catch {
    return null;
  }
};

const parseIpv4 = (value: string): number[] | null => {
  const match = value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) {
    return null;
  }

  const octets = match.slice(1).map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return null;
  }

  return octets;
};

const isPrivateIpv4 = (value: string) => {
  const octets = parseIpv4(value);
  if (!octets) {
    return false;
  }

  if (octets[0] === 0) {
    return true;
  }

  if (octets[0] === 10) {
    return true;
  }

  if (octets[0] === 127) {
    return true;
  }

  if (octets[0] === 169 && octets[1] === 254) {
    return true;
  }

  if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) {
    return true;
  }

  if (octets[0] === 192 && octets[1] === 168) {
    return true;
  }

  if (octets[0] >= 224) {
    return true;
  }

  return false;
};

const isPrivateIpv6 = (value: string) => {
  const lower = value.toLowerCase().split("%")[0];

  if (lower === "::" || lower === "::1") {
    return true;
  }

  if (lower.startsWith("fc") || lower.startsWith("fd")) {
    return true;
  }

  if (
    lower.startsWith("fe8") ||
    lower.startsWith("fe9") ||
    lower.startsWith("fea") ||
    lower.startsWith("feb")
  ) {
    return true;
  }

  if (
    lower.startsWith("fec") ||
    lower.startsWith("fed") ||
    lower.startsWith("fee") ||
    lower.startsWith("fef")
  ) {
    return true;
  }

  if (lower.startsWith("::ffff:")) {
    const mapped = lower.slice("::ffff:".length);
    return isPrivateIpv4(mapped);
  }

  return false;
};

const isPrivateAddress = (value: string) => {
  const version = isIP(value);
  if (version === 4) {
    return isPrivateIpv4(value);
  }

  if (version === 6) {
    return isPrivateIpv6(value);
  }

  return false;
};

const isHostBlockedByName = (hostname: string) => {
  const host = hostname.trim().toLowerCase();
  if (!host) {
    return true;
  }

  if (host === "localhost" || host.endsWith(".local")) {
    return true;
  }

  return false;
};

const isPublicHost = async (hostname: string) => {
  const host = hostname.trim().toLowerCase();
  if (!host || isHostBlockedByName(host)) {
    return false;
  }

  if (isPrivateAddress(host)) {
    return false;
  }

  try {
    const records = await lookup(host, {
      all: true,
      verbatim: true,
    });

    if (!records.length) {
      return false;
    }

    return records.every((record) => !isPrivateAddress(record.address));
  } catch {
    return false;
  }
};

const extractMetaMap = (html: string) => {
  const map = new Map<string, string>();
  const metaTagRe = /<meta\b[^>]*>/gi;
  let match: RegExpExecArray | null = metaTagRe.exec(html);

  while (match) {
    const attrs = parseAttributes(match[0]);
    const name = (attrs.name ?? attrs.property ?? "").toLowerCase();
    const content = cleanWhitespace(attrs.content ?? "");

    if (name && content && !map.has(name)) {
      map.set(name, content);
    }

    match = metaTagRe.exec(html);
  }

  return map;
};

const extractHexColors = (html: string) => {
  const rawMatches = html.match(HEX_COLOR_RE) ?? [];
  return unique(
    rawMatches
      .map(normalizeHex)
      .filter((value): value is string => Boolean(value)),
    6,
  );
};

const cleanFontFamily = (value: string) =>
  value
    .replace(/!important/gi, "")
    .replace(/^['"]+|['"]+$/g, "")
    .trim();

const extractFontFamilies = (html: string) => {
  const families: string[] = [];
  const fontFamilyRe = /font-family\s*:\s*([^;}{]+);/gi;
  let fontMatch: RegExpExecArray | null = fontFamilyRe.exec(html);

  while (fontMatch) {
    const declaration = fontMatch[1];
    const parts = declaration.split(",");
    for (const part of parts) {
      const cleaned = cleanFontFamily(part);
      if (!cleaned) {
        continue;
      }

      if (GENERIC_FONTS.has(cleaned.toLowerCase())) {
        continue;
      }

      families.push(cleaned);
    }

    fontMatch = fontFamilyRe.exec(html);
  }

  const googleFamilyRe = /[?&]family=([^&"']+)/gi;
  let googleMatch: RegExpExecArray | null = googleFamilyRe.exec(html);
  while (googleMatch) {
    const decoded = decodeURIComponent(googleMatch[1]).replace(/\+/g, " ");
    const candidates = decoded.split("|");
    for (const candidate of candidates) {
      const familyName = cleanFontFamily(candidate.split(":")[0] ?? "");
      if (!familyName) {
        continue;
      }

      if (GENERIC_FONTS.has(familyName.toLowerCase())) {
        continue;
      }

      families.push(familyName);
    }

    googleMatch = googleFamilyRe.exec(html);
  }

  return unique(families, 5);
};

export type WebsiteStyleResult = {
  notes: string;
  bodyText: string;
};

const extractBodyText = (html: string): string => {
  let text = html;
  text = text.replace(/<script[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, " ");
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  text = text.replace(/<svg[\s\S]*?<\/svg>/gi, " ");
  text = text.replace(/<iframe[\s\S]*?<\/iframe>/gi, " ");
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, " ");
  text = text.replace(/<header[\s\S]*?<\/header>/gi, " ");
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, " ");
  text = text.replace(/<[^>]+>/g, " ");
  text = decodeBasicEntities(text);
  text = cleanWhitespace(text);
  return text.slice(0, MAX_BODY_TEXT_CHARS);
};

const readTextUpToLimit = async (response: Response, maxChars: number) => {
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";

  while (text.length < maxChars) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    text += decoder.decode(value, { stream: true });
    if (text.length >= maxChars) {
      text = text.slice(0, maxChars);
      break;
    }
  }

  text += decoder.decode();
  return text.slice(0, maxChars);
};

const fetchHtmlWithSafeRedirects = async (startUrl: string) => {
  let current = new URL(startUrl);

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop += 1) {
    if (!(await isPublicHost(current.hostname))) {
      throw new Error("Unsafe host");
    }

    const response = await fetch(current.toString(), {
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        "User-Agent": "ig-poster-style-bot/1.0",
      },
    });

    if (!REDIRECT_CODES.has(response.status)) {
      return {
        response,
        finalUrl: current.toString(),
      };
    }

    const location = response.headers.get("location");
    if (!location) {
      return {
        response,
        finalUrl: current.toString(),
      };
    }

    current = new URL(location, current);
    if (!["http:", "https:"].includes(current.protocol)) {
      throw new Error("Unsupported redirect protocol");
    }
  }

  throw new Error("Too many redirects");
};

export const buildWebsiteStyleContext = async (
  website: string,
): Promise<WebsiteStyleResult | null> => {
  const normalized = normalizeWebsiteUrl(website);
  if (!normalized) {
    return null;
  }

  const notes: string[] = [`- Website URL: ${sanitizeUrlForNotes(normalized)}`];
  let bodyText = "";

  try {
    const { response, finalUrl } = await fetchHtmlWithSafeRedirects(normalized);
    notes[0] = `- Website URL: ${sanitizeUrlForNotes(finalUrl)}`;

    if (!response.ok) {
      notes.push(`- Style extraction note: website returned HTTP ${response.status}.`);
      return { notes: notes.join("\n"), bodyText };
    }

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.includes("text/html")) {
      notes.push("- Style extraction note: website is not an HTML page.");
      return { notes: notes.join("\n"), bodyText };
    }

    const contentLength = Number(response.headers.get("content-length") ?? "");
    if (Number.isFinite(contentLength) && contentLength > MAX_HTML_BYTES) {
      notes.push("- Style extraction note: website HTML is too large to process safely.");
      return { notes: notes.join("\n"), bodyText };
    }

    const html = await readTextUpToLimit(response, MAX_HTML_CHARS);
    bodyText = extractBodyText(html);
    const metaMap = extractMetaMap(html);

    const titleMatch = TITLE_RE.exec(html);
    const pageTitle = cleanWhitespace(
      decodeBasicEntities(titleMatch?.[1] ? titleMatch[1] : ""),
    );
    if (pageTitle) {
      notes.push(`- Page title: ${clip(pageTitle)}`);
    }

    const siteName = metaMap.get("og:site_name");
    if (siteName) {
      notes.push(`- Site name: ${clip(siteName)}`);
    }

    const description =
      metaMap.get("description") ??
      metaMap.get("og:description") ??
      metaMap.get("twitter:description");
    if (description) {
      notes.push(`- Description: ${clip(description)}`);
    }

    const themeColor = normalizeHex(metaMap.get("theme-color") ?? "");
    if (themeColor) {
      notes.push(`- Theme color: ${themeColor}`);
    }

    const colors = extractHexColors(html);
    if (colors.length) {
      notes.push(`- Detected color accents: ${colors.join(", ")}`);
    }

    const fonts = extractFontFamilies(html);
    if (fonts.length) {
      notes.push(`- Detected font families: ${fonts.join(", ")}`);
    }

    if (notes.length === 1) {
      notes.push(
        "- Style extraction note: no reliable public metadata cues were found.",
      );
    }
  } catch {
    notes.push("- Style extraction note: website metadata could not be fetched.");
  }

  return { notes: notes.join("\n"), bodyText };
};

const MAX_MULTI_PAGE_BODY_CHARS = 5_000;

const ABOUT_PATH_CANDIDATES = ["/about", "/about-us", "/our-story", "/story"];

const extractInternalPaths = (html: string, baseUrl: URL): string[] => {
  const linkRe = /<a\b[^>]*>/gi;
  const paths: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null = linkRe.exec(html);

  while (match) {
    const attrs = parseAttributes(match[0]);
    const href = attrs.href ?? "";
    if (href && !href.startsWith("#") && !href.startsWith("mailto:") && !href.startsWith("tel:")) {
      try {
        const resolved = new URL(href, baseUrl);
        if (resolved.hostname === baseUrl.hostname && resolved.pathname !== "/" && !seen.has(resolved.pathname)) {
          seen.add(resolved.pathname);
          paths.push(resolved.pathname);
        }
      } catch {
        // skip invalid URLs
      }
    }
    match = linkRe.exec(html);
  }

  return paths;
};

const findAboutPath = (discoveredPaths: string[]): string | null => {
  const lower = discoveredPaths.map((p) => ({ original: p, lower: p.toLowerCase() }));

  for (const candidate of ABOUT_PATH_CANDIDATES) {
    const found = lower.find((p) => p.lower === candidate || p.lower === `${candidate}/`);
    if (found) {
      return found.original;
    }
  }

  const fuzzy = lower.find((p) => p.lower.includes("about") || p.lower.includes("story"));
  return fuzzy?.original ?? null;
};

const findProductPath = (discoveredPaths: string[]): string | null => {
  const lower = discoveredPaths.map((p) => ({ original: p, lower: p.toLowerCase() }));
  const keywords = ["product", "service", "wine", "shop", "collection", "menu", "offer"];

  for (const keyword of keywords) {
    const found = lower.find((p) => p.lower.includes(keyword));
    if (found) {
      return found.original;
    }
  }

  return null;
};

export const buildMultiPageStyleContext = async (
  website: string,
): Promise<WebsiteStyleResult | null> => {
  const normalized = normalizeWebsiteUrl(website);
  if (!normalized) {
    return null;
  }

  const baseUrl = new URL(normalized);
  const homepageResult = await buildWebsiteStyleContext(website);
  if (!homepageResult) {
    return null;
  }

  const bodyTexts: string[] = [`[Homepage]\n${homepageResult.bodyText}`];

  // Discover internal links from the homepage HTML to find about/product pages
  try {
    const { response } = await fetchHtmlWithSafeRedirects(normalized);
    if (response.ok) {
      const html = await readTextUpToLimit(response, MAX_HTML_CHARS);
      const discoveredPaths = extractInternalPaths(html, baseUrl);

      const secondaryPaths: string[] = [];
      const aboutPath = findAboutPath(discoveredPaths);
      if (aboutPath) {
        secondaryPaths.push(aboutPath);
      }
      const productPath = findProductPath(discoveredPaths);
      if (productPath && productPath !== aboutPath) {
        secondaryPaths.push(productPath);
      }

      if (secondaryPaths.length > 0) {
        const secondaryResults = await Promise.allSettled(
          secondaryPaths.map((path) => {
            const pageUrl = new URL(path, baseUrl).toString();
            return buildWebsiteStyleContext(pageUrl);
          }),
        );

        for (let i = 0; i < secondaryResults.length; i++) {
          const settled = secondaryResults[i];
          if (settled.status === "fulfilled" && settled.value && settled.value.bodyText.length > 50) {
            const label = secondaryPaths[i] ?? `Page ${i + 2}`;
            bodyTexts.push(`[${label}]\n${settled.value.bodyText}`);
          }
        }
      }
    }
  } catch {
    // Secondary page discovery failed, use homepage only
  }

  return {
    notes: homepageResult.notes,
    bodyText: bodyTexts.join("\n\n").slice(0, MAX_MULTI_PAGE_BODY_CHARS),
  };
};
