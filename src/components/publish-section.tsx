"use client";

import {
  CalendarClock,
  Link2,
  LoaderCircle,
  Send,
} from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PublishJobQueue } from "@/components/publish-job-queue";
import type { InstagramAuthStatus } from "@/lib/types";

type PublishMetadataInput = {
  firstComment?: string;
  locationId?: string;
  userTagsText?: string;
};

type Props = {
  activePostId?: string;
  authStatus: InstagramAuthStatus;
  isAuthLoading: boolean;
  isSharing: boolean;
  isPublishing: boolean;
  onPublishJobsMutated?: (
    postId: string | undefined,
    action: "cancel" | "reschedule" | "edit" | "retry-now",
  ) => Promise<void> | void;
  publishJobsRefreshKey: number;
  shareUrl: string | null;
  shareCopyState: "idle" | "done";
  localTimeZone: string;
  onOpenSettings: () => void;
  onCreateShareLink: () => void;
  onPostNow: (metadata?: PublishMetadataInput) => void;
  onSchedulePost: (
    scheduleAt: string,
    metadata?: PublishMetadataInput,
  ) => void;
};

export function PublishSection({
  activePostId,
  authStatus,
  isAuthLoading,
  isSharing,
  isPublishing,
  onPublishJobsMutated,
  publishJobsRefreshKey,
  shareUrl,
  shareCopyState,
  localTimeZone,
  onOpenSettings,
  onCreateShareLink,
  onPostNow,
  onSchedulePost,
}: Props) {
  const [scheduleAt, setScheduleAt] = useState("");
  const [firstComment, setFirstComment] = useState("");
  const [locationId, setLocationId] = useState("");
  const [userTagsText, setUserTagsText] = useState("");
  const normalizedFirstComment = firstComment.trim() || undefined;
  const normalizedLocationId = locationId.trim() || undefined;
  const normalizedUserTagsText = userTagsText.trim() || undefined;
  const firstCommentInputId = useId();
  const locationInputId = useId();
  const userTagsInputId = useId();

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold tracking-[0.18em] text-slate-300 uppercase">
        Share + Publish
      </p>

      {/* Instagram Account */}
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

      <div className="space-y-1 rounded-xl border border-white/15 bg-white/5 p-3">
        <Label htmlFor={firstCommentInputId} className="text-[11px] text-slate-300">
          First comment (optional)
        </Label>
        <Textarea
          id={firstCommentInputId}
          aria-label="First comment (optional)"
          value={firstComment}
          onChange={(event) => setFirstComment(event.target.value)}
          className="min-h-[76px] text-xs"
          maxLength={2200}
          placeholder="Add a first comment to post immediately after publish..."
        />
        <p className="text-[11px] text-slate-400">
          {firstComment.trim().length}/2200
        </p>
      </div>

      <div className="space-y-2 rounded-xl border border-white/15 bg-white/5 p-3">
        <Label htmlFor={locationInputId} className="text-[11px] text-slate-300">
          Location ID (image posts, optional)
        </Label>
        <Input
          id={locationInputId}
          aria-label="Location ID (optional)"
          value={locationId}
          onChange={(event) => setLocationId(event.target.value)}
          className="text-xs"
          placeholder="Facebook location ID"
        />
        <Label htmlFor={userTagsInputId} className="text-[11px] text-slate-300">
          User tags (image posts, optional)
        </Label>
        <Textarea
          id={userTagsInputId}
          aria-label="User tags (optional)"
          value={userTagsText}
          onChange={(event) => setUserTagsText(event.target.value)}
          className="min-h-[72px] text-xs"
          placeholder="@username,0.50,0.50"
        />
        <p className="text-[11px] text-slate-400">
          One tag per line: `username,x,y` where x and y are between 0 and 1.
        </p>
      </div>

      <div className="grid gap-2">
        <Button
          type="button"
          disabled={isPublishing || isAuthLoading || !authStatus.connected}
          onClick={() =>
            onPostNow({
              firstComment: normalizedFirstComment,
              locationId: normalizedLocationId,
              userTagsText: normalizedUserTagsText,
            })}
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
              disabled={isPublishing || isAuthLoading || !scheduleAt || !authStatus.connected}
              onClick={() =>
                onSchedulePost(scheduleAt, {
                  firstComment: normalizedFirstComment,
                  locationId: normalizedLocationId,
                  userTagsText: normalizedUserTagsText,
                })}
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
    </div>
  );
}
