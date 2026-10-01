/**
 * Every measured Professor deck on the public board.
 * The four-digit execution score is 1000×bracket + round(999×planSuccess×resilience).
 * It stays empty until both of those rates are measured.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const CALCULATED_DECK_BOARD_VERSION = "calculated-decks-1.0" as const;

export type CalculatedDeckRowV1 = {
  id: string;
  name: string;
  bracket: 1 | 2 | 3 | 4 | 5;
  measuredAt: string;
  speed: number | null;
  planRate: number | null;
  resilience: number | null;
  synergy: number | null;
  executionScore: string | null;
  pendingReason: string | null;
};

type FieldFile = {
  entries?: Array<{
    oracleId?: string;
    name?: string;
    buildId?: string | null;
    measuredAt?: string;
    score?: { bracket?: number; planRate?: number | null };
    scris?: {
      speed?: number | null;
      consistency?: number | null;
      resilience?: number | null;
      synergy?: number | null;
    };
  }>;
};

const PENDING =
  "The execution score waits until the replay checks the Professor's stated win and the seven setbacks have been played.";

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
}): CalculatedDeckRowV1 {
  const bracket = asBracket(args.bracket);
  const planRate = args.planRate ?? null;
  const resilience = args.resilience ?? null;
  const score = executionScore(planRate, resilience, bracket);
  return {
    id: args.id,
    name: args.name,
    bracket,
    measuredAt: args.measuredAt,
    speed: args.speed ?? null,
    planRate,
    resilience,
    synergy: args.synergy ?? null,
    executionScore: score,
    pendingReason: score == null ? PENDING : null,
  };
}

function readLedger(): CalculatedDeckRowV1[] {
  const path = boardPath();
  if (!existsSync(path)) return [];
  const body = JSON.parse(readFileSync(path, "utf8")) as { entries?: CalculatedDeckRowV1[] };
  return body.entries ?? [];
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
    return [
      calculatedDeckRow({
        id: entry.buildId || entry.oracleId || entry.name,
        name: entry.name,
        bracket: entry.score?.bracket ?? 2,
        measuredAt: entry.measuredAt ?? "",
        speed: entry.scris?.speed ?? null,
        planRate: entry.scris?.consistency ?? entry.score?.planRate ?? null,
        resilience: entry.scris?.resilience ?? null,
        synergy: entry.scris?.synergy ?? null,
      }),
    ];
  });
}

export function listCalculatedDecks(): CalculatedDeckRowV1[] {
  const byId = new Map<string, CalculatedDeckRowV1>();
  for (const row of [...fieldRows(), ...readLedger()]) byId.set(row.id, row);
  return [...byId.values()].sort((a, b) => {
    const aScore = a.executionScore == null ? -1 : Number(a.executionScore);
    const bScore = b.executionScore == null ? -1 : Number(b.executionScore);
    if (bScore !== aScore) return bScore - aScore;
    const aPlan = a.planRate ?? -1;
    const bPlan = b.planRate ?? -1;
    if (bPlan !== aPlan) return bPlan - aPlan;
    return a.name.localeCompare(b.name);
  });
}
