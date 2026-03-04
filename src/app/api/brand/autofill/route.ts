import { NextResponse } from "next/server";
import { z } from "zod";

import { isBlobEnabled, putJson, readJsonByPath } from "@/lib/blob-store";
import { resolveLlmAuthFromRequest } from "@/lib/llm-auth";
import { generateStructuredJson } from "@/lib/llm";
import {
  getUserSettingsPath,
  type UserSettings,
} from "@/lib/user-settings";
import { buildMultiPageStyleContext } from "@/lib/website-style";
import { readWorkspaceSessionFromRequest } from "@/lib/workspace-auth";

const AutofillRequestSchema = z.object({
  website: z.string().trim().min(3).max(240).refine(
    (val) => {
      try {
        const url = val.startsWith("http") ? val : `https://${val}`;
        new URL(url);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Provide a valid website URL" },
  ),
});

const AutofillBrandSchema = z.object({
  brandName: z.string().trim().min(2).max(80),
  values: z.string().trim().min(10).max(1200),
  principles: z.string().trim().min(10).max(1200),
  story: z.string().trim().min(10).max(1800),
  voice: z.string().trim().min(10).max(600),
  visualDirection: z.string().trim().min(8).max(1200),
  palette: z.string().trim().min(3).max(200),
  logoNotes: z.string().trim().max(300),
});

type ParsedWebsiteContext = {
  websiteUrl: string;
  pageTitle: string;
  siteName: string;
  description: string;
  themeColor: string;
  colorAccents: string[];
  fonts: string[];
};

const clampText = (value: string, max: number) =>
  value.length > max ? value.slice(0, max) : value;

const parseList = (value: string) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const parseWebsiteContext = (context: string) => {
  const lines = context
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "));

  const readValue = (prefix: string) => {
    const matched = lines.find((line) => line.startsWith(prefix));
    return matched ? matched.slice(prefix.length).trim() : "";
  };

  return {
    websiteUrl: readValue("- Website URL: "),
    pageTitle: readValue("- Page title: "),
    siteName: readValue("- Site name: "),
    description: readValue("- Description: "),
    themeColor: readValue("- Theme color: "),
    colorAccents: parseList(readValue("- Detected color accents: ")),
    fonts: parseList(readValue("- Detected font families: ")),
  } satisfies ParsedWebsiteContext;
};

const normalizeBrandName = (value: string) =>
  value
    .replace(/[|/\\–—-].*$/, "")
    .replace(/[^a-zA-Z0-9&+\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const domainToBrandName = (website: string) => {
  try {
    const host = new URL(website).hostname.replace(/^www\./i, "");
    const parts = host.split(".");
    const root = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
    return root
      .split(/[-_]/g)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  } catch {
    return "Brand";
  }
};

const uniqueValues = (values: string[]) => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(normalized);
  }
  return out;
};

const buildFallbackAutofill = (parsed: ParsedWebsiteContext) => {
  const brandNameRaw =
    normalizeBrandName(parsed.siteName) ||
    normalizeBrandName(parsed.pageTitle) ||
    domainToBrandName(parsed.websiteUrl);
  const brandName = clampText(brandNameRaw || "Brand", 80);

  const paletteList = uniqueValues([parsed.themeColor, ...parsed.colorAccents]).slice(0, 4);
  const palette =
    paletteList.length > 0
      ? paletteList.join(", ")
      : "#0F172A, #F97316, #F8FAFC, #22C55E";

  const description = parsed.description
    ? clampText(parsed.description, 280)
    : `${brandName} positions itself with a clear and practical value proposition.`;

  const fontText = parsed.fonts.length
    ? `Typography cues reference ${parsed.fonts.join(", ")}.`
    : "Typography should stay legible, modern, and high-contrast.";

  return AutofillBrandSchema.parse({
    brandName,
    values:
      "Clarity, consistency, customer trust, and quality execution grounded in real outcomes.",
    principles:
      "Communicate with proof, keep messaging concise, and maintain visual consistency across every asset.",
    story: `${brandName} communicates a focused position: ${description} The brand should feel consistent, dependable, and easy to recognize.`,
    voice: "Confident, clear, practical, and approachable with no hype-heavy language.",
    visualDirection: `${fontText} Use strong hierarchy, purposeful spacing, and a cohesive look informed by the website style cues.`,
    palette,
    logoNotes:
      "Logo has precedence over brand-name text overlays. Keep clearspace around the logo and avoid overlap with headline elements.",
  });
};

const buildModelAutofill = async (
  parsed: ParsedWebsiteContext,
  bodyText: string,
  req: Request,
) => {
  const llmAuth = await resolveLlmAuthFromRequest(req);
  if (!llmAuth) {
    return null;
  }

  const bodyTextBlock = bodyText
    ? `\nWebsite body content (use to extract brand voice, values, story, and positioning):\n${bodyText}\n`
    : "";

  try {
    const generated = await generateStructuredJson<unknown>({
      auth: llmAuth,
      systemPrompt:
        "You build precise brand-kit fields from website signals. Return strict JSON only with the required keys.",
      userPrompt: `Create brand field values using these website cues:
- Website URL: ${parsed.websiteUrl || "unknown"}
- Site name: ${parsed.siteName || "unknown"}
- Page title: ${parsed.pageTitle || "unknown"}
- Description: ${parsed.description || "unknown"}
- Theme color: ${parsed.themeColor || "unknown"}
- Color accents: ${parsed.colorAccents.join(", ") || "unknown"}
- Fonts: ${parsed.fonts.join(", ") || "unknown"}
${bodyTextBlock}
Return JSON with keys:
brandName, values, principles, story, voice, visualDirection, palette, logoNotes.

Constraints:
- Keep brandName <= 80 chars.
- values/principles/story/voice/visualDirection must be specific to this brand, derived from the website content. Not generic placeholders.
- palette should be a comma-separated hex list when possible.
- logoNotes must explicitly mention logo precedence over text overlays.
- No markdown.`,
      temperature: 0.4,
      maxTokens: 1400,
    });
    return AutofillBrandSchema.parse(generated);
  } catch {
    return null;
  }
};

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const payload = AutofillRequestSchema.parse(json);
    const styleResult = await buildMultiPageStyleContext(payload.website);

    if (!styleResult) {
      return NextResponse.json(
        {
          error: "Invalid website URL",
          detail: "Provide a valid public http(s) website URL.",
        },
        { status: 400 },
      );
    }

    const parsed = parseWebsiteContext(styleResult.notes);
    const fallback = buildFallbackAutofill(parsed);
    const model = await buildModelAutofill(parsed, styleResult.bodyText, request);

    // Persist brand memory for faster future generations
    if (isBlobEnabled()) {
      try {
        const session = await readWorkspaceSessionFromRequest(request);
        if (session) {
          const path = getUserSettingsPath(session.email);
          const existing = await readJsonByPath<UserSettings>(path);
          await putJson(path, {
            ...existing,
            email: session.email,
            updatedAt: new Date().toISOString(),
            brandMemory: {
              websiteUrl: parsed.websiteUrl || payload.website,
              bodyText: styleResult.bodyText,
              notes: styleResult.notes,
              fetchedAt: new Date().toISOString(),
            },
          });
        }
      } catch {
        // Brand memory persistence is best-effort
      }
    }

    return NextResponse.json({
      source: model ? "model" : "heuristic",
      website: parsed.websiteUrl || payload.website,
      brand: model ?? fallback,
    });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json(
      { error: "Could not autofill brand fields from website" },
      { status },
    );
  }
}
