"use client";

import {
  LayoutTemplate,
  Link2,
  LoaderCircle,
  Send,
} from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CreativeVariant } from "@/lib/creative";
import type { InstagramAuthStatus } from "@/lib/types";
import { createDefaultOverlayLayout } from "@/lib/creative";

type Props = {
  activeVariant: CreativeVariant | null;
  authStatus: InstagramAuthStatus;
  isAuthLoading: boolean;
  isDisconnecting: boolean;
  isSharing: boolean;
  isPublishing: boolean;
  shareUrl: string | null;
  shareCopyState: "idle" | "done";
  dispatch: (action: Record<string, unknown>) => void;
  onDisconnectInstagram: () => void;
  onCreateShareLink: () => void;
  onPublishToInstagram: (event: FormEvent) => void;
};

export function PublishSection({
  activeVariant,
  authStatus,
  isAuthLoading,
  isDisconnecting,
  isSharing,
  isPublishing,
  shareUrl,
  shareCopyState,
  dispatch,
  onDisconnectInstagram,
  onCreateShareLink,
  onPublishToInstagram,
}: Props) {
  const [scheduleAt, setScheduleAt] = useState("");

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold tracking-[0.18em] text-slate-300 uppercase">
        Share + Publish
      </p>

      {/* Instagram Account */}
      <div className="rounded-xl border border-white/15 bg-white/5 p-3 text-xs text-slate-200">
        <p className="font-semibold text-slate-100">Instagram Account</p>

        {isAuthLoading ? (
          <p className="mt-1 text-slate-300">Checking connection...</p>
        ) : null}

        {!isAuthLoading && authStatus.connected ? (
          <div className="mt-1 space-y-1">
            <p>
              Connected via{" "}
              <span className="font-semibold uppercase">{authStatus.source}</span>
              {authStatus.account?.instagramUsername
                ? ` as @${authStatus.account.instagramUsername}`
                : ""}
              {authStatus.account?.pageName
                ? ` (${authStatus.account.pageName})`
                : ""}
            </p>
            {authStatus.account?.tokenExpiresAt ? (
              <p className="text-slate-300">
                Token expiry:{" "}
                {new Date(authStatus.account.tokenExpiresAt).toLocaleString()}
              </p>
            ) : null}

            {authStatus.source === "oauth" ? (
              <Button
                variant="outline"
                size="xs"
                onClick={onDisconnectInstagram}
                disabled={isDisconnecting}
                className="mt-2"
              >
                {isDisconnecting ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                Disconnect OAuth
              </Button>
            ) : (
              <a
                href="/api/auth/meta/start"
                className="mt-2 inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-white/10"
              >
                Reconnect with OAuth
              </a>
            )}
          </div>
        ) : null}

        {!isAuthLoading && !authStatus.connected ? (
          <div className="mt-2">
            <p className="text-slate-300">
              Connect your brand account to publish directly from this app.
            </p>
            <a
              href="/api/auth/meta/start"
              className="mt-2 inline-flex items-center gap-2 rounded-lg bg-blue-400 px-2.5 py-1.5 text-[11px] font-semibold text-slate-950 transition hover:bg-blue-300"
            >
              Connect with Meta OAuth
            </a>
          </div>
        ) : null}
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
          disabled={!activeVariant}
          onClick={() => {
            if (!activeVariant) return;
            dispatch({
              type: "UPDATE_OVERLAY",
              variantId: activeVariant.id,
              layout: createDefaultOverlayLayout(activeVariant.layout),
            });
          }}
        >
          <LayoutTemplate className="h-3.5 w-3.5" />
          Reset Text Layout
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

      <form onSubmit={(e) => { onPublishToInstagram(e); }} className="grid gap-2">
        <div className="space-y-1">
          <Label className="text-[11px] text-slate-300">
            Schedule (optional)
          </Label>
          <Input
            type="datetime-local"
            value={scheduleAt}
            onChange={(event) => setScheduleAt(event.target.value)}
            className="text-xs"
          />
        </div>

        <Button
          type="submit"
          disabled={isPublishing}
          className="bg-emerald-400 text-slate-950 hover:bg-emerald-300"
        >
          {isPublishing ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          {scheduleAt ? "Schedule Instagram Publish" : "Publish to Instagram"}
        </Button>
      </form>
    </div>
  );
}
