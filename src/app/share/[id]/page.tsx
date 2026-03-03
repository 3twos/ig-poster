"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { PosterPreview } from "@/components/poster-preview";
import { type SavedProject, SavedProjectSchema } from "@/lib/project";

export default function ShareProjectPage() {
  const params = useParams<{ id: string }>();
  const [project, setProject] = useState<SavedProject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
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

  const primaryAssetUrl = useMemo(() => {
    if (!project) {
      return undefined;
    }

    const first = project.assets[0];
    if (!first) {
      return undefined;
    }

    if (first.mediaType === "video") {
      return first.posterUrl || project.renderedPosterUrl || undefined;
    }

    return first.url;
  }, [project]);

  const secondaryAssetUrl = useMemo(() => {
    if (!project) {
      return undefined;
    }

    const second = project.assets[1];
    if (!second) {
      return undefined;
    }

    if (second.mediaType === "video") {
      return second.posterUrl || undefined;
    }

    return second.url;
  }, [project]);

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
          <div className="rounded-2xl border border-white/15 bg-slate-900/50 p-5 text-sm text-slate-200">Loading...</div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-red-300/40 bg-red-500/10 p-5 text-sm text-red-200">{error}</div>
        ) : null}

        {project && activeVariant ? (
          <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-3xl border border-white/15 bg-slate-900/55 p-5 backdrop-blur-xl">
              <PosterPreview
                ref={posterRef}
                variant={activeVariant}
                brandName={project.brand.brandName}
                aspectRatio={project.post.aspectRatio}
                primaryImage={project.renderedPosterUrl || primaryAssetUrl}
                secondaryImage={secondaryAssetUrl}
                logoImage={project.logoUrl || undefined}
                overlayLayout={project.overlayLayouts[activeVariant.id]}
              />
            </div>

            <div className="rounded-3xl border border-white/15 bg-slate-900/55 p-5 backdrop-blur-xl">
              <p className="text-xs font-semibold tracking-[0.2em] text-orange-200 uppercase">{activeVariant.name}</p>
              <p className="mt-3 text-3xl leading-tight font-semibold tracking-tight">{activeVariant.headline}</p>
              <p className="mt-3 text-sm text-slate-300">{activeVariant.supportingText}</p>
              <p className="mt-4 text-sm font-semibold text-white">{activeVariant.cta}</p>
              <p className="mt-6 text-sm text-slate-200">{activeVariant.caption}</p>
              <p className="mt-3 text-xs text-orange-200">{activeVariant.hashtags.join(" ")}</p>
              <p className="mt-5 text-xs text-slate-400">Created {new Date(project.createdAt).toLocaleString()}</p>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
