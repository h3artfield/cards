"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_PROFESSOR_COMMANDER_SORT_V1,
  PROFESSOR_COMMANDER_SORT_OPTIONS_V1,
  sortProfessorCommanderResultsV1,
  type ProfessorCommanderSortIdV1,
} from "@/lib/deck-synthesis/professor-commander-picker-sort-v1";

export type CommanderPickResultV1 = {
  slug: string;
  name: string;
  rank?: number;
  colorIdentity?: string[];
};

/**
 * Choosing a commander.
 *
 * Shared by the Professor's setup screen and the by-hand deck flow, because a
 * picker is exactly the kind of thing that gets fixed once and then stays
 * broken in the copy. This one has already been through that: it browses the
 * full commander-eligible catalog rather than the EDHREC popularity list, which
 * is what had been hiding some 2,800 legal commanders, and it sorts A–Z by
 * default so browsing works before you know what you are looking for.
 *
 * The empty query is a deliberate state, not an idle one — clicking the box
 * shows the browse list, since a player who cannot yet name a commander is the
 * one who most needs to see some.
 */
export function CommanderPickerV1({
  slug,
  value,
  onChange,
  inputId = "commander-search",
  placeholder = "Search commanders by name…",
}: {
  slug: string;
  value: CommanderPickResultV1 | null;
  onChange: (commander: CommanderPickResultV1 | null) => void;
  inputId?: string;
  placeholder?: string;
}) {
  const searchApi = `/api/store/${slug}/deck-builder/commanders/search`;

  // What the box shows is the typed text if there is any, and the selected
  // commander's name otherwise. Keeping the typing separate from the selection
  // means a commander chosen elsewhere — inferred from a pasted list, say, or
  // restored from an inventory pile — appears here without an effect to copy it
  // across, and without overwriting a search someone is halfway through.
  const [typed, setTyped] = useState<string | null>(null);
  const [results, setResults] = useState<CommanderPickResultV1[]>([]);
  const [sort, setSort] = useState<ProfessorCommanderSortIdV1>(
    DEFAULT_PROFESSOR_COMMANDER_SORT_V1,
  );
  const [listOpen, setListOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [browseLoading, setBrowseLoading] = useState(true);

  // Adjusting state during render rather than in an effect, which is React's
  // own recommendation for state that has to follow a prop.
  const valueName = value?.name ?? null;
  const [lastValueName, setLastValueName] = useState<string | null>(valueName);
  if (valueName !== lastValueName) {
    setLastValueName(valueName);
    if (valueName) setTyped(null);
  }

  const query = typed ?? valueName ?? "";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setBrowseLoading(true);
      try {
        const res = await fetch(searchApi);
        const data = await res.json();
        if (!cancelled && res.ok) setResults(data.results ?? []);
      } catch {
        /* a failed browse leaves the list empty, which the caption explains */
      } finally {
        if (!cancelled) setBrowseLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchApi]);

  useEffect(() => {
    if (!listOpen && !query.trim()) return;
    if (!query.trim() && results.length > 0) return;

    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("q", query.trim());
        const res = await fetch(`${searchApi}?${params.toString()}`);
        const data = await res.json();
        if (res.ok) setResults(data.results ?? []);
      } catch {
        /* keep whatever the last good search returned */
      } finally {
        setSearchLoading(false);
      }
    }, query.trim() ? 200 : 0);

    return () => clearTimeout(timer);
  }, [listOpen, query, results.length, searchApi]);

  const listLoading = query.trim() ? searchLoading : browseLoading && results.length === 0;
  const sorted = useMemo(
    () => sortProfessorCommanderResultsV1(results, sort, query),
    [results, sort, query],
  );

  const locked = value !== null && query.trim() === value.name;
  const showResults = !locked && (listOpen || Boolean(query.trim()));

  return (
    <div>
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-[var(--mtg-gold)]">
          ⌕
        </span>
        <input
          id={inputId}
          type="search"
          placeholder={placeholder}
          value={query}
          autoComplete="off"
          onFocus={() => setListOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setListOpen(false), 150);
          }}
          onChange={(e) => {
            setTyped(e.target.value);
            setListOpen(true);
            if (value && e.target.value !== value.name) onChange(null);
          }}
          className="professor-mtg-input w-full py-4 pl-11 pr-4 text-base"
        />
      </div>

      {showResults ? (
        <div className="mt-3">
          {listLoading ? (
            <p className="professor-mtg-muted px-1 py-2 text-xs italic">Loading commanders…</p>
          ) : null}
          {!listLoading && results.length === 0 ? (
            <p className="professor-mtg-muted px-1 py-2 text-xs">
              No paper-eligible commanders found
            </p>
          ) : null}

          {sorted.length > 0 ? (
            <div className="mb-2 flex items-center justify-between gap-3 px-1">
              <p className="professor-mtg-muted text-[11px]">
                {sorted.length} commander{sorted.length === 1 ? "" : "s"}
                {sorted.length > 8 ? " · scroll for more" : ""}
              </p>
              <div className="flex items-center gap-1">
                <span className="professor-mtg-muted text-[11px]">Sort</span>
                {PROFESSOR_COMMANDER_SORT_OPTIONS_V1.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    // Keeps the input focused so the blur handler does not close
                    // the list out from under the click.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setSort(option.id)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                      sort === option.id
                        ? "border-[var(--accent-lo)] bg-[var(--accent-wash)] text-[var(--text-hi)]"
                        : "border-[var(--mtg-stone-border)] text-[var(--mtg-parchment-muted)] hover:border-[var(--mtg-gold)]/60"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/* Tall enough that A–Z browsing reaches across the alphabet by
              scrolling instead of truncating to the leading few letters. */}
          <ul className="max-h-96 space-y-2 overflow-y-auto">
            {sorted.map((c) => {
              const selected = value?.name === c.name;
              return (
                <li key={`${c.slug}-${c.name}`}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange(c);
                      setTyped(null);
                      setListOpen(false);
                    }}
                    className={`professor-mtg-option flex w-full items-center justify-between gap-3 px-4 py-2.5 ${selected ? "professor-mtg-option--selected" : ""}`}
                  >
                    <span className="text-left font-medium">{c.name}</span>
                    {/* Most commanders have no EDHREC row, so "unranked" is a
                        normal state and must not read as an error. */}
                    {typeof c.rank === "number" ? (
                      <span
                        className="shrink-0 text-[11px] tabular-nums text-[var(--mtg-gold)]"
                        title={`EDHREC popularity rank ${c.rank}`}
                      >
                        #{c.rank}
                      </span>
                    ) : (
                      <span
                        className="professor-mtg-muted shrink-0 text-[11px] opacity-60"
                        title="No EDHREC popularity data for this commander"
                      >
                        unranked
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : value ? null : (
        <p className="professor-mtg-muted mt-3 text-xs">
          Click the search bar to browse paper-eligible commanders A–Z
        </p>
      )}
    </div>
  );
}
