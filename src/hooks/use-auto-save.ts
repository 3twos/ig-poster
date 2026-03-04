import { useCallback, useEffect, useRef, useState } from "react";

import type { PostDraft } from "./use-post-reducer";

export type SaveStatus = "saved" | "saving" | "unsaved" | "error";

/** Strips transient fields before comparing / sending to API */
function serializeDraft(draft: PostDraft): string {
  const { activeSlideIndex: _unused, ...rest } = draft;
  return JSON.stringify(rest);
}

export function useAutoSave(draft: PostDraft | null) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const lastSavedRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  // Mark saved (called externally after load)
  const markSaved = useCallback(() => {
    if (draft) {
      lastSavedRef.current = serializeDraft(draft);
    }
    setSaveStatus("saved");
  }, [draft]);

  // Immediate save
  const saveNow = useCallback(async () => {
    if (!draft) return;

    const serialized = serializeDraft(draft);
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
      const res = await fetch(`/api/posts/${draft.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: serialized,
        signal: controller.signal,
      });

      if (res.ok) {
        lastSavedRef.current = serialized;
        setSaveStatus("saved");
      } else {
        setSaveStatus("error");
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setSaveStatus("error");
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    }
  }, [draft]);

  // Debounced auto-save effect
  useEffect(() => {
    if (!draft) return;

    const serialized = serializeDraft(draft);
    if (serialized === lastSavedRef.current) return;

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
