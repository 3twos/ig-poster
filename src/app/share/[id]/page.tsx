"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { PosterPreview } from "@/components/poster-preview";
import { type SavedProject, SavedProjectSchema } from "@/lib/project";

const toVisualUrl = (asset?: SavedProject["assets"][number]) => {
  if (!asset) return undefined;
  if (asset.mediaType === "video") {
    return asset.posterUrl || undefined;
  }
  return asset.url;
};

export default function ShareProjectPage() {
  const params = useParams<{ id: string }>();
  const [project, setProject] = useState<SavedProject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const posterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(`/api/projects/${params.id}`, { cache: "no-store" });
        const json = await response.json();

        if (!response.ok) {
          throw new Error(typeof json?.error === "string" ? json.error : "Could not load project");
        }

        const parsed = SavedProjectSchema.parse(json);
        setProject(parsed);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load project");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [params.id]);

  const activeVariant = useMemo(() => {
    if (!project) {
      return null;
    }

    return (
      project.result.variants.find((variant) => variant.id === project.activeVariantId) ??
      project.result.variants[0] ??
      null
    );
  }, [project]);

  useEffect(() => {
    setActiveSlideIndex(0);
  }, [activeVariant?.id]);

  const orderedAssets = useMemo(() => {
    if (!project || !activeVariant) {
      return [];
    }

    const assetMap = new Map(project.assets.map((asset) => [asset.id, asset]));
    const ordered = activeVariant.assetSequence
      .map((assetId) => assetMap.get(assetId))
      .filter((asset): asset is SavedProject["assets"][number] => Boolean(asset));

    return ordered.length ? ordered : project.assets;
  }, [activeVariant, project]);

  const primaryAssetUrl = useMemo(() => {
    if (!project || !activeVariant) {
      return undefined;
    }

    if (activeVariant.postType === "single-image") {
      return project.renderedPosterUrl || toVisualUrl(orderedAssets[0]);
    }

    if (activeVariant.postType === "carousel") {
      return (
        toVisualUrl(
          orderedAssets[Math.min(activeSlideIndex, orderedAssets.length - 1)],
        ) || project.renderedPosterUrl || undefined
      );
    }

    return toVisualUrl(orderedAssets[0]) || project.renderedPosterUrl || undefined;
  }, [activeSlideIndex, activeVariant, orderedAssets, project]);

  const secondaryAssetUrl = useMemo(() => {
    if (!project || !activeVariant || activeVariant.postType === "carousel") {
      return undefined;
    }

    return toVisualUrl(orderedAssets[1]);
  }, [activeVariant, orderedAssets, project]);
  const effectiveCaption = useMemo(() => {
    if (!project || !activeVariant) {
      return "";
    }

    const persistedCaption = project.publishSettings.caption?.trim();
    if (persistedCaption) {
      return persistedCaption;
    }

    const hashtags = activeVariant.hashtags.join(" ");
    return hashtags
      ? `${activeVariant.caption}\n\n${hashtags}`
      : activeVariant.caption;
  }, [activeVariant, project]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_0%_0%,#1E293B_0%,#0F172A_35%,#020617_100%)] px-4 py-10 text-white md:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-3 rounded-3xl border border-white/15 bg-white/5 px-5 py-4 backdrop-blur-xl">
          <h1 className="text-lg font-semibold tracking-tight">Shared IG Poster Project</h1>
          <Link
            href="/"
            className="rounded-xl border border-white/25 bg-white/5 px-3 py-1.5 text-sm font-medium text-slate-100 transition hover:bg-white/10"
          >
            Open Editor
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-slate-900/50 p-5 text-sm text-slate-200">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading project...
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-red-300/40 bg-red-500/10 p-5 text-sm text-red-200">{error}</div>
        ) : null}

        {project && !activeVariant && !loading ? (
          <div className="rounded-2xl border border-white/15 bg-slate-900/50 p-5 text-sm text-slate-200">
            This project has no variants to display.
          </div>
        ) : null}

        {project && activeVariant ? (
          <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-3xl border border-white/15 bg-slate-900/55 p-5 backdrop-blur-xl">
              <PosterPreview
                ref={posterRef}
                variant={activeVariant}
                brandName={project.brand.brandName}
                aspectRatio={project.post.aspectRatio}
                primaryImage={primaryAssetUrl}
                secondaryImage={secondaryAssetUrl}
                logoImage={project.logoUrl || undefined}
                overlayLayout={project.overlayLayouts[activeVariant.id]}
                carouselSlides={activeVariant.carouselSlides}
                activeSlideIndex={activeSlideIndex}
                onSlideChange={
                  activeVariant.postType === "carousel"
                    ? setActiveSlideIndex
                    : undefined
                }
              />
            </div>

            <div className="rounded-3xl border border-white/15 bg-slate-900/55 p-5 backdrop-blur-xl">
              <p className="text-xs font-semibold tracking-[0.2em] text-orange-200 uppercase">{activeVariant.name}</p>
              <p className="mt-3 text-3xl leading-tight font-semibold tracking-tight">{activeVariant.headline}</p>
              <p className="mt-3 text-sm text-slate-300">{activeVariant.supportingText}</p>
              {activeVariant.cta ? (
                <p className="mt-4 text-sm font-semibold text-white">{activeVariant.cta}</p>
              ) : null}
              <p className="mt-6 text-sm whitespace-pre-wrap text-slate-200">{effectiveCaption}</p>
              <p className="mt-5 text-xs text-slate-400">Created {new Date(project.createdAt).toLocaleString()}</p>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
