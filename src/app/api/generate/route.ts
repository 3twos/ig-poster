import { NextResponse } from "next/server";
import OpenAI from "openai";

import {
  GenerationRequestSchema,
  GenerationResponseSchema,
  buildGenerationPrompt,
  createFallbackResponse,
} from "@/lib/creative";
import { buildWebsiteStyleContext } from "@/lib/website-style";

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const request = GenerationRequestSchema.parse(json);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(createFallbackResponse(request));
    }

    try {
      const websiteStyleContext = await buildWebsiteStyleContext(request.brand.website);
      const client = new OpenAI({ apiKey });
      const completion = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
        temperature: 0.9,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a world-class Instagram creative strategist. Return only valid JSON, no markdown.",
          },
          {
            role: "user",
            content: buildGenerationPrompt(request, { websiteStyleContext: websiteStyleContext ?? undefined }),
          },
        ],
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        return NextResponse.json(createFallbackResponse(request));
      }

      const parsed = GenerationResponseSchema.parse(JSON.parse(content));
      return NextResponse.json(parsed);
    } catch {
      return NextResponse.json(createFallbackResponse(request));
    }
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json(
        {
          error: "Could not generate creative direction",
          detail: error.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error: "Unexpected failure",
      },
      { status: 500 },
    );
  }
}
