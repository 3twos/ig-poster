"use client";

import { LoaderCircle, MapPin, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MetaLocationSearchResponseSchema,
  type MetaLocationSearchResult,
} from "@/lib/meta-schemas";
import { parseApiError } from "@/lib/upload-helpers";

type Props = {
  ariaLabel: string;
  disabled?: boolean;
  locationId: string;
  onSelectLocationId: (nextLocationId: string) => void;
};

const formatLocationLine = (location: MetaLocationSearchResult) =>
  [location.city, location.state, location.country].filter(Boolean).join(", ");

export function MetaLocationSearchField({
  ariaLabel,
  disabled = false,
  locationId,
  onSelectLocationId,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MetaLocationSearchResult[]>([]);
  const [selectedLocation, setSelectedLocation] =
    useState<MetaLocationSearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeRequestIdRef = useRef(0);
  const hasSelectedQuery =
    Boolean(selectedLocation) && query.trim() === selectedLocation?.name;

  useEffect(() => {
    if (!locationId) {
      setSelectedLocation(null);
      return;
    }

    if (selectedLocation && selectedLocation.id !== locationId) {
      setSelectedLocation(null);
      setQuery("");
      setResults([]);
      setError(null);
    }
  }, [locationId, selectedLocation]);

  useEffect(() => {
    const trimmed = query.trim();
    activeRequestIdRef.current += 1;
    const requestId = activeRequestIdRef.current;

    if (trimmed.length < 2) {
      setResults([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    if (selectedLocation && trimmed === selectedLocation.name) {
      setResults([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/meta/locations?q=${encodeURIComponent(trimmed)}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) {
          throw new Error(await parseApiError(response));
        }

        const json = MetaLocationSearchResponseSchema.parse(
          await response.json(),
        );
        if (requestId !== activeRequestIdRef.current) {
          return;
        }

        setResults(json.locations);
      } catch (nextError) {
        if (requestId !== activeRequestIdRef.current) {
          return;
        }
        if (nextError instanceof DOMException && nextError.name === "AbortError") {
          return;
        }

        setResults([]);
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Could not search Meta locations.",
        );
      } finally {
        if (requestId === activeRequestIdRef.current) {
          setIsLoading(false);
        }
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, selectedLocation]);

  const selectLocation = (location: MetaLocationSearchResult) => {
    setSelectedLocation(location);
    setQuery(location.name);
    setResults([]);
    setError(null);
    onSelectLocationId(location.id);
  };

  const clearSelection = () => {
    setSelectedLocation(null);
    setQuery("");
    setResults([]);
    setError(null);
    onSelectLocationId("");
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
        <Input
          aria-label={ariaLabel}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="pl-9 pr-9 text-xs"
          placeholder="Search Meta locations by name"
          disabled={disabled}
        />
        {query ? (
          <button
            type="button"
            aria-label={`${ariaLabel} clear search`}
            className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-400 transition hover:text-slate-100"
            onClick={selectedLocation ? clearSelection : () => setQuery("")}
            disabled={disabled}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <p className="text-[11px] text-slate-400">
        Search Meta places and click a match to fill the location ID above.
      </p>

      {selectedLocation ? (
        <div className="flex items-start justify-between gap-3 rounded-md border border-emerald-300/25 bg-emerald-400/10 p-2 text-[11px] text-emerald-100">
          <div className="min-w-0">
            <p className="font-medium">{selectedLocation.name}</p>
            {formatLocationLine(selectedLocation) ? (
              <p className="mt-0.5 text-emerald-200/85">
                {formatLocationLine(selectedLocation)}
              </p>
            ) : null}
            <p className="mt-0.5 text-emerald-200/85">Location ID {locationId}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={clearSelection}
            disabled={disabled}
          >
            Clear
          </Button>
        </div>
      ) : locationId ? (
        <div className="rounded-md border border-white/10 bg-slate-950/35 p-2 text-[11px] text-slate-300">
          Using manual location ID {locationId}
        </div>
      ) : null}

      {error ? (
        <p className="text-[11px] text-red-200">{error}</p>
      ) : null}

      {isLoading ? (
        <div className="flex items-center gap-2 rounded-md border border-white/10 bg-slate-950/35 p-2 text-[11px] text-slate-300">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          Searching Meta locations...
        </div>
      ) : null}

      {!isLoading && results.length > 0 ? (
        <div className="space-y-1 rounded-md border border-white/10 bg-slate-950/35 p-1">
          {results.map((location) => (
            <button
              key={location.id}
              type="button"
              className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-xs text-slate-200 transition hover:bg-white/6"
              onClick={() => selectLocation(location)}
              disabled={disabled}
            >
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-200" />
              <span className="min-w-0">
                <span className="block truncate font-medium">{location.name}</span>
                {formatLocationLine(location) ? (
                  <span className="block truncate text-[11px] text-slate-400">
                    {formatLocationLine(location)}
                  </span>
                ) : null}
                <span className="block text-[11px] text-slate-500">
                  ID {location.id}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {!isLoading && !error && query.trim().length >= 2 && results.length === 0 &&
      !hasSelectedQuery ? (
        <p className="text-[11px] text-slate-400">
          No Meta location matches found.
        </p>
      ) : null}
    </div>
  );
}
