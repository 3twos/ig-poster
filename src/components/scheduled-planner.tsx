"use client";

import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  FolderInput,
  LoaderCircle,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PublishJobClient } from "@/lib/meta-schemas";
import { PublishJobListResponseSchema } from "@/lib/meta-schemas";
import {
  formatDateTimeLocalInput,
  parseDateTimeLocalInput,
} from "@/lib/time-zone";
import { parseApiError } from "@/lib/upload-helpers";
import { cn } from "@/lib/utils";

type PlannerAction = "cancel" | "edit" | "move-to-draft" | "reschedule" | "retry-now";

type Props = {
  activePostId?: string;
  localTimeZone: string;
  refreshKey: number;
  onJobsMutated?: (
    postId: string | undefined,
    action: PlannerAction,
  ) => Promise<void> | void;
  onSelectPost?: (postId: string) => Promise<void> | void;
};

const PLANNER_QUERY = "status=queued,processing&limit=50&syncMeta=facebook";
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const fetchScheduledJobs = async () => {
  const response = await fetch(`/api/publish-jobs?${PLANNER_QUERY}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  const json = PublishJobListResponseSchema.parse(await response.json());
  return json.jobs;
};

const formatParts = (date: Date, localTimeZone: string) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: localTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return { year, month, day };
};

const toDayKey = (iso: string, localTimeZone: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const { year, month, day } = formatParts(date, localTimeZone);
  return `${year}-${month}-${day}`;
};

const formatDayLabel = (dayKey: string, localTimeZone: string) => {
  const date = new Date(`${dayKey}T12:00:00`);
  return new Intl.DateTimeFormat(undefined, {
    timeZone: localTimeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
};

const formatPublishTime = (iso: string, localTimeZone: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return `${new Intl.DateTimeFormat(undefined, {
    timeZone: localTimeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(date)} (${localTimeZone})`;
};

const shiftMonth = (monthKey: string, delta: number) => {
  const [yearString, monthString] = monthKey.split("-");
  const monthDate = new Date(Number(yearString), Number(monthString) - 1 + delta, 1);
  return `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;
};

const monthLabel = (monthKey: string, localTimeZone: string) => {
  const [yearString, monthString] = monthKey.split("-");
  const date = new Date(Number(yearString), Number(monthString) - 1, 1, 12);
  return new Intl.DateTimeFormat(undefined, {
    timeZone: localTimeZone,
    month: "long",
    year: "numeric",
  }).format(date);
};

const destinationTone = (destination: PublishJobClient["destination"]) =>
  destination === "facebook"
    ? "border-sky-300/35 bg-sky-400/10 text-sky-100"
    : "border-pink-300/35 bg-pink-400/10 text-pink-100";

const destinationLabel = (destination: PublishJobClient["destination"]) =>
  destination === "facebook" ? "Facebook" : "Instagram";

const remoteAuthorityLabel = (
  remoteAuthority: PublishJobClient["remoteAuthority"],
) =>
  remoteAuthority === "remote_authoritative" ? "Meta-synced" : "App-managed";

const buildMonthGrid = (monthKey: string) => {
  const [yearString, monthString] = monthKey.split("-");
  const year = Number(yearString);
  const month = Number(monthString) - 1;
  const monthStart = new Date(year, month, 1);
  const firstWeekday = monthStart.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ dayKey: string | null; dayNumber: number | null }> = [];

  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push({ dayKey: null, dayNumber: null });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dayKey = `${yearString}-${monthString}-${String(day).padStart(2, "0")}`;
    cells.push({ dayKey, dayNumber: day });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ dayKey: null, dayNumber: null });
  }

  return cells;
};

export function ScheduledPlanner({
  activePostId,
  localTimeZone,
  refreshKey,
  onJobsMutated,
  onSelectPost,
}: Props) {
  const [jobs, setJobs] = useState<PublishJobClient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [selectedDayKey, setSelectedDayKey] = useState("");
  const [visibleMonthKey, setVisibleMonthKey] = useState("");
  const [rescheduleJobId, setRescheduleJobId] = useState<string | null>(null);
  const [rescheduleAt, setRescheduleAt] = useState("");

  const loadJobs = useCallback(async () => {
    setLoadError(null);
    setIsLoading(true);
    try {
      const nextJobs = await fetchScheduledJobs();
      setJobs(nextJobs);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Could not load scheduled posts.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs, refreshKey]);

  const jobsByDay = useMemo(() => {
    const mapped = new Map<string, PublishJobClient[]>();
    for (const job of jobs) {
      const dayKey = toDayKey(job.publishAt, localTimeZone);
      if (!dayKey) continue;
      const current = mapped.get(dayKey) ?? [];
      current.push(job);
      mapped.set(dayKey, current);
    }
    return mapped;
  }, [jobs, localTimeZone]);

  const dayKeys = useMemo(
    () => Array.from(jobsByDay.keys()).sort(),
    [jobsByDay],
  );

  useEffect(() => {
    if (dayKeys.length === 0) {
      const today = toDayKey(new Date().toISOString(), localTimeZone);
      setSelectedDayKey(today);
      setVisibleMonthKey(today.slice(0, 7));
      return;
    }

    setSelectedDayKey((current) => (current && jobsByDay.has(current) ? current : dayKeys[0]));
    setVisibleMonthKey((current) => {
      if (current) return current;
      return dayKeys[0]?.slice(0, 7) ?? toDayKey(new Date().toISOString(), localTimeZone).slice(0, 7);
    });
  }, [dayKeys, jobsByDay, localTimeZone]);

  const selectedJobs = useMemo(
    () => (selectedDayKey ? jobsByDay.get(selectedDayKey) ?? [] : []),
    [jobsByDay, selectedDayKey],
  );
  const countsByDay = useMemo(() => {
    const mapped = new Map<string, number>();
    for (const [dayKey, dayJobs] of jobsByDay.entries()) {
      mapped.set(dayKey, dayJobs.length);
    }
    return mapped;
  }, [jobsByDay]);
  const calendarCells = useMemo(
    () => buildMonthGrid(visibleMonthKey || toDayKey(new Date().toISOString(), localTimeZone).slice(0, 7)),
    [localTimeZone, visibleMonthKey],
  );

  const patchJob = useCallback(
    async (
      job: PublishJobClient,
      payload: Record<string, unknown>,
      action: PlannerAction,
      successMessage: string,
    ) => {
      setBusyJobId(job.id);
      try {
        const response = await fetch(`/api/publish-jobs/${job.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error(await parseApiError(response));
        }

        toast.success(successMessage);
        if (action === "reschedule") {
          setRescheduleJobId(null);
          setRescheduleAt("");
        }
        await loadJobs();
        await onJobsMutated?.(job.postId ?? undefined, action);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not update scheduled post.",
        );
      } finally {
        setBusyJobId(null);
      }
    },
    [loadJobs, onJobsMutated],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-slate-300 uppercase">
            Planner
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Review upcoming scheduled Meta publishes by day and destination.
          </p>
        </div>
        <Badge variant="outline" className="text-[10px] uppercase">
          {jobs.length} scheduled
        </Badge>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-white/15 bg-white/5 p-4 text-sm text-slate-300">
          <div className="flex items-center gap-2">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Loading planner...
          </div>
        </div>
      ) : loadError ? (
        <div className="rounded-xl border border-red-300/35 bg-red-400/10 p-4 text-sm text-red-100">
          <p>{loadError}</p>
          <Button variant="outline" size="xs" className="mt-3" onClick={() => void loadJobs()}>
            Retry
          </Button>
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-xl border border-white/15 bg-white/5 p-4 text-sm text-slate-300">
          No scheduled posts yet.
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <Button
                variant="outline"
                size="icon-xs"
                aria-label="Previous month"
                onClick={() => setVisibleMonthKey((current) => shiftMonth(current, -1))}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <p className="text-sm font-medium text-slate-100">
                {monthLabel(visibleMonthKey, localTimeZone)}
              </p>
              <Button
                variant="outline"
                size="icon-xs"
                aria-label="Next month"
                onClick={() => setVisibleMonthKey((current) => shiftMonth(current, 1))}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-slate-500">
              {WEEKDAY_LABELS.map((label) => (
                <div key={label}>{label}</div>
              ))}
            </div>

            <div className="mt-2 grid grid-cols-7 gap-1">
              {calendarCells.map((cell, index) =>
                cell.dayKey ? (
                  <button
                    key={cell.dayKey}
                    type="button"
                    onClick={() => setSelectedDayKey(cell.dayKey!)}
                    className={cn(
                      "min-h-14 rounded-xl border px-1 py-2 text-left transition",
                      selectedDayKey === cell.dayKey
                        ? "border-orange-300/40 bg-orange-400/12 text-orange-100"
                        : "border-white/10 bg-slate-950/40 text-slate-200 hover:border-white/20",
                    )}
                  >
                    <span className="block text-xs font-medium">{cell.dayNumber}</span>
                    {countsByDay.get(cell.dayKey) ? (
                      <span className="mt-1 inline-flex rounded-full bg-blue-400/15 px-1.5 py-0.5 text-[10px] text-blue-100">
                        {countsByDay.get(cell.dayKey)}
                      </span>
                    ) : null}
                  </button>
                ) : (
                  <div key={`empty-${index}`} className="min-h-14 rounded-xl border border-transparent" />
                ),
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-100">
                  {formatDayLabel(selectedDayKey, localTimeZone)}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {selectedJobs.length} scheduled post{selectedJobs.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>

            {selectedJobs.length === 0 ? (
              <div className="rounded-xl border border-white/15 bg-white/5 p-4 text-sm text-slate-300">
                No posts scheduled for this day.
              </div>
            ) : (
              selectedJobs.map((job) => {
                const isBusy = busyJobId === job.id;
                const isRescheduling = rescheduleJobId === job.id;
                const title = job.outcomeContext?.variantName ?? "Scheduled post";

                return (
                  <div
                    key={job.id}
                    className={cn(
                      "rounded-2xl border bg-white/5 p-4",
                      job.postId && job.postId === activePostId
                        ? "border-orange-300/35"
                        : "border-white/15",
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-100">
                          {title}
                        </p>
                        <p className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                          <CalendarClock className="h-3.5 w-3.5" />
                          {formatPublishTime(job.publishAt, localTimeZone)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {job.status}
                        </Badge>
                        <Badge
                          className={cn(
                            "text-[10px] uppercase",
                            destinationTone(job.destination),
                          )}
                        >
                          {destinationLabel(job.destination)}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="text-[10px] uppercase"
                        >
                          {remoteAuthorityLabel(job.remoteAuthority)}
                        </Badge>
                        {job.postId && job.postId === activePostId ? (
                          <Badge variant="outline" className="text-[10px] uppercase">
                            Current post
                          </Badge>
                        ) : null}
                      </div>
                    </div>

                    <p className="mt-3 line-clamp-3 text-sm text-slate-300">
                      {job.caption}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {job.postId && onSelectPost ? (
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => void onSelectPost(job.postId!)}
                          disabled={isBusy}
                        >
                          <FolderInput className="h-3.5 w-3.5" />
                          Open post
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        size="xs"
                          onClick={() => {
                            setRescheduleJobId((current) =>
                              current === job.id ? null : job.id,
                            );
                            setRescheduleAt(
                              formatDateTimeLocalInput(
                                job.publishAt,
                                localTimeZone,
                              ),
                            );
                          }}
                          disabled={isBusy || job.status === "processing"}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reschedule
                      </Button>
                      {job.postId ? (
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() =>
                            void patchJob(
                              job,
                              { action: "move-to-draft" },
                              "move-to-draft",
                              "Moved back to draft.",
                            )
                          }
                          disabled={isBusy || job.status === "processing"}
                        >
                          <FolderInput className="h-3.5 w-3.5" />
                          Move to draft
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() =>
                          void patchJob(
                            job,
                            { action: "cancel" },
                            "cancel",
                            "Schedule removed.",
                          )
                        }
                        disabled={isBusy || job.status === "processing"}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Cancel
                      </Button>
                    </div>

                    {isRescheduling ? (
                      <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/35 p-3">
                        <label
                          htmlFor={`planner-reschedule-${job.id}`}
                          className="text-[11px] text-slate-300"
                        >
                          New publish time
                        </label>
                        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                          <Input
                            id={`planner-reschedule-${job.id}`}
                            type="datetime-local"
                            value={rescheduleAt}
                            onChange={(event) => setRescheduleAt(event.target.value)}
                            className="text-xs"
                          />
                          <Button
                            size="xs"
                            disabled={!rescheduleAt || isBusy}
                            onClick={() => {
                              const parsedPublishAt = parseDateTimeLocalInput(
                                rescheduleAt,
                                localTimeZone,
                              );
                              if (!parsedPublishAt) {
                                toast.error(
                                  `Choose a valid publish time in ${localTimeZone}.`,
                                );
                                return;
                              }

                              void patchJob(
                                job,
                                {
                                  action: "reschedule",
                                  publishAt: parsedPublishAt.toISOString(),
                                },
                                "reschedule",
                                "Publish time updated.",
                              );
                            }}
                          >
                            {isBusy ? (
                              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <CalendarClock className="h-3.5 w-3.5" />
                            )}
                            Save time
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
