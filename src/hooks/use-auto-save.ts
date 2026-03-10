import { useCallback, useEffect, useRef, useState } from "react";

import { withPerfSync } from "@/lib/perf";
import type { PostDraft } from "./use-post-reducer";

export type SaveStatus = "saved" | "saving" | "unsaved" | "error";

/** Strips transient fields before comparing / sending to API */
function serializeDraft(draft: PostDraft): string {
  const rest = { ...draft };
  delete (rest as { activeSlideIndex?: number }).activeSlideIndex;
  return JSON.stringify(rest);
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
  const onSavedRef = useRef(options?.onSaved);
  onSavedRef.current = options?.onSaved;
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // Mark saved (called externally after load)
  const markSaved = useCallback(() => {
    const d = draftRef.current;
    if (d) {
      lastSavedRef.current = withPerfSync("autoSave:serialize", () => serializeDraft(d));
    }
    setSaveStatus("saved");
  }, []);

  // Immediate save
  const saveNow = useCallback(async () => {
    const d = draftRef.current;
    if (!d) return;
    if (d.status === "posted") return;

    const cached = lastSerializedRef.current;
    const serialized = (cached && cached.id === d.id) ? cached.json : withPerfSync("autoSave:serialize", () => serializeDraft(d));
    if (serialized === lastSavedRef.current) return;

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
        setSaveStatus("saved");
        onSavedRef.current?.();
      } else {
        setSaveStatus("error");
        // Retry after 5 seconds
        timerRef.current = setTimeout(() => {
          void saveNow();
        }, 5000);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setSaveStatus("error");
        // Retry after 5 seconds
        timerRef.current = setTimeout(() => {
          void saveNow();
        }, 5000);
      }
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

    const serialized = withPerfSync("autoSave:serialize", () => serializeDraft(draft));
    lastSerializedRef.current = { id: draft.id, json: serialized };
    if (serialized === lastSavedRef.current) {
      // Draft reverted to saved state (e.g. undo) — clear pending timer
      if (timerRef.current) clearTimeout(timerRef.current);
      setSaveStatus("saved");
      return;
    }

    setSaveStatus("unsaved");

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      void saveNow();
    }, 2000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [draft, saveNow]);

  return { saveStatus, saveNow, markSaved };
}
