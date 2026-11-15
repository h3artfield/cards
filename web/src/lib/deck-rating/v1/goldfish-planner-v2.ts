/**
 * F2 planner: distance to the resolver's closest line, tutor legality,
 * commander priority, lookahead depth. Distance is derived only from
 * evaluateWin's gap (goldfish-resource-graph-v2); there is no second
 * line-distance calculator.
 */
import type { WinGap, WinGapPiece } from "./goldfish-resource-graph-v2";
import { CARD_ENGINE_NAMES } from "./goldfish-resource-graph-v2";

export const DR_PLANNER_V2 = "deck-rating-goldfish-planner-v2.2";

export type TutorLike = {
  isTutor?: boolean;
  tutorDest?: "hand" | "top" | "bf" | "grave";
  tutorTypes?: string[];
};

export function tutorFindsPiece(tutor: TutorLike, piece: { typeLine?: string }): boolean {
  if (!tutor.isTutor) return false;
  const types = tutor.tutorTypes ?? [];
  if (!types.length) return true;
  const tl = (piece.typeLine ?? "").toLowerCase();
  return types.some((t) => tl.includes(t.toLowerCase()));
}

/** A tutor can advance a missing piece only if the piece is in the library and lands where the line needs it. */
export function tutorAdvancesPiece(tutor: TutorLike, piece: WinGapPiece, libraryCard: { typeLine?: string } | undefined): boolean {
  if (piece.where !== "L" || !libraryCard) return false;
  if (!tutorFindsPiece(tutor, libraryCard)) return false;
  if (tutor.tutorDest === "grave") return piece.zones.includes("G");
  return true;
}

export type GapDistance = {
  distance: number;
  missingPieces: number;
  manaTurns: number;
};

export function distanceFromGap(gap: WinGap, manaPerTurn: number): GapDistance {
  const perTurn = Math.max(1, manaPerTurn);
  const manaTurns = gap.manaShort > 0 ? Math.ceil(gap.manaShort / perTurn) : 0;
  const missingPieces = gap.missingPieces.length;
  return { distance: missingPieces + manaTurns + (gap.timingBlocked ? 1 : 0), missingPieces, manaTurns };
}

export function lookaheadDepth(distance: number | null): number {
  return distance != null && distance <= 1 ? 6 : 3;
}

export function commanderShouldLead(args: {
  commander: { name: string; cmc: number };
  castable: boolean;
  isPiece: boolean;
}): boolean {
  if (!args.castable) return false;
  if (args.isPiece) return true;
  if (CARD_ENGINE_NAMES.has(args.commander.name)) return true;
  if (args.commander.cmc <= 3) return true;
  return false;
}

export function tutorDestinationFromText(text: string): "hand" | "top" | "bf" | "grave" {
  if (/onto the battlefield/i.test(text)) return "bf";
  if (
    /on top of (?:your|their) library/i.test(text) ||
    /top of your library/i.test(text) ||
    /put (?:that card|it|them) on top/i.test(text)
  ) {
    return "top";
  }
  if (/into (?:your )?graveyard/i.test(text)) return "grave";
  return "hand";
}

const CARD_TYPES = ["creature", "instant", "sorcery", "artifact", "enchantment", "land", "planeswalker", "legendary", "battle"];
const LAND_SUBTYPES = /\b(plains|island|swamp|mountain|forest|basic land)\b/i;

export function tutorTypeRestriction(text: string): string[] {
  const m = /search your library for (?:a|an|up to \w+|x|any number of|two|three)?\s*([^.,;]*?)\s*cards?\b/i.exec(text);
  if (m) {
    const phrase = (m[1] ?? "").toLowerCase();
    const types = new Set<string>();
    for (const t of CARD_TYPES) if (new RegExp(`\\b${t}\\b`).test(phrase)) types.add(t);
    if (LAND_SUBTYPES.test(phrase)) types.add("land");
    return [...types];
  }
  const types: string[] = [];
  if (/creature card/i.test(text)) types.push("creature");
  if (/instant (?:or sorcery )?card/i.test(text) || /instant card/i.test(text)) types.push("instant");
  if (/sorcery card/i.test(text)) types.push("sorcery");
  if (/artifact card/i.test(text)) types.push("artifact");
  if (/enchantment card/i.test(text)) types.push("enchantment");
  if (/land card/i.test(text)) types.push("land");
  if (/planeswalker card/i.test(text)) types.push("planeswalker");
  return types;
}
