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
    vi.useRealTimers();
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
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/meta/locations?q=napa",
        expect.objectContaining({
          cache: "no-store",
        }),
      );
    });

    await act(async () => {
      fireEvent.click(await screen.findByText("Napa Valley Welcome Center"));
    });

    expect(screen.getByText("Location ID 12345")).not.toBeNull();
  });

  it("clears a selected location when the user clicks the search X button", async () => {
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

    await screen.findByText("Napa Valley Welcome Center");

    await act(async () => {
      fireEvent.click(screen.getByText("Napa Valley Welcome Center"));
    });

    expect(screen.getByText("Location ID 12345")).not.toBeNull();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Search Meta locations clear search",
      }),
    );

    await waitFor(() => {
      expect(screen.queryByText("Location ID 12345")).toBeNull();
    });
  });

  it("drops the selected place badge when the parent changes locationId manually", async () => {
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
        <>
          <input
            aria-label="Manual location id"
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
          />
          <MetaLocationSearchField
            ariaLabel="Search Meta locations"
            locationId={locationId}
            onSelectLocationId={setLocationId}
          />
        </>
      );
    };

    render(<TestHarness />);

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Search Meta locations"), {
        target: { value: "napa" },
      });
    });

    await screen.findByText("Napa Valley Welcome Center");

    await act(async () => {
      fireEvent.click(screen.getByText("Napa Valley Welcome Center"));
    });

    expect(screen.getByText("Location ID 12345")).not.toBeNull();

    fireEvent.change(screen.getByLabelText("Manual location id"), {
      target: { value: "99999" },
    });

    await waitFor(() => {
      expect(screen.queryByText("Location ID 12345")).toBeNull();
      expect(screen.getByText("Using manual location ID 99999")).not.toBeNull();
    });
  });

  it("does not leave loading stuck when an in-flight search is cancelled", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      }),
    );

    render(
      <MetaLocationSearchField
        ariaLabel="Search Meta locations"
        locationId=""
        onSelectLocationId={() => {}}
      />,
    );

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Search Meta locations"), {
        target: { value: "napa" },
      });
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(screen.getByText("Searching Meta locations...")).not.toBeNull();

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Search Meta locations"), {
        target: { value: "n" },
      });
      await Promise.resolve();
    });

    expect(screen.queryByText("Searching Meta locations...")).toBeNull();
  });
});
