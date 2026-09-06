"use client";

import { useEffect, useRef, useState } from "react";
import type { DeckMarkerV1 } from "@/lib/professor-deck-editor/types-v1";
import type { DeckEditorCard } from "./types";

/**
 * Assigns the customer's own markers to a card, and creates new ones.
 *
 * Creating and assigning are sent as a single batch, so naming a marker
 * "Need to buy" and putting it on the card is one action and one revision
 * rather than two — and if the label collides, neither half lands.
 */
export function CardMarkerMenu({
  card,
  markers,
  onToggle,
  onCreateAndAssign,
  onDeleteMarker,
}: {
  card: DeckEditorCard;
  markers: readonly DeckMarkerV1[];
  onToggle: (markerId: string, assign: boolean) => void;
  onCreateAndAssign: (label: string, scope: "deck" | "global") => void;
  /** Removes a tag from every card in the deck, not just this one. */
  onDeleteMarker: (markerId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [scope, setScope] = useState<"deck" | "global">("deck");
  // Deleting a tag affects every card that carries it, so it takes two clicks.
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setConfirmDelete(null);
  }, [open]);

  const create = () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    onCreateAndAssign(trimmed, scope);
    setLabel("");
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        className="professor-mtg-icon-btn"
        aria-haspopup="true"
        aria-expanded={open}
        title={`Markers on ${card.name}`}
        onClick={() => setOpen((value) => !value)}
      >
        Mark
      </button>

      {open ? (
        <div className="professor-mtg-pop absolute right-0 top-[calc(100%+0.25rem)] z-50 w-56">
          <p className="professor-mtg-label border-b border-[var(--mtg-stone-border)] px-2.5 py-1.5 text-[10px]">
            Markers
          </p>
          {markers.length > 0 ? (
            <div className="max-h-44 overflow-y-auto" role="menu">
              {markers.map((marker) => {
                const assigned = card.markerIds.includes(marker.id);
                const confirming = confirmDelete === marker.id;
                return (
                  <div key={marker.id} className="flex items-stretch">
                    <button
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={assigned}
                      className="professor-mtg-pop-item min-w-0 flex-1 text-xs"
                      onClick={() => onToggle(marker.id, !assigned)}
                    >
                      {/* The flex row is an inner element: `.professor-mtg-pop-item`
                          sets `display: block` and is declared after Tailwind, so a
                          `flex` utility on the button itself would lose. */}
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className={
                            assigned
                              ? "text-[var(--mtg-gold-bright)]"
                              : "text-[var(--mtg-parchment-muted)] opacity-40"
                          }
                        >
                          {assigned ? "✔" : "○"}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{marker.label}</span>
                        {marker.scope === "global" ? (
                          <span
                            className="professor-mtg-muted text-[10px]"
                            title="Follows this card into every deck"
                          >
                            all decks
                          </span>
                        ) : null}
                      </span>
                    </button>
                    <button
                      type="button"
                      tabIndex={-1}
                      className={`shrink-0 px-2 text-[11px] ${
                        confirming ? "text-[var(--bad)]" : "text-[var(--text-lo)]"
                      }`}
                      title={
                        confirming
                          ? `Delete "${marker.label}" from every card in this deck`
                          : `Delete the tag "${marker.label}"`
                      }
                      onClick={() => {
                        if (confirming) {
                          onDeleteMarker(marker.id);
                          setConfirmDelete(null);
                        } else {
                          setConfirmDelete(marker.id);
                        }
                      }}
                    >
                      {confirming ? "Sure?" : "✕"}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="professor-mtg-muted px-2.5 py-2 text-[11px]">
              No markers yet. Name one below — Need to buy, Proxy, Testing.
            </p>
          )}

          <div className="border-t border-[var(--mtg-stone-border)] p-2">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                className="professor-mtg-input min-w-0 flex-1 px-2 py-1 text-xs"
                placeholder="New tag…"
                maxLength={40}
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    create();
                  }
                }}
              />
              <button
                type="button"
                className="professor-mtg-icon-btn"
                disabled={!label.trim()}
                onClick={create}
              >
                Add
              </button>
            </div>
            {/* A tag scoped to all decks is how "I do not own this card" stays
                true everywhere, rather than being re-entered per deck. */}
            <div className="mt-1.5 flex items-center gap-2">
              {(["deck", "global"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  tabIndex={-1}
                  aria-pressed={scope === option}
                  className={`text-[10px] ${
                    scope === option
                      ? "text-[var(--accent-hi)]"
                      : "professor-mtg-muted hover:text-[var(--text)]"
                  }`}
                  title={
                    option === "deck"
                      ? "The tag exists only in this deck"
                      : "The tag follows these cards into every deck you build"
                  }
                  onClick={() => setScope(option)}
                >
                  {option === "deck" ? "This deck" : "All decks"}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
