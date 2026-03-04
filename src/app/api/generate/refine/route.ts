import { NextResponse } from "next/server";

import { z } from "zod";

import { BrandInputSchema, CreativeVariantSchema } from "@/lib/creative";
import { resolveAllLlmAuthFromRequest } from "@/lib/llm-auth";
import { generateWithFallback } from "@/lib/llm";

const RefineRequestSchema = z.object({
  variant: CreativeVariantSchema,
  instruction: z.string().trim().min(3).max(500),
  brand: BrandInputSchema,
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const { variant, instruction, brand } = RefineRequestSchema.parse(json);
    const authList = await resolveAllLlmAuthFromRequest(req);

    if (authList.connections.length === 0) {
      return NextResponse.json(
        { error: "No LLM provider configured" },
        { status: 503 },
      );
    }

    try {
      const { result: generated } = await generateWithFallback<unknown>(
        authList.connections,
        (auth) => ({
          auth,
          systemPrompt:
            "You refine Instagram creative variants. Apply the user's refinement instruction while preserving the variant's structure, postType, layout, and asset sequence. Return strict JSON only.",
          userPrompt: `Refine this Instagram creative variant according to the instruction below.

Current variant:
${JSON.stringify(variant, null, 2)}

Brand name: ${brand.brandName}
Brand voice: ${brand.voice}

Refinement instruction: "${instruction}"

Return the refined variant as a single JSON object with the exact same schema. Only change what the instruction asks for. Keep all other fields unchanged unless they must change for consistency.
Output JSON only.`,
          temperature: 0.5,
          maxTokens: 2000,
        }),
      );

      const refined = CreativeVariantSchema.parse(generated);
      return NextResponse.json({
        source: "model",
        variant: { ...refined, id: variant.id },
      });
    } catch {
      return NextResponse.json(
        {
          error: "Failed to refine variant",
          source: "error",
          variant,
        },
        { status: 502 },
      );
    }
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json(
      { error: "Could not refine variant" },
      { status },
    );
  }
}
