"use client";

import {
  AlertCircle,
  CalendarClock,
  LoaderCircle,
  RefreshCw,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { PublishJobClient } from "@/lib/meta-schemas";
import { PublishJobListResponseSchema } from "@/lib/meta-schemas";
import { parseApiError } from "@/lib/upload-helpers";
import { cn } from "@/lib/utils";

type Props = {
  activePostId?: string;
  localTimeZone: string;
  onJobsMutated?: (
    postId: string | undefined,
    action: "cancel" | "reschedule",
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
  const [rescheduleAt, setRescheduleAt] = useState("");
  const hasLoadedOnceRef = useRef(false);

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
        setEditingJobId(null);
        setRescheduleAt("");
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

  const handleReschedule = async (job: PublishJobClient) => {
    if (!rescheduleAt) return;

    setActiveJobId(job.id);
    try {
      const response = await fetch(`/api/publish-jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reschedule",
          publishAt: new Date(rescheduleAt).toISOString(),
        }),
      });
      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      toast.success("Scheduled publish updated.");
      setEditingJobId(null);
      setRescheduleAt("");
      await onJobsMutated?.(job.postId ?? undefined, "reschedule");
      await loadJobs(true);
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Could not reschedule publish.";
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
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          disabled={isBusy}
                          onClick={() => {
                            setEditingJobId(job.id);
                            setRescheduleAt(toInputValue(job.publishAt));
                          }}
                        >
                          Reschedule
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
                      <LabelLine>Reschedule publish time</LabelLine>
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                        <Input
                          type="datetime-local"
                          aria-label={`Reschedule publish time for ${job.id}`}
                          value={rescheduleAt}
                          onChange={(event) => setRescheduleAt(event.target.value)}
                          className="text-xs"
                        />
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="xs"
                            disabled={!rescheduleAt || isBusy}
                            onClick={() => void handleReschedule(job)}
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
                              setEditingJobId(null);
                              setRescheduleAt("");
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
