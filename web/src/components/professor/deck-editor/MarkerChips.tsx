import type { DerivedMarkerKindV1, DerivedMarkerV1 } from "@/lib/professor-deck-editor/derived-markers-v1";
import type { DeckMarkerV1 } from "@/lib/professor-deck-editor/types-v1";
import type { DeckEditorCard } from "./types";

const CHIP_CLASS: Record<DerivedMarkerKindV1 | "user", string> = {
  game_changer: "professor-mtg-chip--game-changer",
  in_stock: "professor-mtg-chip--in-stock",
  owned: "professor-mtg-chip--owned",
  professor_role: "professor-mtg-chip--role",
  professor_package: "professor-mtg-chip--role",
  structural: "professor-mtg-chip--role",
  user_added: "professor-mtg-chip--user",
  user: "professor-mtg-chip--user",
};

const PRIORITY: Record<DerivedMarkerKindV1 | "user", number> = {
  game_changer: 0,
  user: 1,
  owned: 2,
  user_added: 3,
  structural: 4,
  in_stock: 5,
  professor_role: 6,
  professor_package: 7,
};

/**
 * Markers that earn space on a card row.
 *
 * Three columns of ninety-nine cards leaves a row about as wide as a card name,
 * and chips that fight the name for it get crushed to three-letter stubs. So a
 * chip has to say something the row does not already say:
 *
 * - `in_stock` is out: the card name is already green when the shop has it, the
 *   same signal the read-only decklist uses.
 * - `professor_role` and `professor_package` are out: grouping by role puts them
 *   in the section heading, and they are the longest labels of the lot.
 *
 * Both remain filterable from the chip row above the list, and the marker menu
 * still shows everything for a single card.
 */
const INLINE_KINDS: ReadonlySet<DerivedMarkerKindV1 | "user"> = new Set([
  "game_changer",
  "user",
  "owned",
  "user_added",
  "structural",
]);

type Chip = {
  key: string;
  label: string;
  kind: DerivedMarkerKindV1 | "user";
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
  if (marker.detail) return marker.detail;
  if (marker.kind === "professor_role") {
    return card.professor?.whyInThisDeck?.trim() || `The Professor's role for this card: ${marker.label}`;
  }
  if (marker.kind === "professor_package") {
    return `Part of the ${marker.label} package the Professor assembled`;
  }
  return marker.label;
}

export function markerChipsForCard(card: DeckEditorCard, markers: readonly DeckMarkerV1[]): Chip[] {
  const userLabels = new Map(markers.map((marker) => [marker.id, marker.label]));

  const chips: Chip[] = [
    ...(card.derivedMarkers ?? []).map((marker) => ({
      key: `d:${marker.id}`,
      label: marker.label,
      kind: marker.kind,
      title: markerTitle(marker, card),
    })),
    ...card.markerIds.map((id) => ({
      key: `u:${id}`,
      label: userLabels.get(id) ?? id,
      kind: "user" as const,
      title: "Your marker",
    })),
  ];

  return chips.sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind]);
}

export function MarkerChips({
  card,
  markers,
  limit = 2,
}: {
  card: DeckEditorCard;
  markers: readonly DeckMarkerV1[];
  limit?: number;
}) {
  const chips = markerChipsForCard(card, markers);
  if (chips.length === 0) return null;

  const shown = chips.filter((chip) => INLINE_KINDS.has(chip.kind)).slice(0, limit);
  // Everything that did not get a chip is still reachable, as the overflow
  // count's tooltip. That is how the Professor's role for a card stays visible
  // without a label long enough to crush the row.
  const shownKeys = new Set(shown.map((chip) => chip.key));
  const hidden = chips.filter((chip) => !shownKeys.has(chip.key));

  return (
    // `shrink-0` on purpose: when the row runs out of width the answer is fewer
    // chips, not narrower ones. A chip squeezed to an ellipsis says nothing.
    <span className="flex shrink-0 items-center gap-1">
      {shown.map((chip) => (
        <span
          key={chip.key}
          className={`professor-mtg-chip max-w-[6.5rem] ${CHIP_CLASS[chip.kind]}`}
          title={chip.title}
        >
          {chip.label}
        </span>
      ))}
      {hidden.length > 0 ? (
        <span
          className="professor-mtg-chip shrink-0"
          title={hidden.map((chip) => chip.label).join(" · ")}
        >
          +{hidden.length}
        </span>
      ) : null}
    </span>
  );
}
