/**
 * Frozen card-strength-v1. Scoring reads this table only — no live model.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const DR_CARD_STRENGTH_V1 = "deck-rating-card-strength-v1";

export type CardStrengthRow = { oracleId: string; name: string; strength: number };

export type CardStrengthTableV1 = {
  version: string;
  used: string;
  cards: CardStrengthRow[];
};

export function loadCardStrengthTableV1(snapshotRoot: string): Map<string, number> {
  const path = join(snapshotRoot, "fit", "card-strength-v1.json");
  if (!existsSync(path)) return new Map();
  const raw = JSON.parse(readFileSync(path, "utf8")) as CardStrengthTableV1;
  return new Map(raw.cards.map((c) => [c.oracleId, c.strength]));
}
