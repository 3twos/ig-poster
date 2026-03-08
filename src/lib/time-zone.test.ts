import { describe, expect, it } from "vitest";

import {
  formatDateTimeLocalInput,
  parseDateTimeLocalInput,
} from "@/lib/time-zone";

describe("time-zone helpers", () => {
  it("formats datetime-local values in the provided timezone", () => {
    expect(
      formatDateTimeLocalInput(
        "2026-03-10T18:30:00.000Z",
        "America/New_York",
      ),
    ).toBe("2026-03-10T14:30");
  });

  it("parses datetime-local values in the provided timezone", () => {
    expect(
      parseDateTimeLocalInput(
        "2026-03-11T09:45",
        "America/Los_Angeles",
      )?.toISOString(),
    ).toBe("2026-03-11T16:45:00.000Z");
  });

  it("rejects nonexistent wall-clock times during DST transitions", () => {
    expect(
      parseDateTimeLocalInput("2026-03-08T02:30", "America/Los_Angeles"),
    ).toBeNull();
  });
});
