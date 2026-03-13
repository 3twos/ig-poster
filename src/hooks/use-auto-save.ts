import { useCallback, useEffect, useRef, useState } from "react";

import { withPerfSync } from "@/lib/perf";
import { serializePostDraft } from "@/lib/post-draft";
import type { PostDraft } from "./use-post-reducer";

export type SaveStatus = "saved" | "saving" | "unsaved" | "error";

/** HTTP status codes that indicate a permanent, non-retryable failure */
const PERMANENT_ERROR_CODES = new Set([400, 401, 403, 404, 409, 422]);

const MAX_RETRIES = 3;
const BASE_RETRY_MS = 5_000; // 5s, 15s, 45s with 3x backoff

/** @deprecated Use serializePostDraft from @/lib/post-draft instead */
export function serializeDraft(draft: PostDraft): string {
  return serializePostDraft(draft);
}

export function useAutoSave(
  draft: PostDraft | null,
  options?: { onSaved?: () => void },
) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const lastSavedRef = useRef<string | null>(null);
  const lastSerializedRef = useRef<{ id: string; json: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const retryCountRef = useRef(0);
  const onSavedRef = useRef(options?.onSaved);
  onSavedRef.current = options?.onSaved;
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // Mark saved (called externally after load)
  const markSaved = useCallback(() => {
    const d = draftRef.current;
    if (d) {
      lastSavedRef.current = withPerfSync("autoSave:serialize", () =>
        serializePostDraft(d),
      );
    }
    retryCountRef.current = 0;
    setSaveStatus("saved");
  }, []);

  // Immediate save — always serializes fresh from draftRef to avoid stale cache
  const saveNow = useCallback(async () => {
    const d = draftRef.current;
    if (!d) return true;
    if (d.status === "posted") return true;

    const serialized = withPerfSync("autoSave:serialize", () =>
      serializePostDraft(d),
    );
    if (serialized === lastSavedRef.current) {
      setSaveStatus("saved");
      return true;
    }

    // Cancel any pending debounce
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // Cancel in-flight request
    if (controllerRef.current) {
      controllerRef.current.abort();
    }

    const controller = new AbortController();
    controllerRef.current = controller;

    setSaveStatus("saving");

    try {
      const res = await fetch(`/api/posts/${d.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: serialized,
        signal: controller.signal,
      });

      if (res.ok) {
        lastSavedRef.current = serialized;
        retryCountRef.current = 0;
        setSaveStatus("saved");
        onSavedRef.current?.();
        return true;
      } else if (PERMANENT_ERROR_CODES.has(res.status)) {
        // Permanent error (400/401/403/404/409/422) — do not retry
        setSaveStatus("error");
        return false;
      } else {
        // Transient error — retry with exponential backoff
        setSaveStatus("error");
        if (retryCountRef.current < MAX_RETRIES) {
          const delay = BASE_RETRY_MS * Math.pow(3, retryCountRef.current);
          retryCountRef.current += 1;
          timerRef.current = setTimeout(() => {
            void saveNow();
          }, delay);
        }
        return false;
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        return true;
      }

      // Network error — retry with exponential backoff
      setSaveStatus("error");
      if (retryCountRef.current < MAX_RETRIES) {
        const delay = BASE_RETRY_MS * Math.pow(3, retryCountRef.current);
        retryCountRef.current += 1;
        timerRef.current = setTimeout(() => {
          void saveNow();
        }, delay);
      }
      return false;
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    }
  }, []);

  // Debounced auto-save effect
  useEffect(() => {
    if (!draft) return;

    if (draft.status === "posted") {
      setSaveStatus("saved");
      return;
    }

    const serialized = withPerfSync("autoSave:serialize", () =>
      serializePostDraft(draft),
    );
    lastSerializedRef.current = { id: draft.id, json: serialized };
    if (serialized === lastSavedRef.current) {
      // Draft reverted to saved state (e.g. undo) — clear pending timer
      if (timerRef.current) clearTimeout(timerRef.current);
      setSaveStatus("saved");
      return;
    }

    setSaveStatus("unsaved");

    // Reset retry counter on new draft change so fresh edits get full retry budget
    retryCountRef.current = 0;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      void saveNow();
    }, 2000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [draft, saveNow]);

  return { saveStatus, saveNow, markSaved, lastSavedRef };
}
