import { describe, expect, it } from "vitest";

import { isGenerationRunEvent, toSseEvent } from "@/lib/generation-events";

describe("generation-events", () => {
  it("formats SSE payloads", () => {
    const payload = {
      type: "heartbeat" as const,
      detail: "Still working",
    };

    expect(toSseEvent(payload)).toBe(`data: ${JSON.stringify(payload)}\n\n`);
  });

  it("validates recognized event shapes", () => {
    expect(
      isGenerationRunEvent({
        type: "step-start",
        stepId: "assemble",
        title: "Assemble prompt",
        phase: "planning",
      }),
    ).toBe(true);

    expect(
      isGenerationRunEvent({
        type: "step-start",
        stepId: "assemble",
        title: "Assemble prompt",
        phase: "unknown",
      }),
    ).toBe(false);
  });
});
