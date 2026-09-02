import type { TopdeckTable, TopdeckTournament } from "./topdeck/types";

export type PodOutcomeState =
  | "validWinner"
  | "explicitDraw"
  | "completedButWinnerNull"
  | "unfinishedWinnerNull"
  | "invalidWinnerId"
  | "bye"
  | "other";

export type PodOutcomeCounts = Record<PodOutcomeState, number> & { allTables: number };

export type ClassifiedTable = {
  tid: string;
  round: number | string;
  table: number | string;
  status: string;
  outcomeState: PodOutcomeState;
  winnerId?: string | null;
  playerIds: string[];
  podSize: number;
  outcomeTrainingEligible: boolean;
};

export function emptyOutcomeCounts(): PodOutcomeCounts {
  return {
    allTables: 0,
    validWinner: 0,
    explicitDraw: 0,
    completedButWinnerNull: 0,
    unfinishedWinnerNull: 0,
    invalidWinnerId: 0,
    bye: 0,
    other: 0,
  };
}

export function classifyTableOutcome(table: TopdeckTable): PodOutcomeState {
  const status = table.status ?? "Unknown";
  const tableId = String(table.table ?? "").toLowerCase();

  if (status === "Bye" || tableId === "byes" || tableId === "bye") return "bye";

  const playerIds = (table.players ?? []).map((p) => p.id).filter((id): id is string => Boolean(id));
  const winnerId = table.winner_id ?? null;
  const draw = winnerId === "Draw" || table.winner === "Draw";

  if (status !== "Completed") {
    return "unfinishedWinnerNull";
  }

  if (draw) return "explicitDraw";
  if (!winnerId) return "completedButWinnerNull";

  const winnerMatches = playerIds.filter((id) => id === winnerId);
  if (winnerMatches.length === 1) return "validWinner";
  if (winnerMatches.length === 0) return "invalidWinnerId";
  return "other";
}

export function isOutcomeTrainingEligible(state: PodOutcomeState, historical: boolean): boolean {
  return historical && state === "validWinner";
}

export function auditTournamentTableOutcomes(tournament: TopdeckTournament, historical = true): {
  counts: PodOutcomeCounts;
  tables: ClassifiedTable[];
} {
  const counts = emptyOutcomeCounts();
  const tables: ClassifiedTable[] = [];
  const tid = tournament.TID ?? "unknown";

  for (const round of tournament.rounds ?? []) {
    for (const table of round.tables ?? []) {
      counts.allTables += 1;
      const outcomeState = classifyTableOutcome(table);
      counts[outcomeState] += 1;
      const playerIds = (table.players ?? []).map((p) => p.id).filter((id): id is string => Boolean(id));
      tables.push({
        tid,
        round: round.round ?? "?",
        table: table.table ?? "?",
        status: table.status ?? "Unknown",
        outcomeState,
        winnerId: table.winner_id,
        playerIds,
        podSize: playerIds.length,
        outcomeTrainingEligible: isOutcomeTrainingEligible(outcomeState, historical),
      });
    }
  }

  return { counts, tables };
}

export function mergeOutcomeCounts(base: PodOutcomeCounts, add: PodOutcomeCounts): PodOutcomeCounts {
  const out = emptyOutcomeCounts();
  for (const key of Object.keys(out) as Array<keyof PodOutcomeCounts>) {
    out[key] = base[key] + add[key];
  }
  return out;
}

export function outcomePct(count: number, denominator: number): { count: number; denominator: number; pct: number } {
  return {
    count,
    denominator,
    pct: denominator > 0 ? Number(((count / denominator) * 100).toFixed(2)) : 0,
  };
}
