"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { InventoryFilterState } from "./InventoryBrowseUI";

export type InventorySuggestion = {
  inventoryItemId: string;
  name: string;
  setName?: string;
  listPrice?: number;
  qty: number;
  imageUrl?: string;
  isCommander?: boolean;
};

async function parseSuggestResponse(res: Response): Promise<{
  suggestions: InventorySuggestion[];
  error?: string;
}> {
  const text = await res.text();
  try {
    const body = JSON.parse(text) as {
      suggestions?: InventorySuggestion[];
      error?: string;
    };
    if (!res.ok) {
      return { suggestions: [], error: body.error ?? text.slice(0, 80) };
    }
    return { suggestions: body.suggestions ?? [] };
  } catch {
    return {
      suggestions: [],
      error: res.ok ? "Invalid response" : text.slice(0, 80) || `HTTP ${res.status}`,
    };
  }
}

export function InventorySearchAutocomplete({
  slug,
  filters,
  onChange,
  onCommit,
}: {
  slug: string;
  filters: InventoryFilterState;
  onChange: (next: Partial<InventoryFilterState>) => void;
  /** Run full grid search immediately (Enter or suggestion pick). */
  onCommit?: (q: string) => void;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [debouncedQ, setDebouncedQ] = useState(filters.q);
  const [suggestions, setSuggestions] = useState<InventorySuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(filters.q.trim()), 200);
    return () => clearTimeout(timer);
  }, [filters.q]);

  useEffect(() => {
    if (debouncedQ.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setFetchError(null);
    const params = new URLSearchParams({
      q: debouncedQ,
      game: filters.game,
      limit: "10",
    });

    fetch(
      `/api/store/${encodeURIComponent(slug)}/inventory/suggest?${params}`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then(async (r) => {
        const body = await parseSuggestResponse(r);
        if (body.error) {
          setFetchError(body.error);
          setSuggestions([]);
          setOpen(true);
          return;
        }
        setSuggestions(body.suggestions);
        setOpen(true);
        setActiveIndex(-1);
      })
      .catch((e) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setFetchError("Suggestions unavailable — press Enter to search");
        setSuggestions([]);
        setOpen(true);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [debouncedQ, filters.game, slug]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function pickSuggestion(item: InventorySuggestion) {
    onChange({ q: item.name });
    onCommit?.(item.name);
    setOpen(false);
    setActiveIndex(-1);
  }

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <input
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        value={filters.q}
        onChange={(e) => {
          onChange({ q: e.target.value });
          setOpen(true);
        }}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (open && activeIndex >= 0 && suggestions[activeIndex]) {
              e.preventDefault();
              pickSuggestion(suggestions[activeIndex]!);
              return;
            }
            onCommit?.(filters.q.trim());
            setOpen(false);
            return;
          }
          if (!open || suggestions.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => Math.min(suggestions.length - 1, i + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => Math.max(0, i - 1));
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder="Search cards…"
        className="inventory-filter-input w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500"
      />
      {open && (suggestions.length > 0 || loading || fetchError) ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-neutral-700 bg-neutral-900 py-1 shadow-xl"
        >
          {loading && suggestions.length === 0 ? (
            <li className="px-3 py-2 text-xs text-neutral-500">Searching…</li>
          ) : null}
          {fetchError && suggestions.length === 0 ? (
            <li className="px-3 py-2 text-xs text-amber-400">{fetchError}</li>
          ) : null}
          {suggestions.map((item, index) => (
            <li key={item.inventoryItemId} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-800 ${
                  index === activeIndex ? "bg-neutral-800" : ""
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickSuggestion(item)}
              >
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.imageUrl}
                    alt=""
                    className="h-10 w-7 shrink-0 rounded object-cover"
                  />
                ) : (
                  <span className="flex h-10 w-7 shrink-0 items-center justify-center rounded bg-neutral-800 text-[9px] text-neutral-500">
                    ?
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-white">{item.name}</span>
                  {item.setName ? (
                    <span className="block truncate text-xs text-neutral-500">
                      {item.setName}
                    </span>
                  ) : null}
                </span>
                {item.listPrice != null ? (
                  <span className="shrink-0 text-xs text-emerald-400">
                    ${item.listPrice.toFixed(2)}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
