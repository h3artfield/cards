"use client";

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { DerivedMarkerKindV1, DerivedMarkerV1 } from "@/lib/professor-deck-editor/derived-markers-v1";
import type { DeckMarkerV1 } from "@/lib/professor-deck-editor/types-v1";
import type { DeckEditorCard } from "./types";

type ChipKind = DerivedMarkerKindV1 | "user";

const CHIP_CLASS: Record<ChipKind, string> = {
  game_changer: "professor-mtg-chip--game-changer",
  in_stock: "professor-mtg-chip--in-stock",
  owned: "professor-mtg-chip--owned",
  need_elsewhere: "professor-mtg-chip--need-elsewhere",
  professor_role: "professor-mtg-chip--role",
  professor_package: "professor-mtg-chip--role deck-symbol--package",
  structural: "professor-mtg-chip--game-changer",
  user_added: "professor-mtg-chip--user",
  user: "professor-mtg-chip--user",
};

const PRIORITY: Record<ChipKind, number> = {
  game_changer: 0,
  user: 1,
  owned: 2,
  user_added: 3,
  structural: 4,
  in_stock: 5,
  need_elsewhere: 6,
  professor_role: 7,
  professor_package: 8,
};

/** The fixed symbols, in the order the legend lists them. */
const FIXED_SYMBOLS: Partial<Record<ChipKind, string>> = {
  game_changer: "GC",
  owned: "O",
  in_stock: "$",
  structural: "★",
};

const ROLE_SYMBOLS: Record<string, string> = {
  ramp: "RA",
  "card draw": "CD",
  draw: "CD",
  "card advantage": "CA",
  removal: "RM",
  "board wipe": "BW",
  wipe: "BW",
  "win condition": "WC",
  wincon: "WC",
  protection: "PR",
  tutor: "TU",
  recursion: "RC",
  interaction: "IN",
  counterspell: "CS",
  land: "LD",
  lands: "LD",
  finisher: "FN",
  engine: "EN",
  payoff: "PO",
  enabler: "EB",
  tokens: "TK",
  token: "TK",
};

/** Two or three letters for a name the Professor or the player chose. */
function initialsFor(label: string): string {
  const known = ROLE_SYMBOLS[label.trim().toLowerCase()];
  if (known) return known;
  const words = label.split(/[\s_\-/&]+/).filter(Boolean);
  if (words.length >= 2) {
    return words
      .slice(0, 3)
      .map((word) => word[0])
      .join("")
      .toUpperCase();
  }
  return (words[0] ?? "?").slice(0, 2).toUpperCase();
}

export const MARKER_LEGEND_V1: ReadonlyArray<{ symbol: string; meaning: string; className: string }> = [
  { symbol: "U", meaning: "User addition", className: "deck-origin-badge deck-origin-badge--user" },
  { symbol: "P", meaning: "Professor addition", className: "deck-origin-badge deck-origin-badge--professor" },
  ...(Object.entries(FIXED_SYMBOLS) as Array<[ChipKind, string]>).map(([kind, symbol]) => ({
    symbol,
    meaning:
      kind === "game_changer"
        ? "Game Changer"
        : kind === "owned"
          ? "Owned"
          : kind === "in_stock"
            ? "Buy here"
            : "Core to the plan",
    className: `professor-mtg-chip deck-symbol ${CHIP_CLASS[kind]}`,
  })),
];

/**
 * A tooltip that shows at once, unlike `title`, and escapes the row's clipping
 * by rendering into the body.
 */
function HoverTip({ tip, children }: { tip: string; children: (handlers: object) => ReactNode }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const handlers = {
    onMouseEnter: (event: React.MouseEvent<HTMLElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      setAt({ x: rect.left + rect.width / 2, y: rect.top });
    },
    onMouseLeave: () => setAt(null),
    "aria-label": tip,
  };
  return (
    <>
      {children(handlers)}
      {at && typeof document !== "undefined"
        ? createPortal(
            <span className="deck-symbol-tip" style={{ left: at.x, top: at.y }} role="tooltip">
              {tip}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}

type Chip = {
  key: string;
  label: string;
  symbol: string;
  kind: ChipKind;
  title: string;
};

/**
 * The tooltip for a marker the server left blank.
 *
 * Role and package markers ship without a `detail`, because copying the
 * Professor's rationale into every marker pushed one deck's response past the
 * platform's payload limit. The client already has the text, so it fills it in.
 */
function markerTitle(marker: DerivedMarkerV1, card: DeckEditorCard): string {
  if (marker.kind === "professor_role") {
    const why = card.professor?.whyInThisDeck?.trim();
    return `Professor's role: ${marker.label}${why ? ` — ${why}` : ""}`;
  }
  if (marker.kind === "professor_package") {
    return `Package: ${marker.label}`;
  }
  return marker.detail ? `${marker.label}: ${marker.detail}` : marker.label;
}

export function markerChipsForCard(card: DeckEditorCard, markers: readonly DeckMarkerV1[]): Chip[] {
  const userLabels = new Map(markers.map((marker) => [marker.id, marker.label]));

  const chips: Chip[] = [
    ...(card.derivedMarkers ?? []).map((marker) => ({
      key: `d:${marker.id}`,
      label: marker.label,
      symbol: FIXED_SYMBOLS[marker.kind] ?? initialsFor(marker.label),
      kind: marker.kind,
      title: markerTitle(marker, card),
    })),
    ...card.markerIds.map((id) => {
      const label = userLabels.get(id) ?? id;
      return {
        key: `u:${id}`,
        label,
        symbol: initialsFor(label),
        kind: "user" as const,
        title: `Your marker: ${label}`,
      };
    }),
  ];

  return chips.sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind]);
}

/**
 * Who put the card in the deck, as one letter.
 */
function OriginBadge({ card }: { card: DeckEditorCard }) {
  const user = card.origin === "user";
  return (
    <HoverTip
      tip={
        user
          ? "User addition: you added this card, so the Professor's grade doesn't account for it"
          : "Professor addition"
      }
    >
      {(handlers) => (
        <span
          {...handlers}
          className={`deck-origin-badge ${user ? "deck-origin-badge--user" : "deck-origin-badge--professor"}`}
        >
          {user ? "U" : "P"}
        </span>
      )}
    </HoverTip>
  );
}

/**
 * Every marker on a card. On a row each is a symbol, explained by the legend
 * above the list and by its own tooltip; `full` spells the labels out where
 * there is room, as in the card overlay.
 */
export function MarkerChips({
  card,
  markers,
  full = false,
}: {
  card: DeckEditorCard;
  markers: readonly DeckMarkerV1[];
  full?: boolean;
}) {
  // "Need elsewhere" is left off rows: it is on nearly every card of a new
  // deck, so it is noise there. The overlay still says it.
  const chips = markerChipsForCard(card, markers).filter(
    (chip) => chip.kind !== "user_added" && (full || chip.kind !== "need_elsewhere"),
  );

  return (
    <span className={`flex shrink-0 items-center gap-1 ${full ? "flex-wrap" : ""}`}>
      <OriginBadge card={card} />
      {chips.map((chip) =>
        full ? (
          <span key={chip.key} className={`professor-mtg-chip ${CHIP_CLASS[chip.kind]}`} title={chip.title}>
            {chip.label}
          </span>
        ) : (
          <HoverTip key={chip.key} tip={chip.title}>
            {(handlers) => (
              <span {...handlers} className={`professor-mtg-chip deck-symbol ${CHIP_CLASS[chip.kind]}`}>
                {chip.symbol}
              </span>
            )}
          </HoverTip>
        ),
      )}
    </span>
  );
}

/** One line above the list saying what each symbol means. */
export function MarkerLegendV1() {
  return (
    <p className="deck-symbol-legend">
      {MARKER_LEGEND_V1.map((entry) => (
        <span key={entry.symbol} className="deck-symbol-legend__item">
          <span className={entry.className}>{entry.symbol}</span>
          {entry.meaning}
        </span>
      ))}
      <span className="deck-symbol-legend__item deck-symbol-legend__note">
        Other letters: the Professor&apos;s role or package. Hover any symbol for its meaning.
      </span>
    </p>
  );
}
