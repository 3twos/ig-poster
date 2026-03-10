import {
  BrandInputSchema,
  CreativeVariantSchema,
  GenerationRequestSchema,
  GenerationResponseSchema,
  type GenerationRequest,
  type CreativeVariant,
} from "@/lib/creative";
import type { Actor } from "@/services/actors";
import { getPost } from "@/services/posts";

export class GenerationServiceError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "GenerationServiceError";
    this.status = status;
  }
}

const invalid = (message: string) => new GenerationServiceError(400, message);
const notFound = (message: string) => new GenerationServiceError(404, message);
const conflict = (message: string) => new GenerationServiceError(409, message);

const formatIssues = (issues: Array<{ path: PropertyKey[]; message: string }>) =>
  issues
    .map((issue) => {
      const path = issue.path
        .map((segment) =>
          typeof segment === "number" ? `[${segment}]` : String(segment),
        )
        .join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join(", ");

export const buildGenerationRequestFromPost = async (
  actor: Actor,
  postId: string,
): Promise<GenerationRequest> => {
  const post = await getPost(actor, postId);
  if (!post) {
    throw notFound("Post not found.");
  }

  const parsed = GenerationRequestSchema.safeParse({
    brand: post.brand ?? undefined,
    post: post.brief ?? undefined,
    assets: post.assets ?? [],
    hasLogo: Boolean(post.logoUrl),
    promptConfig: post.promptConfig ?? undefined,
  });
  if (!parsed.success) {
    throw invalid(
      `Post is missing a complete generation brief: ${formatIssues(parsed.error.issues)}`,
    );
  }

  return parsed.data;
};

export const buildRefineRequestFromPost = async (params: {
  actor: Actor;
  postId: string;
  variantId?: string;
}): Promise<{
  variant: CreativeVariant;
  brand: ReturnType<typeof BrandInputSchema.parse>;
}> => {
  const post = await getPost(params.actor, params.postId);
  if (!post) {
    throw notFound("Post not found.");
  }

  const brand = BrandInputSchema.safeParse(post.brand ?? undefined);
  if (!brand.success) {
    throw invalid(
      `Post is missing a complete brand definition: ${formatIssues(brand.error.issues)}`,
    );
  }

  const result = GenerationResponseSchema.safeParse(post.result ?? undefined);
  if (!result.success || result.data.variants.length === 0) {
    throw conflict("Post has no generated variants to refine.");
  }

  if (params.variantId) {
    const requestedVariant = result.data.variants.find(
      (candidate) => candidate.id === params.variantId,
    );
    if (!requestedVariant) {
      throw notFound("Variant not found for this post.");
    }

    return {
      variant: CreativeVariantSchema.parse(requestedVariant),
      brand: brand.data,
    };
  }

  const variant =
    (post.activeVariantId
      ? result.data.variants.find(
          (candidate) => candidate.id === post.activeVariantId,
        )
      : undefined) ?? result.data.variants[0];

  return {
    variant: CreativeVariantSchema.parse(variant),
    brand: brand.data,
  };
};
