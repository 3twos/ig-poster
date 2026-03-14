"use client";

import { KeyRound, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { InstagramAuthStatus } from "@/lib/types";
import { parseApiError } from "@/lib/upload-helpers";

export function GeneralSection() {
  const oauthConnectHref = "/api/auth/meta/start?scopeProfile=page-publishing";
  const [metaStatus, setMetaStatus] = useState<InstagramAuthStatus>({
    connected: false,
    source: null,
  });
  const [isMetaLoading, setIsMetaLoading] = useState(true);
  const [isMetaDisconnecting, setIsMetaDisconnecting] = useState(false);

  const loadMetaStatus = useCallback(async () => {
    setIsMetaLoading(true);
    try {
      const response = await fetch("/api/auth/meta/status", { cache: "no-store" });
      const json = (await response.json()) as InstagramAuthStatus;
      setMetaStatus({
        connected: Boolean(json.connected),
        source: json.source ?? null,
        account: json.account,
        detail: json.detail,
      });
    } catch {
      setMetaStatus({ connected: false, source: null, detail: "Could not load Meta auth status." });
    } finally {
      setIsMetaLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMetaStatus();
  }, [loadMetaStatus]);

  const disconnectMeta = async () => {
    setIsMetaDisconnecting(true);
    try {
      const response = await fetch("/api/auth/meta/disconnect", { method: "POST" });
      if (!response.ok) throw new Error(await parseApiError(response));
      setMetaStatus({ connected: false, source: null });
      toast.success("Meta OAuth disconnected.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not disconnect Meta OAuth");
    } finally {
      setIsMetaDisconnecting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Meta Publishing Pair */}
      <div className="rounded-3xl border border-white/15 bg-slate-900/55 p-5 backdrop-blur-xl md:p-6">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
          <KeyRound className="h-4 w-4 text-blue-300" />
          Meta Publishing Pair
        </div>

        {isMetaLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full rounded-xl" />
          </div>
        ) : metaStatus.connected ? (
          <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-slate-200">
            <p>
              Connected via{" "}
              <span className="font-semibold uppercase">{metaStatus.source ?? "oauth"}</span>
              {metaStatus.account?.instagramUsername ? ` as @${metaStatus.account.instagramUsername}` : ""}
              {metaStatus.account?.pageName ? ` (${metaStatus.account.pageName})` : ""}
            </p>
            {metaStatus.account?.tokenExpiresAt ? (
              <p className="mt-1 text-slate-400">
                Token expiry: {new Date(metaStatus.account.tokenExpiresAt).toLocaleString()}
              </p>
            ) : null}
            {metaStatus.account?.capabilities?.facebook.publishEnabled === false ? (
              <p className="mt-1 text-amber-200">
                Reconnect Meta OAuth to grant Facebook Page posting permissions for this publishing pair.
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {metaStatus.source === "oauth" ? (
                <Button variant="outline" size="sm" onClick={() => void disconnectMeta()} disabled={isMetaDisconnecting}>
                  {isMetaDisconnecting ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
                  Disconnect OAuth
                </Button>
              ) : null}
              <a
                href={oauthConnectHref}
                className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-white/10"
              >
                Reconnect with OAuth
              </a>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-slate-300">
            <p>Connect a Meta publishing pair to publish to Instagram and Facebook from this workspace. The browser OAuth flow requests Page posting permissions up front so cross-posting is ready after connect.</p>
            <a
              href={oauthConnectHref}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-400 px-3 py-1.5 text-[11px] font-semibold text-slate-950 transition hover:bg-blue-300"
            >
              Connect with Meta OAuth
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
