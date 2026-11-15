"use client";

import { useEffect, useId, useState } from "react";
import type { TokenSearchHitV1 } from "@/lib/token-creator/token-search-v1";

/**
 * Type-ahead over every real Magic token (from Scryfall), so the popular tiles
 * can stay few. "2/2 zombie", "white flying spirit" and "blood" all work.
 */
export function TokenSearchV1({ slug, onPick }: { slug: string; onPick: (token: TokenSearchHitV1) => void }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<TokenSearchHitV1[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [searched, setSearched] = useState("");
  const listId = useId();

  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/store/${encodeURIComponent(slug)}/tokens/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const body = (await res.json()) as { tokens?: TokenSearchHitV1[] };
        setHits(body.tokens ?? []);
        setActive(0);
        setSearched(q);
      } catch {
        // Aborted by the next keystroke, or offline; the list just stays as it was.
      }
    }, 140);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query, slug]);

  const changeQuery = (value: string) => {
    setQuery(value);
    if (!value.trim()) {
      setHits([]);
      setSearched("");
    }
  };

  const pick = (hit: TokenSearchHitV1) => {
    onPick(hit);
    changeQuery("");
    setOpen(false);
  };

  const showList = open && query.trim().length > 0 && (hits.length > 0 || searched === query.trim());

  return (
    <div className="token-search">
      <input
        className="token-input token-search__input"
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && hits[active] ? `${listId}-${active}` : undefined}
        placeholder="Search every token: Blood, 2/2 Wolf, white flying Spirit…"
        aria-label="Search Magic tokens"
        value={query}
        onChange={(e) => {
          changeQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(hits.length - 1, i + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
          } else if (e.key === "Enter" && showList && hits[active]) {
            e.preventDefault();
            pick(hits[active]!);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {showList ? (
        <ul id={listId} role="listbox" className="token-search__list">
          {hits.map((hit, i) => (
            <li
              key={hit.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`token-search__opt${i === active ? " token-search__opt--on" : ""}`}
              // Keeps focus in the input so the blur does not close the list before the click lands.
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(hit)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {hit.imageUrl ? <img className="token-search__thumb" src={hit.imageUrl} alt="" loading="lazy" /> : <span className="token-search__thumb" />}
              <span className="min-w-0">
                <span className="token-search__label">{hit.label}</span>
                <span className="token-search__meta">
                  {hit.typeLine}
                  {hit.text ? ` · ${hit.text.replace(/\n/g, " ")}` : ""}
                </span>
              </span>
              {hit.makers ? <span className="token-search__makers">{hit.makers} cards</span> : null}
            </li>
          ))}
          {hits.length === 0 && searched === query.trim() ? (
            <li className="token-search__empty">No token matches “{query.trim()}”. Pick Custom creature or Custom artifact below to make your own.</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
