/**
 * Card play rate from the TopDeck tournament corpus.
 *
 * Supplies the quality axis that RC8 semantic distance lacks. Rates are
 * conditioned on color eligibility, so they compare a card against decks that
 * could actually have run it.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ARTIFACT_PATH = "data/milestones/commander-strategy/topdeck-card-play-rate-v1.json";

export type PlayRateStat = { n: number; eligible: number; rate: number };

type PlayRateArtifact = {
  version: string;
  deckCount: number;
  cards: Record<string, PlayRateStat>;
};

let cached: PlayRateArtifact | null = null;

export function loadPlayRateIndex(): PlayRateArtifact {
  if (cached) return cached;
  const path = resolve(process.cwd(), ARTIFACT_PATH);
  cached = existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf8")) as PlayRateArtifact)
    : { version: "missing", deckCount: 0, cards: {} };
  return cached;
}

export function playRateFor(oracleId: string): PlayRateStat | null {
  return loadPlayRateIndex().cards[oracleId] ?? null;
}
