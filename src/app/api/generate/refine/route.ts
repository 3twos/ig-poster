import { NextResponse } from "next/server";

import { z } from "zod";

import {
  BrandInputSchema,
  CreativeVariantSchema,
  OverlayLayoutSchema,
  PostInputSchema,
  applyRefinementDirectives,
  buildRefineSystemPrompt,
  buildRefineUserPrompt,
} from "@/lib/creative";
import { resolveAllLlmAuthFromRequest } from "@/lib/llm-auth";
import { generateWithFallback } from "@/lib/llm";

const RefinePromptConfigSchema = z.object({
  systemPrompt: z.string().trim().max(2000).optional(),
  customInstructions: z.string().trim().max(4000).optional(),
});

const RefineRequestSchema = z.object({
  variant: CreativeVariantSchema,
  instruction: z.string().trim().min(3).max(500),
  brand: BrandInputSchema,
  post: PostInputSchema.optional(),
  promptConfig: RefinePromptConfigSchema.optional(),
  overlayLayout: OverlayLayoutSchema.optional(),
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const {
      variant,
      instruction,
      brand,
      post,
      promptConfig,
      overlayLayout,
    } = RefineRequestSchema.parse(json);
    const authList = await resolveAllLlmAuthFromRequest(req);

    if (authList.connections.length === 0) {
      return NextResponse.json(
        { error: "No LLM provider configured" },
        { status: 503 },
      );
    }

    try {
      const systemPrompt = buildRefineSystemPrompt(promptConfig);
      const userPrompt = buildRefineUserPrompt({
        variant,
        instruction,
        brand,
        post,
        promptConfig,
        overlayLayout,
      });
      const { result: generated } = await generateWithFallback<unknown>(
        authList.connections,
        (auth) => ({
          auth,
          systemPrompt,
          userPrompt,
          temperature: 0.5,
          maxTokens: 2000,
        }),
      );

      const refined = CreativeVariantSchema.parse(
        applyRefinementDirectives({
          currentVariant: variant,
          refinedVariant: CreativeVariantSchema.parse(generated),
          instruction,
        }),
      );
      return NextResponse.json({
        source: "model",
        variant: { ...refined, id: variant.id },
        promptPreview: {
          systemPrompt,
          userPrompt,
        },
      });
    } catch (refinementError) {
      const detail =
        refinementError instanceof z.ZodError
          ? `LLM returned invalid variant structure: ${refinementError.issues.map((i) => i.message).join(", ")}`
          : refinementError instanceof Error
            ? refinementError.message
            : "Failed to refine variant";
      return NextResponse.json(
        {
          error: detail,
          source: "error",
          variant,
        },
        { status: 502 },
      );
    }
  } catch (error) {
    const detail =
      error instanceof z.ZodError
        ? `Invalid request: ${error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`
        : "Could not refine variant";
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json(
      { error: detail },
      { status },
    );
  }
}
