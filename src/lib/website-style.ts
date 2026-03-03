const HTTP_PROTOCOL_RE = /^https?:\/\//i;
const META_TAG_RE = /<meta\b[^>]*>/gi;
const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const HEX_COLOR_RE = /#(?:[A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})\b/g;
const FONT_FAMILY_RE = /font-family\s*:\s*([^;}{]+);/gi;
const GOOGLE_FAMILY_RE = /[?&]family=([^&"']+)/gi;
const MAX_HTML_CHARS = 180_000;

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

    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
};

const isPrivateHostname = (hostname: string) => {
  const host = hostname.trim().toLowerCase();

  if (!host) {
    return true;
  }

  if (host === "localhost" || host.endsWith(".local")) {
    return true;
  }

  if (host === "::1") {
    return true;
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) {
    return false;
  }

  const octets = ipv4.slice(1).map((part) => Number(part));
  if (octets.some((octet) => octet > 255)) {
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

  return false;
};

const extractMetaMap = (html: string) => {
  const map = new Map<string, string>();
  let match: RegExpExecArray | null = META_TAG_RE.exec(html);

  while (match) {
    const attrs = parseAttributes(match[0]);
    const name = (attrs.name ?? attrs.property ?? "").toLowerCase();
    const content = cleanWhitespace(attrs.content ?? "");

    if (name && content && !map.has(name)) {
      map.set(name, content);
    }

    match = META_TAG_RE.exec(html);
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
  let fontMatch: RegExpExecArray | null = FONT_FAMILY_RE.exec(html);

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

    fontMatch = FONT_FAMILY_RE.exec(html);
  }

  let googleMatch: RegExpExecArray | null = GOOGLE_FAMILY_RE.exec(html);
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

    googleMatch = GOOGLE_FAMILY_RE.exec(html);
  }

  return unique(families, 5);
};

export const buildWebsiteStyleContext = async (website: string) => {
  const normalized = normalizeWebsiteUrl(website);
  if (!normalized) {
    return null;
  }

  const parsedUrl = new URL(normalized);
  const notes: string[] = [`- Website URL: ${normalized}`];

  if (isPrivateHostname(parsedUrl.hostname)) {
    notes.push(
      "- Style extraction note: local/private addresses are skipped for safety.",
    );
    return notes.join("\n");
  }

  try {
    const response = await fetch(normalized, {
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(4500),
      headers: {
        "User-Agent": "ig-poster-style-bot/1.0",
      },
    });

    const resolvedUrl = response.url || normalized;
    notes[0] = `- Website URL: ${resolvedUrl}`;

    if (!response.ok) {
      notes.push(`- Style extraction note: website returned HTTP ${response.status}.`);
      return notes.join("\n");
    }

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.includes("text/html")) {
      notes.push("- Style extraction note: website is not an HTML page.");
      return notes.join("\n");
    }

    const html = (await response.text()).slice(0, MAX_HTML_CHARS);
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

  return notes.join("\n");
};
