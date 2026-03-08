"use client";

import {
  CalendarClock,
  Link2,
  LoaderCircle,
  Send,
} from "lucide-react";
import { useState } from "react";

import { ScheduledPlanner } from "@/components/scheduled-planner";
import { PublishJobQueue } from "@/components/publish-job-queue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { InstagramAuthStatus } from "@/lib/types";

type Props = {
  activePostId?: string;
  authStatus: InstagramAuthStatus;
  isAuthLoading: boolean;
  isSharing: boolean;
  isPublishing: boolean;
  hasBlockingValidationError?: boolean;
  validationMessage?: string | null;
  onPublishJobsMutated?: (
    postId: string | undefined,
    action: "cancel" | "reschedule" | "edit" | "move-to-draft" | "retry-now",
  ) => Promise<void> | void;
  publishJobsRefreshKey: number;
  shareUrl: string | null;
  shareCopyState: "idle" | "done";
  localTimeZone: string;
  onOpenSettings: () => void;
  onCreateShareLink: () => void;
  onPostNow: () => void;
  onSchedulePost: (scheduleAt: string) => void;
  onSelectPlannerPost?: (postId: string) => Promise<void> | void;
};

export function PublishSection({
  activePostId,
  authStatus,
  isAuthLoading,
  isSharing,
  isPublishing,
  hasBlockingValidationError = false,
  validationMessage,
  onPublishJobsMutated,
  publishJobsRefreshKey,
  shareUrl,
  shareCopyState,
  localTimeZone,
  onOpenSettings,
  onCreateShareLink,
  onPostNow,
  onSchedulePost,
  onSelectPlannerPost,
}: Props) {
  const [scheduleAt, setScheduleAt] = useState("");
  const [plannerOpen, setPlannerOpen] = useState(false);

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold tracking-[0.18em] text-slate-300 uppercase">
        Share + Publish
      </p>

      <div className="rounded-xl border border-white/15 bg-white/5 p-3 text-xs text-slate-200">
        <p className="font-semibold text-slate-100">Instagram Publishing Account</p>
        {isAuthLoading ? (
          <p className="mt-1 text-slate-300">Checking connection...</p>
        ) : (
          <p className="mt-1 text-slate-300">
            {authStatus.connected
              ? `Connected via ${(authStatus.source ?? "oauth").toUpperCase()}${authStatus.account?.instagramUsername ? ` as @${authStatus.account.instagramUsername}` : ""}${authStatus.account?.pageName ? ` (${authStatus.account.pageName})` : ""}.`
              : "No account connected. Configure Meta publishing access from Settings."}
          </p>
        )}
        {authStatus.account?.tokenExpiresAt ? (
          <p className="mt-1 text-slate-300">
            Token expiry: {new Date(authStatus.account.tokenExpiresAt).toLocaleString()}
          </p>
        ) : null}
        <Button variant="outline" size="xs" onClick={onOpenSettings} className="mt-2">
          Manage in Settings
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onCreateShareLink}
          disabled={isSharing}
        >
          {isSharing ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Link2 className="h-3.5 w-3.5" />
          )}
          Create Share Link
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPlannerOpen(true)}
        >
          <CalendarClock className="h-3.5 w-3.5" />
          Planner
        </Button>
      </div>

      {shareUrl ? (
        <div className="rounded-xl border border-emerald-300/35 bg-emerald-400/10 p-3 text-xs text-emerald-100">
          <p className="font-semibold">Share link ready:</p>
          <p className="mt-1 break-all">{shareUrl}</p>
          <p className="mt-1">
            {shareCopyState === "done"
              ? "Copied to clipboard"
              : "Copied automatically when created"}
          </p>
        </div>
      ) : null}

      {validationMessage ? (
        <div className="rounded-xl border border-amber-300/35 bg-amber-400/10 p-3 text-[11px] text-amber-100">
          {validationMessage}
        </div>
      ) : null}

      <div className="grid gap-2">
        <Button
          type="button"
          disabled={isPublishing || isAuthLoading || !authStatus.connected || hasBlockingValidationError}
          onClick={onPostNow}
          className="bg-emerald-400 text-slate-950 hover:bg-emerald-300"
        >
          {isPublishing ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          Post now
        </Button>

        <div className="space-y-1 rounded-xl border border-white/15 bg-white/5 p-3">
          <Label className="text-[11px] text-slate-300">Post at</Label>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row">
            <Input
              type="datetime-local"
              value={scheduleAt}
              onChange={(event) => setScheduleAt(event.target.value)}
              className="text-xs"
            />
            <Button
              type="button"
              variant="outline"
              disabled={isPublishing || isAuthLoading || !scheduleAt || !authStatus.connected || hasBlockingValidationError}
              onClick={() => onSchedulePost(scheduleAt)}
              className="sm:min-w-[135px]"
            >
              <CalendarClock className="h-3.5 w-3.5" />
              Schedule
            </Button>
          </div>
          <p className="text-[11px] text-slate-400">
            Time uses your local timezone: {localTimeZone}
          </p>
        </div>
      </div>

      <PublishJobQueue
        activePostId={activePostId}
        localTimeZone={localTimeZone}
        onJobsMutated={onPublishJobsMutated}
        refreshKey={publishJobsRefreshKey}
      />

      <Sheet open={plannerOpen} onOpenChange={setPlannerOpen}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto border-l border-white/15 bg-slate-950/95 px-0 sm:max-w-3xl"
        >
          <SheetHeader className="px-6">
            <SheetTitle className="text-left text-sm text-slate-100">
              Scheduled Planner
            </SheetTitle>
          </SheetHeader>
          <div className="px-6 pb-6 pt-4">
            <ScheduledPlanner
              activePostId={activePostId}
              localTimeZone={localTimeZone}
              onJobsMutated={onPublishJobsMutated}
              onSelectPost={async (postId) => {
                await onSelectPlannerPost?.(postId);
                setPlannerOpen(false);
              }}
              refreshKey={publishJobsRefreshKey}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
