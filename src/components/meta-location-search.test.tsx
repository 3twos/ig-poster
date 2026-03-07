// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MetaLocationSearchField } from "./meta-location-search";

describe("MetaLocationSearchField", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("searches Meta locations and selects a result", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          locations: [
            {
              id: "12345",
              name: "Napa Valley Welcome Center",
              city: "Napa",
              state: "CA",
              country: "United States",
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const TestHarness = () => {
      const [locationId, setLocationId] = useState("");

      return (
        <MetaLocationSearchField
          ariaLabel="Search Meta locations"
          locationId={locationId}
          onSelectLocationId={setLocationId}
        />
      );
    };

    render(<TestHarness />);

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Search Meta locations"), {
        target: { value: "napa" },
      });
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/meta/locations?q=napa", {
        cache: "no-store",
      });
    });

    await act(async () => {
      fireEvent.click(await screen.findByText("Napa Valley Welcome Center"));
    });

    expect(screen.getByText("Location ID 12345")).not.toBeNull();
  });
});
