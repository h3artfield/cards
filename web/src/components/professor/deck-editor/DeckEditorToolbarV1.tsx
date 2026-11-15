"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  DECK_EDITOR_GROUP_LABELS_V1,
  DECK_EDITOR_SORT_LABELS_V1,
  DECK_EDITOR_VIEW_LABELS_V1,
  type DeckEditorGroupModeV1,
  type DeckEditorSortModeV1,
  type DeckEditorViewModeV1,
} from "./grouping-v1";

const VIEW_ICONS_V1: Record<DeckEditorViewModeV1, ReactNode> = {
  text: (
    <path d="M3 4h14M3 8h14M3 12h14M3 16h9" strokeLinecap="round" />
  ),
  condensed: (
    <path d="M3 4h14M3 7h14M3 10h14M3 13h14M3 16h14" strokeLinecap="round" />
  ),
  grid: (
    <>
      <rect x="2.5" y="2.5" width="6" height="7" rx="1" />
      <rect x="11.5" y="2.5" width="6" height="7" rx="1" />
      <rect x="2.5" y="11.5" width="6" height="7" rx="1" />
      <rect x="11.5" y="11.5" width="6" height="7" rx="1" />
    </>
  ),
  stacks: (
    <>
      <rect x="5" y="2.5" width="10" height="10" rx="1" />
      <path d="M5 15h10M5 17.5h10" strokeLinecap="round" />
    </>
  ),
  spoiler: (
    <>
      <rect x="2.5" y="3" width="7" height="14" rx="1" />
      <rect x="10.5" y="3" width="7" height="14" rx="1" />
    </>
  ),
};

/** View modes as icons: five choices you can see beat a dropdown you have to open. */
export function DeckViewToggleV1({
  value,
  onChange,
}: {
  value: DeckEditorViewModeV1;
  onChange: (mode: DeckEditorViewModeV1) => void;
}) {
  return (
    <div className="deck-view-toggle" role="radiogroup" aria-label="View">
      {(Object.keys(DECK_EDITOR_VIEW_LABELS_V1) as DeckEditorViewModeV1[]).map((mode) => (
        <button
          key={mode}
          type="button"
          role="radio"
          aria-checked={value === mode}
          title={DECK_EDITOR_VIEW_LABELS_V1[mode]}
          aria-label={DECK_EDITOR_VIEW_LABELS_V1[mode]}
          className={`deck-view-toggle__btn${value === mode ? " deck-view-toggle__btn--on" : ""}`}
          onClick={() => onChange(mode)}
        >
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6">
            {VIEW_ICONS_V1[mode]}
          </svg>
        </button>
      ))}
    </div>
  );
}

/**
 * Grouping and sorting behind one button that says what is in effect.
 *
 * They answer one question, "how is this list arranged", so they share a
 * control; the button label keeps the current answer visible when closed.
 */
export function DeckArrangeMenuV1({
  groupMode,
  sortMode,
  onGroupChange,
  onSortChange,
}: {
  groupMode: DeckEditorGroupModeV1;
  sortMode: DeckEditorSortModeV1;
  onGroupChange: (mode: DeckEditorGroupModeV1) => void;
  onSortChange: (mode: DeckEditorSortModeV1) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="deck-arrange" ref={ref}>
      <button
        type="button"
        className={`deck-arrange__trigger${open ? " deck-arrange__trigger--open" : ""}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="deck-arrange__label">Group</span>
        <span className="deck-arrange__value">{DECK_EDITOR_GROUP_LABELS_V1[groupMode]}</span>
        <span className="deck-arrange__sep" aria-hidden>
          ·
        </span>
        <span className="deck-arrange__label">Sort</span>
        <span className="deck-arrange__value">{DECK_EDITOR_SORT_LABELS_V1[sortMode]}</span>
        <span aria-hidden className="deck-arrange__caret">
          ▾
        </span>
      </button>
      {open ? (
        <div className="deck-arrange__panel" role="dialog" aria-label="Arrange the list">
          <p className="deck-arrange__heading">Group by</p>
          <div className="deck-arrange__options">
            {(Object.keys(DECK_EDITOR_GROUP_LABELS_V1) as DeckEditorGroupModeV1[]).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={groupMode === mode}
                className={`deck-arrange__option${groupMode === mode ? " deck-arrange__option--on" : ""}`}
                onClick={() => onGroupChange(mode)}
              >
                {DECK_EDITOR_GROUP_LABELS_V1[mode]}
              </button>
            ))}
          </div>
          <p className="deck-arrange__heading">Sort by</p>
          <div className="deck-arrange__options">
            {(Object.keys(DECK_EDITOR_SORT_LABELS_V1) as DeckEditorSortModeV1[]).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={sortMode === mode}
                className={`deck-arrange__option${sortMode === mode ? " deck-arrange__option--on" : ""}`}
                onClick={() => onSortChange(mode)}
              >
                {DECK_EDITOR_SORT_LABELS_V1[mode]}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
