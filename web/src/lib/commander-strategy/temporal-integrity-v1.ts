import type { TopdeckTournament } from "./topdeck/types";

export type TemporalStatus = "HISTORICAL_THROUGH_FETCH" | "FUTURE_SCHEDULED";

export type TemporalTournamentRecord = {
  tid: string;
  tournamentName?: string;
  rawStartDate?: number;
  startDateUtc: string;
  startDateLocal?: string;
  fetchedAt: string;
  temporalStatus: TemporalStatus;
  trainingEligible: boolean;
  status?: string;
  rounds?: number;
  tableStatuses: Record<string, number>;
  winnerIdSummary: {
    completedWithWinner: number;
    completedDraw: number;
    completedWinnerNull: number;
    completedWinnerInvalid: number;
  };
};

export function parseFetchedAtDate(fetchedAt: string): string {
  return fetchedAt.slice(0, 10);
}

export function classifyTemporalStatus(input: {
  tournamentStartDate?: number;
  fetchedAt: string;
}): TemporalStatus {
  if (!input.tournamentStartDate) return "HISTORICAL_THROUGH_FETCH";
  const fetchDay = parseFetchedAtDate(input.fetchedAt);
  const startDay = new Date(input.tournamentStartDate * 1000).toISOString().slice(0, 10);
  return startDay <= fetchDay ? "HISTORICAL_THROUGH_FETCH" : "FUTURE_SCHEDULED";
}

export function auditTournamentTemporal(input: {
  tournament: TopdeckTournament;
  fetchedAt: string;
}): TemporalTournamentRecord {
  const { tournament, fetchedAt } = input;
  const tid = tournament.TID ?? "unknown";
  const temporalStatus = classifyTemporalStatus({
    tournamentStartDate: tournament.startDate,
    fetchedAt,
  });
  const tableStatuses: Record<string, number> = {};
  const winnerIdSummary = {
    completedWithWinner: 0,
    completedDraw: 0,
    completedWinnerNull: 0,
    completedWinnerInvalid: 0,
  };

  for (const round of tournament.rounds ?? []) {
    for (const table of round.tables ?? []) {
      const status = table.status ?? "Unknown";
      tableStatuses[status] = (tableStatuses[status] ?? 0) + 1;
      if (status !== "Completed") continue;
      const winnerId = table.winner_id;
      const playerIds = new Set((table.players ?? []).map((p) => p.id).filter(Boolean));
      if (winnerId === "Draw" || table.winner === "Draw") winnerIdSummary.completedDraw += 1;
      else if (!winnerId) winnerIdSummary.completedWinnerNull += 1;
      else if (playerIds.has(winnerId)) winnerIdSummary.completedWithWinner += 1;
      else winnerIdSummary.completedWinnerInvalid += 1;
    }
  }

  const startDateUtc = tournament.startDate
    ? new Date(tournament.startDate * 1000).toISOString()
    : "unknown";

  return {
    tid,
    tournamentName: tournament.tournamentName,
    rawStartDate: tournament.startDate,
    startDateUtc,
    startDateLocal: tournament.startDate
      ? new Date(tournament.startDate * 1000).toLocaleString("en-US", { timeZone: "America/Chicago" })
      : undefined,
    fetchedAt,
    temporalStatus,
    trainingEligible: temporalStatus === "HISTORICAL_THROUGH_FETCH",
    rounds: tournament.rounds?.length,
    tableStatuses,
    winnerIdSummary,
  };
}

export type TemporalCorpusSummary = {
  rawTournaments: number;
  historicalTournaments: number;
  futureScheduledTournaments: number;
  rawPods: number;
  historicalPods: number;
  futurePodsExcluded: number;
  rawDeckRecords: number;
  historicalDeckRecords: number;
  futureDeckRecordsExcluded: number;
  futureByStatus: Record<string, number>;
  futureWinnerSummary: Record<string, number>;
  representativeFutureTournaments: TemporalTournamentRecord[];
  classificationNotes: string[];
};
