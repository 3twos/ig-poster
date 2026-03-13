import {
  BrandInputSchema,
  GenerationRequestSchema,
  PostInputSchema,
  StoredGenerationResponseSchema,
  StoredOverlayLayoutSchema,
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
  post?: ReturnType<typeof PostInputSchema.parse>;
  promptConfig?: Partial<GenerationRequest["promptConfig"]>;
  overlayLayout?: ReturnType<typeof StoredOverlayLayoutSchema.parse>;
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

  const result = StoredGenerationResponseSchema.safeParse(post.result ?? undefined);
  if (!result.success || result.data.variants.length === 0) {
    throw conflict("Post has no generated variants to refine.");
  }
  const parsedPost = PostInputSchema.safeParse(post.brief ?? undefined);
  const promptConfig = post.promptConfig ?? undefined;

  if (params.variantId) {
    const requestedVariant = result.data.variants.find(
      (candidate) => candidate.id === params.variantId,
    );
    if (!requestedVariant) {
      throw notFound("Variant not found for this post.");
    }
    const requestedOverlayLayout = StoredOverlayLayoutSchema.safeParse(
      post.overlayLayouts?.[requestedVariant.id] ?? undefined,
    );

    return {
      variant: requestedVariant as CreativeVariant,
      brand: brand.data,
      post: parsedPost.success ? parsedPost.data : undefined,
      promptConfig,
      overlayLayout: requestedOverlayLayout.success
        ? requestedOverlayLayout.data
        : undefined,
    };
  }

  const variant =
    (post.activeVariantId
      ? result.data.variants.find(
          (candidate) => candidate.id === post.activeVariantId,
        )
      : undefined) ?? result.data.variants[0];
  const parsedOverlayLayout = StoredOverlayLayoutSchema.safeParse(
    variant ? post.overlayLayouts?.[variant.id] ?? undefined : undefined,
  );

  return {
    variant: variant as CreativeVariant,
    brand: brand.data,
    post: parsedPost.success ? parsedPost.data : undefined,
    promptConfig,
    overlayLayout: parsedOverlayLayout.success
      ? parsedOverlayLayout.data
      : undefined,
  };
};
