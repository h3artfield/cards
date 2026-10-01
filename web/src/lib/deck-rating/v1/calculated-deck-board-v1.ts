/**
 * Public calculated-decks board.
 *
 * Phase A: last-three digits are withheld (`B···`). Named-line machinery feeds
 * Plan check evidence, not the customer four-digit score. Threat-by-clock
 * digits publish only after CALCULATED_SCORE_DIGITS_PUBLISHED flips and the
 * band gate passes.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  CALCULATED_SCORE_DIGITS_PUBLISHED,
  formatWithheldScore,
} from "./goldfish-engine-v1";
import scoredDecksSnapshot from "./scored-decks-snapshot.json";

export const CALCULATED_DECK_BOARD_VERSION = "calculated-decks-1.1" as const;

export type CalculatedDeckRowV1 = {
  id: string;
  name: string;
  bracket: 1 | 2 | 3 | 4 | 5;
  measuredAt: string;
  /** Goldfish Speed in the deck's own turns (median among wins). */
  speed: number | null;
  /** @deprecated Prefer namedLineRate — kept for older field.json readers. */
  planRate: number | null;
  resilience: number | null;
  /**
   * Plan connectivity score (0–1). Board UI: Plan check detail, not EDHREC Synergy.
   * @deprecated Prefer planValid + namedLine* evidence.
   */
  synergy: number | null;
  planValid: boolean | null;
  namedLineRate: number | null;
  namedLineSpeed: number | null;
  /** What the board shows: withheld `B···` until digits are published. */
  score: string | null;
  /** Legacy named-line four-digit string, if measured — not shown as the product score. */
  legacyNamedLineScore: string | null;
  executionScore: string | null;
  pendingReason: string | null;
  scoreDigitsPublished: boolean;
};

type FieldFile = {
  entries?: Array<{
    oracleId?: string;
    name?: string;
    buildId?: string | null;
    measuredAt?: string;
    score?: { bracket?: number; planRate?: number | null; w?: number | null; display?: string };
    scris?: {
      speed?: number | null;
      consistency?: number | null;
      resilience?: number | null;
      synergy?: number | null;
    };
  }>;
};

const WITHHELD_REASON =
  "Last three digits stay hidden until the threat-by-clock statistic is frozen and this bracket passes its gate. The bracket digit is live.";

function boardPath(): string {
  return resolve(process.cwd(), "data/milestones/deck-rating/v1/plan-factory/calculated-decks.json");
}

function fieldPath(): string {
  return resolve(process.cwd(), "data/milestones/deck-rating/v1/plan-factory/field.json");
}

function asBracket(value: number | null | undefined): 1 | 2 | 3 | 4 | 5 {
  if (value === 1 || value === 2 || value === 3 || value === 4 || value === 5) return value;
  return 2;
}

function executionScore(planRate: number | null, resilience: number | null, bracket: 1 | 2 | 3 | 4 | 5): string | null {
  if (planRate == null || resilience == null) return null;
  const e = Math.max(0, Math.min(999, Math.round(999 * planRate * resilience)));
  return String(1000 * bracket + e);
}

export function calculatedDeckRow(args: {
  id: string;
  name: string;
  bracket: number;
  measuredAt: string;
  speed?: number | null;
  planRate?: number | null;
  resilience?: number | null;
  synergy?: number | null;
  planValid?: boolean | null;
  namedLineRate?: number | null;
  namedLineSpeed?: number | null;
  /** Legacy named-line display from older scoring — not the product score. */
  score?: string | null;
}): CalculatedDeckRowV1 {
  const bracket = asBracket(args.bracket);
  const namedLineRate = args.namedLineRate ?? args.planRate ?? null;
  const namedLineSpeed = args.namedLineSpeed ?? args.speed ?? null;
  const resilience = args.resilience ?? null;
  const connectivity = args.synergy ?? null;
  const planValid =
    args.planValid ??
    (connectivity == null ? null : connectivity > 0 && (namedLineRate == null || namedLineRate >= 0));
  const execution = executionScore(namedLineRate, resilience, bracket);
  const legacyNamedLineScore = args.score ?? execution;
  const published = CALCULATED_SCORE_DIGITS_PUBLISHED;
  const score = published ? legacyNamedLineScore : formatWithheldScore(bracket);
  return {
    id: args.id,
    name: args.name,
    bracket,
    measuredAt: args.measuredAt,
    speed: namedLineSpeed,
    planRate: namedLineRate,
    resilience,
    synergy: connectivity,
    planValid,
    namedLineRate,
    namedLineSpeed,
    score,
    legacyNamedLineScore,
    executionScore: execution,
    pendingReason: published ? (legacyNamedLineScore == null ? WITHHELD_REASON : null) : WITHHELD_REASON,
    scoreDigitsPublished: published,
  };
}

function readLedger(): CalculatedDeckRowV1[] {
  const path = boardPath();
  if (!existsSync(path)) return [];
  const body = JSON.parse(readFileSync(path, "utf8")) as { entries?: CalculatedDeckRowV1[] };
  return (body.entries ?? []).map((entry) =>
    calculatedDeckRow({
      id: entry.id,
      name: entry.name,
      bracket: entry.bracket,
      measuredAt: entry.measuredAt,
      speed: entry.speed,
      planRate: entry.namedLineRate ?? entry.planRate,
      resilience: entry.resilience,
      synergy: entry.synergy,
      planValid: entry.planValid,
      namedLineRate: entry.namedLineRate ?? entry.planRate,
      namedLineSpeed: entry.namedLineSpeed ?? entry.speed,
      score: entry.legacyNamedLineScore ?? (entry.scoreDigitsPublished ? entry.score : null),
    }),
  );
}

export function recordCalculatedDeck(row: CalculatedDeckRowV1) {
  const path = boardPath();
  mkdirSync(dirname(path), { recursive: true });
  const entries = readLedger().filter((entry) => entry.id !== row.id);
  entries.push(row);
  writeFileSync(path, JSON.stringify({ schema: CALCULATED_DECK_BOARD_VERSION, entries }));
}

function fieldRows(): CalculatedDeckRowV1[] {
  const path = fieldPath();
  if (!existsSync(path)) return [];
  const field = JSON.parse(readFileSync(path, "utf8")) as FieldFile;
  return (field.entries ?? []).flatMap((entry) => {
    if (!entry.name) return [];
    const namedLineRate = entry.scris?.consistency ?? entry.score?.planRate ?? null;
    const connectivity = entry.scris?.synergy ?? null;
    return [
      calculatedDeckRow({
        id: entry.buildId || entry.oracleId || entry.name,
        name: entry.name,
        bracket: entry.score?.bracket ?? 2,
        measuredAt: entry.measuredAt ?? "",
        speed: entry.scris?.speed ?? null,
        planRate: namedLineRate,
        resilience: entry.scris?.resilience ?? null,
        synergy: connectivity,
        planValid: connectivity == null ? null : connectivity > 0,
        namedLineRate,
        namedLineSpeed: entry.scris?.speed ?? null,
        score: entry.score?.w != null ? entry.score.display ?? null : null,
      }),
    ];
  });
}

function snapshotRows(): CalculatedDeckRowV1[] {
  return scoredDecksSnapshot.map((row) =>
    calculatedDeckRow({
      id: row.id,
      name: row.name,
      bracket: row.bracket,
      measuredAt: row.measuredAt,
      speed: row.speed,
      planRate: row.planRate,
      resilience: row.resilience,
      synergy: row.synergy,
      planValid: row.synergy == null ? null : row.synergy > 0,
      namedLineRate: row.planRate,
      namedLineSpeed: row.speed,
      score: row.score,
    }),
  );
}

export function listCalculatedDecks(): CalculatedDeckRowV1[] {
  const byId = new Map<string, CalculatedDeckRowV1>();
  for (const row of [...snapshotRows(), ...fieldRows(), ...readLedger()]) byId.set(row.id, row);
  return [...byId.values()].sort((a, b) => {
    if (a.bracket !== b.bracket) return a.bracket - b.bracket;
    const aRate = a.namedLineRate ?? -1;
    const bRate = b.namedLineRate ?? -1;
    if (bRate !== aRate) return bRate - aRate;
    const aSpeed = a.namedLineSpeed ?? 99;
    const bSpeed = b.namedLineSpeed ?? 99;
    if (aSpeed !== bSpeed) return aSpeed - bSpeed;
    return a.name.localeCompare(b.name);
  });
}
