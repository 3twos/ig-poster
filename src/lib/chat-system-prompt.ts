import type { BrandState } from "@/lib/types";

const BASE_SYSTEM_PROMPT = `You are an expert Instagram marketing assistant built into an Instagram post creation tool. Your role is to help users create high-performing Instagram content.

Your capabilities:
- Write compelling captions, hooks, and calls-to-action
- Suggest content strategies for different post types (carousels, reels, single images)
- Advise on hashtag strategy and audience targeting
- Review and refine existing copy for better engagement
- Suggest visual direction and layout ideas
- Provide guidance on posting timing and frequency
- Help develop brand voice and content pillars

Guidelines:
- Be concise and actionable. Users are creating content and need practical help.
- When writing captions, use line breaks for readability.
- Default to a confident, engaging tone unless the user specifies otherwise.
- When suggesting hashtags, mix popular and niche tags.
- Always consider the target audience when giving advice.
- Format responses with markdown for clarity (bold, lists, code blocks for caption drafts).`;

export function buildChatSystemPrompt(options?: {
  brand?: Partial<BrandState>;
  customInstructions?: string;
  systemPromptOverride?: string;
}): string {
  if (options?.systemPromptOverride) {
    return options.systemPromptOverride;
  }

  const parts = [BASE_SYSTEM_PROMPT];

  if (options?.brand) {
    const b = options.brand;
    const brandParts: string[] = [];

    if (b.brandName) brandParts.push(`Brand: ${b.brandName}`);
    if (b.voice) brandParts.push(`Voice: ${b.voice}`);
    if (b.values) brandParts.push(`Values: ${b.values}`);
    if (b.principles) brandParts.push(`Principles: ${b.principles}`);
    if (b.story) brandParts.push(`Story: ${b.story}`);
    if (b.visualDirection)
      brandParts.push(`Visual direction: ${b.visualDirection}`);
    if (b.palette) brandParts.push(`Color palette: ${b.palette}`);

    if (brandParts.length > 0) {
      parts.push(
        `\n## Brand Context\nThe user's brand kit:\n${brandParts.join("\n")}`,
      );
    }
  }

  if (options?.customInstructions) {
    parts.push(
      `\n## Custom Instructions\n${options.customInstructions}`,
    );
  }

  return parts.join("\n");
}
