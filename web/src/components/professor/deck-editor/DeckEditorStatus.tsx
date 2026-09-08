"use client";

import { useEffect, useState } from "react";
import { COMMANDER_LIBRARY_SIZE_V1 } from "@/lib/professor-deck-editor/legality-v1";
import type { DeckEditorLegalityReportV1 } from "@/lib/professor-deck-editor/legality-v1";

/**
 * The two verdicts on an edited deck, kept apart on purpose.
 *
 * Losing the Professor's endorsement is the normal consequence of editing and
 * gets a calm gold note. Being illegal in Commander is a problem the player
 * will otherwise discover at a table, and gets a red one. A single "invalid"
 * banner covering both would either cry wolf about every edit or bury a real
 * rules break among them.
 */
export function DeckEditorStatus({
  legality,
  editedByUser,
  hasBaseline,
  stale,
  onRevert,
}: {
  legality: DeckEditorLegalityReportV1;
  editedByUser: boolean;
  hasBaseline: boolean;
  /** True while an edit is in flight, when this verdict is a moment behind. */
  stale: boolean;
  onRevert: () => void;
}) {
  // A revert throws away every edit and cannot be undone, so it asks twice.
  // The confirmation lapses on its own, because a button left reading "Confirm"
  // is a trap for the next person to click near it.
  const [confirmRevert, setConfirmRevert] = useState(false);
  useEffect(() => {
    if (!confirmRevert) return;
    const timer = setTimeout(() => setConfirmRevert(false), 5000);
    return () => clearTimeout(timer);
  }, [confirmRevert]);

  const illegal = legality.violations.filter((violation) => violation.severity === "illegal");
  const sizeNote = legality.violations.find((violation) => violation.kind === "deck_size");
  const unresolved = legality.violations.filter(
    (violation) => violation.kind === "unresolved_card",
  );

  // A deck built by hand has no Professor list to have drifted from, so the
  // whole notice is meaningless there — it would be telling someone their
  // grade is stale for a deck that was never graded.
  const driftedFromProfessor = editedByUser && hasBaseline;

  const nothingToSay =
    illegal.length === 0 && !sizeNote && !driftedFromProfessor && unresolved.length === 0;
  if (nothingToSay) return null;

  return (
    <div className={`space-y-2 ${stale ? "opacity-60 transition-opacity" : "transition-opacity"}`}>
      {illegal.length > 0 ? (
        <div className="professor-mtg-alert professor-mtg-alert--illegal">
          <p className="professor-mtg-label text-[#f0a8a0]">
            Not legal in Commander — {illegal.length} problem{illegal.length === 1 ? "" : "s"}
          </p>
          <ul className="mt-1.5 space-y-1 text-[12px] leading-snug text-[#f0d0cc]">
            {illegal.slice(0, 6).map((violation) => (
              <li key={`${violation.kind}-${violation.cardKey ?? violation.message}`}>
                {violation.message}
              </li>
            ))}
          </ul>
          {illegal.length > 6 ? (
            <p className="professor-mtg-muted mt-1 text-[11px]">
              and {illegal.length - 6} more.
            </p>
          ) : null}
        </div>
      ) : null}

      {driftedFromProfessor ? (
        <div className="professor-mtg-alert professor-mtg-alert--edited flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="professor-mtg-label">Your edits</p>
            <p className="professor-mtg-muted mt-1 text-[12px] leading-snug">
              This is no longer the list the Professor graded, so the grade and the score describe
              the original build rather than this deck.
            </p>
          </div>
          <button
            type="button"
            className="professor-mtg-btn shrink-0 px-3 py-1.5 text-[11px]"
            onClick={() => {
              if (!confirmRevert) {
                setConfirmRevert(true);
                return;
              }
              setConfirmRevert(false);
              onRevert();
            }}
          >
            {confirmRevert
              ? "Confirm — this discards your edits"
              : "Restore the Professor\u2019s deck"}
          </button>
        </div>
      ) : null}

      {sizeNote || unresolved.length > 0 ? (
        <p className="professor-mtg-muted text-[11px]">
          {sizeNote ? (
            <>
              {legality.mainboardLibraryCount} of {COMMANDER_LIBRARY_SIZE_V1} cards in the deck —{" "}
              {sizeNote.message}.
            </>
          ) : null}
          {sizeNote && unresolved.length > 0 ? " " : null}
          {unresolved.length > 0 ? (
            <>
              {unresolved.length} card{unresolved.length === 1 ? "" : "s"} could not be matched to
              the catalog, so {unresolved.length === 1 ? "its" : "their"} legality is unknown.
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
