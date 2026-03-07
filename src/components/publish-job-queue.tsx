"use client";

import {
  AlertCircle,
  CalendarClock,
  LoaderCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MetaLocationSearchField } from "@/components/meta-location-search";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { MetaUserTagsEditor } from "@/components/meta-user-tags-editor";
import type {
  MetaScheduleRequest,
  MetaUserTag,
  PublishJobClient,
} from "@/lib/meta-schemas";
import { PublishJobListResponseSchema } from "@/lib/meta-schemas";
import { parseApiError } from "@/lib/upload-helpers";
import { cn } from "@/lib/utils";

type Props = {
  activePostId?: string;
  localTimeZone: string;
  onJobsMutated?: (
    postId: string | undefined,
    action: "cancel" | "reschedule" | "edit" | "retry-now",
  ) => Promise<void> | void;
  refreshKey: number;
};

const ACTIVE_JOBS_QUERY = "status=queued,processing&limit=8";
const FAILED_JOBS_QUERY = "status=failed&limit=4";

const fetchPublishJobs = async (query: string) => {
  const response = await fetch(`/api/publish-jobs?${query}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  const json = PublishJobListResponseSchema.parse(await response.json());
  return json.jobs;
};

const statusTone = (status: PublishJobClient["status"]) => {
  if (status === "queued") {
    return "border-blue-300/35 bg-blue-400/10 text-blue-100";
  }

  if (status === "processing") {
    return "border-amber-300/35 bg-amber-400/10 text-amber-100";
  }

  return "border-red-300/35 bg-red-400/10 text-red-100";
};

const statusLabel = (status: PublishJobClient["status"]) => {
  if (status === "queued") return "Queued";
  if (status === "processing") return "Processing";
  return "Failed";
};

const formatTimestamp = (iso: string, localTimeZone: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.toLocaleString()} (${localTimeZone})`;
};

const toInputValue = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

type EditableCarouselItem = {
  clientId: string;
  mediaType: "image" | "video";
  url: string;
};

type EditableMedia =
  | {
      mode: "image";
      imageUrl: string;
    }
  | {
      mode: "reel";
      videoUrl: string;
      coverUrl?: string;
    }
  | {
      mode: "carousel";
      items: EditableCarouselItem[];
    };

const createClientId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 12);

const cloneMedia = (
  media: MetaScheduleRequest["media"],
): EditableMedia => {
  if (media.mode === "carousel") {
    return {
      mode: "carousel",
      items: media.items.map((item) => ({
        clientId: createClientId(),
        mediaType: item.mediaType,
        url: item.url,
      })),
    };
  }

  return { ...media };
};

const normalizeMedia = (
  media: EditableMedia,
): MetaScheduleRequest["media"] => {
  if (media.mode === "image") {
    return {
      mode: "image",
      imageUrl: media.imageUrl.trim(),
    };
  }

  if (media.mode === "reel") {
    const coverUrl = media.coverUrl?.trim();
    return {
      mode: "reel",
      videoUrl: media.videoUrl.trim(),
      coverUrl: coverUrl ? coverUrl : undefined,
    };
  }

  return {
    mode: "carousel",
    items: media.items.map((item) => ({
      mediaType: item.mediaType,
      url: item.url.trim(),
    })),
  };
};

const isValidUrl = (value: string) => {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

const validateMedia = (media: MetaScheduleRequest["media"]): string | null => {
  if (media.mode === "image") {
    if (!isValidUrl(media.imageUrl)) {
      return "Image URL must be a valid URL.";
    }
    return null;
  }

  if (media.mode === "reel") {
    if (!isValidUrl(media.videoUrl)) {
      return "Video URL must be a valid URL.";
    }
    if (media.coverUrl && !isValidUrl(media.coverUrl)) {
      return "Cover URL must be a valid URL.";
    }
    return null;
  }

  if (media.items.length < 2 || media.items.length > 10) {
    return "Carousel media must include 2-10 items.";
  }

  const invalidIndex = media.items.findIndex((item) => !isValidUrl(item.url));
  if (invalidIndex !== -1) {
    return `Carousel item ${invalidIndex + 1} must use a valid URL.`;
  }

  return null;
};

const isSameMedia = (
  left: MetaScheduleRequest["media"],
  right: MetaScheduleRequest["media"],
) => {
  if (left.mode !== right.mode) return false;

  if (left.mode === "image" && right.mode === "image") {
    return left.imageUrl === right.imageUrl;
  }

  if (left.mode === "reel" && right.mode === "reel") {
    return left.videoUrl === right.videoUrl &&
      (left.coverUrl ?? "") === (right.coverUrl ?? "");
  }

  if (left.mode === "carousel" && right.mode === "carousel") {
    if (left.items.length !== right.items.length) return false;
    return left.items.every((item, index) =>
      item.mediaType === right.items[index]?.mediaType &&
      item.url === right.items[index]?.url
    );
  }

  return false;
};

const userTagsEqual = (
  left: MetaUserTag[] | null,
  right: MetaUserTag[] | null,
) => JSON.stringify(left ?? []) === JSON.stringify(right ?? []);

export function PublishJobQueue({
  activePostId,
  localTimeZone,
  onJobsMutated,
  refreshKey,
}: Props) {
  const [jobs, setJobs] = useState<PublishJobClient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [editPublishAt, setEditPublishAt] = useState("");
  const [editCaption, setEditCaption] = useState("");
  const [editFirstComment, setEditFirstComment] = useState("");
  const [editLocationId, setEditLocationId] = useState("");
  const [editUserTags, setEditUserTags] = useState<MetaUserTag[]>([]);
  const [editMedia, setEditMedia] = useState<EditableMedia | null>(null);
  const hasLoadedOnceRef = useRef(false);
  const normalizeTagUsername = (value: string) => value.trim().replace(/^@/, "");
  const hasIncompleteEditUserTags = editUserTags.some((tag) =>
    normalizeTagUsername(tag.username).length === 0
  );

  const resetEditState = () => {
    setEditingJobId(null);
    setEditPublishAt("");
    setEditCaption("");
    setEditFirstComment("");
    setEditLocationId("");
    setEditUserTags([]);
    setEditMedia(null);
  };

  const loadJobs = useCallback(async (background = false) => {
    if (background) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const activeJobs = await fetchPublishJobs(ACTIVE_JOBS_QUERY);
      const failedJobs = await fetchPublishJobs(FAILED_JOBS_QUERY).catch((error) => {
        const message = error instanceof Error
          ? error.message
          : "Could not load failed publish jobs.";
        toast.error(message);
        return [] satisfies PublishJobClient[];
      });
      setJobs([...activeJobs, ...failedJobs]);
      setLoadError(null);
      hasLoadedOnceRef.current = true;
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Could not load scheduled publish jobs.";
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadJobs(hasLoadedOnceRef.current);
    // refreshKey is the external invalidation signal after new schedules are created.
  }, [loadJobs, refreshKey]);

  const handleCancel = async (job: PublishJobClient) => {
    setActiveJobId(job.id);
    try {
      const response = await fetch(`/api/publish-jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      toast.success("Scheduled publish canceled.");
      if (editingJobId === job.id) {
        resetEditState();
      }
      await onJobsMutated?.(job.postId ?? undefined, "cancel");
      await loadJobs(true);
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Could not cancel scheduled publish.";
      toast.error(message);
    } finally {
      setActiveJobId(null);
    }
  };

  const handleRetryNow = async (job: PublishJobClient) => {
    setActiveJobId(job.id);
    try {
      const response = await fetch(`/api/publish-jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry-now" }),
      });
      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      toast.success("Retry queued.");
      if (editingJobId === job.id) {
        resetEditState();
      }
      await onJobsMutated?.(job.postId ?? undefined, "retry-now");
      await loadJobs(true);
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Could not queue retry.";
      toast.error(message);
    } finally {
      setActiveJobId(null);
    }
  };

  const handleEdit = async (job: PublishJobClient) => {
    const normalizedCaption = editCaption.trim();
    if (!normalizedCaption) {
      toast.error("Caption cannot be empty.");
      return;
    }
    if (!editPublishAt) {
      toast.error("Publish time is required.");
      return;
    }
    if (!editMedia) {
      toast.error("Media details are required.");
      return;
    }

    const normalizedMedia = normalizeMedia(editMedia);
    const normalizedExistingMedia = normalizeMedia(cloneMedia(job.media));
    const mediaValidationError = validateMedia(normalizedMedia);
    if (mediaValidationError) {
      toast.error(mediaValidationError);
      return;
    }

    const currentPublishAtInput = toInputValue(job.publishAt);
    const publishAtChanged = editPublishAt !== currentPublishAtInput;
    const normalizedFirstComment = editFirstComment.trim();
    const nextFirstComment = normalizedFirstComment ? normalizedFirstComment : null;
    const currentFirstComment = job.firstComment ?? null;
    const normalizedLocationId = editLocationId.trim();
    const nextLocationId = normalizedLocationId ? normalizedLocationId : null;
    const currentLocationId = job.locationId ?? null;
    const normalizedUserTags = editUserTags
      .map((tag) => ({
        username: normalizeTagUsername(tag.username),
        x: tag.x,
        y: tag.y,
      }))
      .filter((tag) => tag.username.length > 0);
    if (hasIncompleteEditUserTags) {
      toast.error("Fill username for each user tag row or remove incomplete rows.");
      return;
    }
    const nextUserTags = normalizedUserTags.length > 0 ? normalizedUserTags : null;
    const currentUserTags = job.userTags ?? null;
    const body: {
      action: "edit";
      caption?: string;
      firstComment?: string | null;
      locationId?: string | null;
      userTags?: MetaUserTag[] | null;
      publishAt?: string;
      media?: MetaScheduleRequest["media"];
    } = {
      action: "edit",
    };

    if (normalizedCaption !== job.caption) {
      body.caption = normalizedCaption;
    }
    if (nextFirstComment !== currentFirstComment) {
      body.firstComment = nextFirstComment;
    }
    if (nextLocationId !== currentLocationId) {
      body.locationId = nextLocationId;
    }
    if (!userTagsEqual(nextUserTags, currentUserTags)) {
      body.userTags = nextUserTags;
    }

    if (publishAtChanged) {
      const parsedPublishAt = new Date(editPublishAt);
      if (Number.isNaN(parsedPublishAt.getTime())) {
        toast.error("Choose a valid publish time.");
        return;
      }
      body.publishAt = parsedPublishAt.toISOString();
    }
    if (!isSameMedia(normalizedMedia, normalizedExistingMedia)) {
      body.media = normalizedMedia;
    }

    if (
      !body.caption &&
      body.firstComment === undefined &&
      body.locationId === undefined &&
      body.userTags === undefined &&
      !body.publishAt &&
      !body.media
    ) {
      resetEditState();
      return;
    }

    setActiveJobId(job.id);
    try {
      const response = await fetch(`/api/publish-jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      toast.success("Publish job updated.");
      resetEditState();
      await onJobsMutated?.(job.postId ?? undefined, "edit");
      await loadJobs(true);
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Could not update publish job.";
      toast.error(message);
    } finally {
      setActiveJobId(null);
    }
  };

  return (
    <div className="rounded-xl border border-white/15 bg-white/5 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-slate-300 uppercase">
            Publish Queue
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Track upcoming, in-flight, and failed Instagram publishes for this workspace.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Refresh publish queue"
          onClick={() => void loadJobs(true)}
          disabled={isLoading || isRefreshing}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing ? "animate-spin" : "")} />
        </Button>
      </div>

      {isLoading ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          Loading publish queue...
        </div>
      ) : loadError && jobs.length === 0 ? (
        <div className="mt-3 rounded-lg border border-red-300/25 bg-red-400/10 p-3 text-xs text-red-100">
          <p>{loadError}</p>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="mt-2"
            onClick={() => void loadJobs(false)}
          >
            Retry
          </Button>
        </div>
      ) : jobs.length === 0 ? (
        <p className="mt-3 text-xs text-slate-400">
          No queued, processing, or failed publish jobs right now.
        </p>
      ) : (
        <ScrollArea className="mt-3 max-h-72 pr-3">
          <div className="space-y-2">
            {jobs.map((job) => {
              const isBusy = activeJobId === job.id;
              const isEditing = editingJobId === job.id;

              return (
                <div
                  key={job.id}
                  className="rounded-lg border border-white/10 bg-slate-950/35 p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={cn("rounded-md px-2 py-0.5", statusTone(job.status))}>
                          {job.status === "processing" ? (
                            <LoaderCircle className="h-3 w-3 animate-spin" />
                          ) : job.status === "failed" ? (
                            <AlertCircle className="h-3 w-3" />
                          ) : (
                            <CalendarClock className="h-3 w-3" />
                          )}
                          {statusLabel(job.status)}
                        </Badge>
                        {job.postId && job.postId === activePostId ? (
                          <Badge
                            variant="outline"
                            className="rounded-md border-white/15 bg-white/5 text-slate-200"
                          >
                            This post
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm font-medium text-slate-100">
                        {formatTimestamp(job.publishAt, localTimeZone)}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        Attempts {job.attempts}/{job.maxAttempts}
                        {job.outcomeContext?.variantName
                          ? ` · ${job.outcomeContext.variantName}`
                          : ""}
                      </p>
                      {job.lastError ? (
                        <p className="mt-2 text-[11px] text-red-200">{job.lastError}</p>
                      ) : null}
                    </div>

                    {job.status === "processing" ? null : (
                      <div className="flex shrink-0 items-center gap-1">
                        {job.status === "failed" ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            disabled={isBusy}
                            onClick={() => void handleRetryNow(job)}
                          >
                            {isBusy ? (
                              <LoaderCircle className="h-3 w-3 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3 w-3" />
                            )}
                            Retry now
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          disabled={isBusy}
                          onClick={() => {
                            setEditingJobId(job.id);
                            setEditPublishAt(toInputValue(job.publishAt));
                            setEditCaption(job.caption);
                            setEditFirstComment(job.firstComment ?? "");
                            setEditLocationId(job.locationId ?? "");
                            setEditUserTags(job.userTags ?? []);
                            setEditMedia(cloneMedia(job.media));
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          disabled={isBusy}
                          onClick={() => void handleCancel(job)}
                        >
                          {isBusy ? (
                            <LoaderCircle className="h-3 w-3 animate-spin" />
                          ) : (
                            <X className="h-3 w-3" />
                          )}
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="mt-3 rounded-md border border-white/10 bg-white/5 p-2.5">
                      <LabelLine>Edit scheduled publish</LabelLine>
                      <div className="mt-2">
                        <Textarea
                          aria-label={`Edit caption for ${job.id}`}
                          value={editCaption}
                          onChange={(event) => setEditCaption(event.target.value)}
                          className="min-h-[92px] text-xs"
                          maxLength={2200}
                        />
                        <p className="mt-1 text-[11px] text-slate-400">
                          Caption {editCaption.trim().length}/2200
                        </p>
                      </div>
                      <div className="mt-3">
                        <LabelLine>First comment (optional)</LabelLine>
                        <Textarea
                          aria-label={`Edit first comment for ${job.id}`}
                          value={editFirstComment}
                          onChange={(event) => setEditFirstComment(event.target.value)}
                          className="mt-2 min-h-[76px] text-xs"
                          maxLength={2200}
                          placeholder="Posted right after media publish."
                        />
                        <p className="mt-1 text-[11px] text-slate-400">
                          First comment {editFirstComment.trim().length}/2200
                        </p>
                      </div>
                      <div className="mt-3">
                        <LabelLine>Publish metadata</LabelLine>
                        {editMedia?.mode === "image" ? (
                          <div className="mt-2 space-y-2">
                            <Input
                              aria-label={`Edit location ID for ${job.id}`}
                              value={editLocationId}
                              onChange={(event) => setEditLocationId(event.target.value)}
                              className="text-xs"
                              placeholder="Location ID (optional)"
                            />
                            <MetaLocationSearchField
                              ariaLabel={`Search Meta locations for ${job.id}`}
                              locationId={editLocationId}
                              onSelectLocationId={setEditLocationId}
                              disabled={isBusy}
                            />
                            <MetaUserTagsEditor
                              ariaLabelPrefix={`Edit ${job.id}`}
                              imageUrl={editMedia.imageUrl}
                              tags={editUserTags}
                              onChange={setEditUserTags}
                              disabled={isBusy}
                            />
                            <p className="text-[11px] text-slate-400">
                              Place tags visually on the image, or fine-tune x/y values between 0 and 1.
                            </p>
                            {hasIncompleteEditUserTags ? (
                              <p className="text-[11px] text-amber-200">
                                Fill username for each tag row or remove incomplete rows before saving.
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          <p className="mt-2 text-[11px] text-slate-400">
                            Location and user tags are available for single-image posts only.
                          </p>
                        )}
                      </div>
                      <div className="mt-3">
                        <LabelLine>Media</LabelLine>
                        {editMedia?.mode === "image" ? (
                          <div className="mt-2">
                            <Input
                              aria-label={`Edit image URL for ${job.id}`}
                              value={editMedia.imageUrl}
                              onChange={(event) => {
                                const imageUrl = event.target.value;
                                setEditMedia((current) =>
                                  current?.mode === "image"
                                    ? { mode: "image", imageUrl }
                                    : current
                                );
                              }}
                              className="text-xs"
                            />
                          </div>
                        ) : null}
                        {editMedia?.mode === "reel" ? (
                          <div className="mt-2 space-y-2">
                            <Input
                              aria-label={`Edit reel video URL for ${job.id}`}
                              value={editMedia.videoUrl}
                              onChange={(event) => {
                                const videoUrl = event.target.value;
                                setEditMedia((current) =>
                                  current?.mode === "reel"
                                    ? {
                                        mode: "reel",
                                        videoUrl,
                                        coverUrl: current.coverUrl,
                                      }
                                    : current
                                );
                              }}
                              className="text-xs"
                            />
                            <Input
                              aria-label={`Edit reel cover URL for ${job.id}`}
                              value={editMedia.coverUrl ?? ""}
                              onChange={(event) => {
                                const coverUrl = event.target.value;
                                setEditMedia((current) =>
                                  current?.mode === "reel"
                                    ? {
                                        mode: "reel",
                                        videoUrl: current.videoUrl,
                                        coverUrl,
                                      }
                                    : current
                                );
                              }}
                              className="text-xs"
                              placeholder="Optional cover URL"
                            />
                          </div>
                        ) : null}
                        {editMedia?.mode === "carousel" ? (
                          <div className="mt-2 space-y-2">
                            {editMedia.items.map((item, index) => (
                              <div
                                key={item.clientId}
                                className="rounded-md border border-white/10 bg-slate-950/40 p-2"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <select
                                    aria-label={`Edit carousel item ${index + 1} type for ${job.id}`}
                                    value={item.mediaType}
                                    onChange={(event) => {
                                      const mediaType = event.target.value as "image" | "video";
                                      setEditMedia((current) => {
                                        if (!current || current.mode !== "carousel") return current;
                                        const items = current.items.map((entry, entryIndex) =>
                                          entryIndex === index
                                            ? { ...entry, mediaType }
                                            : entry
                                        );
                                        return { mode: "carousel", items };
                                      });
                                    }}
                                    className="h-8 rounded-md border border-white/15 bg-slate-900/70 px-2 text-xs text-slate-100 outline-none focus:ring-1 focus:ring-white/30"
                                  >
                                    <option value="image">Image</option>
                                    <option value="video">Video</option>
                                  </select>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="xs"
                                    disabled={isBusy || editMedia.items.length <= 2}
                                    onClick={() => {
                                      setEditMedia((current) => {
                                        if (!current || current.mode !== "carousel") return current;
                                        if (current.items.length <= 2) return current;
                                        return {
                                          mode: "carousel",
                                          items: current.items.filter((entry) =>
                                            entry.clientId !== item.clientId
                                          ),
                                        };
                                      });
                                    }}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                    Remove
                                  </Button>
                                </div>
                                <Input
                                  aria-label={`Edit carousel item ${index + 1} URL for ${job.id}`}
                                  value={item.url}
                                  onChange={(event) => {
                                    const url = event.target.value;
                                    setEditMedia((current) => {
                                      if (!current || current.mode !== "carousel") return current;
                                      const items = current.items.map((entry, entryIndex) =>
                                        entryIndex === index
                                          ? { ...entry, url }
                                          : entry
                                      );
                                      return { mode: "carousel", items };
                                    });
                                  }}
                                  className="mt-2 text-xs"
                                />
                              </div>
                            ))}
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="xs"
                                disabled={isBusy || editMedia.items.length >= 10}
                                onClick={() => {
                                  setEditMedia((current) => {
                                    if (!current || current.mode !== "carousel") return current;
                                    if (current.items.length >= 10) return current;
                                    return {
                                      mode: "carousel",
                                      items: [
                                        ...current.items,
                                        {
                                          clientId: createClientId(),
                                          mediaType: "image",
                                          url: "",
                                        },
                                      ],
                                    };
                                  });
                                }}
                              >
                                <Plus className="h-3 w-3" />
                                Add item
                              </Button>
                              <p className="text-[11px] text-slate-400">
                                2-10 items
                              </p>
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                        <Input
                          type="datetime-local"
                          aria-label={`Edit publish time for ${job.id}`}
                          value={editPublishAt}
                          onChange={(event) => setEditPublishAt(event.target.value)}
                          className="text-xs"
                        />
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="xs"
                            disabled={!editPublishAt || !editCaption.trim() || isBusy || hasIncompleteEditUserTags}
                            onClick={() => void handleEdit(job)}
                          >
                            {isBusy ? (
                              <LoaderCircle className="h-3 w-3 animate-spin" />
                            ) : (
                              <CalendarClock className="h-3 w-3" />
                            )}
                            Save
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            disabled={isBusy}
                            onClick={() => {
                              resetEditState();
                            }}
                          >
                            Close
                          </Button>
                        </div>
                      </div>
                      <p className="mt-2 text-[11px] text-slate-400">
                        Time uses your local timezone: {localTimeZone}
                      </p>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

function LabelLine({ children }: { children: string }) {
  return <p className="text-[11px] font-medium text-slate-300">{children}</p>;
}
