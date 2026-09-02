import type { NormalizedDeckInstance } from "./types";
import type { TopdeckStandingRow, TopdeckTournament } from "./topdeck/types";
import { hashTopdeckPlayerId, makeDeckInstanceId } from "./deck-hash-v1";
import { classifyTemporalStatus } from "./temporal-integrity-v1";

export type DecklistUnavailabilityReason =
  | "submitted_visible"
  | "no_submitted_deck"
  | "tournament_visibility_restriction"
  | "event_not_yet_ended"
  | "deck_url_text_unavailable"
  | "deckobj_unavailable_text_available"
  | "other"
  | "unknown";

export type DecklistSeatRecord = {
  deckInstanceId: string;
  tid: string;
  reason: DecklistUnavailabilityReason;
  decklistAvailable: boolean;
  deckObjAvailable: boolean;
};

export type TournamentDecklistBucket = "100" | "90-99" | "50-89" | "1-49" | "0";

export type TournamentDecklistCoverage = {
  tid: string;
  tournamentDate: string;
  temporalStatus: "HISTORICAL_THROUGH_FETCH" | "FUTURE_SCHEDULED";
  seatCount: number;
  decklistSeatCount: number;
  coveragePct: number;
  bucket: TournamentDecklistBucket;
};

function classifySeatReason(input: {
  standing?: TopdeckStandingRow;
  deck?: NormalizedDeckInstance;
  tournament: TopdeckTournament;
  fetchedAt: string;
}): DecklistUnavailabilityReason {
  const { standing, deck, tournament, fetchedAt } = input;
  const temporal = classifyTemporalStatus({ tournamentStartDate: tournament.startDate, fetchedAt });
  const hasText = Boolean(standing?.decklist?.trim() || deck?.decklistAvailable);
  const hasObj = Boolean(standing?.deckObj || deck?.deckObjAvailable);

  if (hasObj && hasText) return "submitted_visible";
  if (hasObj && !hasText) return "deckobj_unavailable_text_available";
  if (hasText) return "submitted_visible";
  if (temporal === "FUTURE_SCHEDULED") return "event_not_yet_ended";
  if (!standing?.decklist && !standing?.deckObj) return "no_submitted_deck";
  return "unknown";
}

export function auditDecklistCoverage(input: {
  tournaments: TopdeckTournament[];
  decks: NormalizedDeckInstance[];
  fetchedAt: string;
}): {
  seatReasonCounts: Record<DecklistUnavailabilityReason, number>;
  tournamentBuckets: Record<
    TournamentDecklistBucket,
    { tournamentCount: number; podCount: number; seatCount: number }
  >;
  tournamentCoverage: TournamentDecklistCoverage[];
  seatDecklistPct: { count: number; denominator: number; pct: number };
} {
  const deckById = new Map(input.decks.map((d) => [d.deckInstanceId, d]));
  const seatReasonCounts: Record<DecklistUnavailabilityReason, number> = {
    submitted_visible: 0,
    no_submitted_deck: 0,
    tournament_visibility_restriction: 0,
    event_not_yet_ended: 0,
    deck_url_text_unavailable: 0,
    deckobj_unavailable_text_available: 0,
    other: 0,
    unknown: 0,
  };

  const tournamentBuckets: Record<
    TournamentDecklistBucket,
    { tournamentCount: number; podCount: number; seatCount: number }
  > = {
    "100": { tournamentCount: 0, podCount: 0, seatCount: 0 },
    "90-99": { tournamentCount: 0, podCount: 0, seatCount: 0 },
    "50-89": { tournamentCount: 0, podCount: 0, seatCount: 0 },
    "1-49": { tournamentCount: 0, podCount: 0, seatCount: 0 },
    "0": { tournamentCount: 0, podCount: 0, seatCount: 0 },
  };

  const tournamentCoverage: TournamentDecklistCoverage[] = [];
  let decklistSeats = 0;
  let totalSeats = 0;

  for (const tournament of input.tournaments) {
    const tid = tournament.TID ?? "unknown";
    const temporalStatus = classifyTemporalStatus({
      tournamentStartDate: tournament.startDate,
      fetchedAt: input.fetchedAt,
    });
    const tournamentDate = tournament.startDate
      ? new Date(tournament.startDate * 1000).toISOString().slice(0, 10)
      : "unknown";

    const standingById = new Map((tournament.standings ?? []).map((s) => [s.id, s]));
    const seenPlayers = new Set<string>();
    let seatCount = 0;
    let decklistSeatCount = 0;
    let podCount = 0;

    for (const round of tournament.rounds ?? []) {
      for (const table of round.tables ?? []) {
        if (String(table.table ?? "").toLowerCase() === "byes") continue;
        podCount += 1;
        for (const player of table.players ?? []) {
          if (!player.id || seenPlayers.has(player.id)) continue;
          seenPlayers.add(player.id);
          seatCount += 1;
          totalSeats += 1;
          const deckInstanceId = makeDeckInstanceId(tid, hashTopdeckPlayerId(player.id));
          const deck = deckById.get(deckInstanceId);
          const standing = standingById.get(player.id);
          const usable = Boolean(deck?.decklistAvailable || deck?.deckObjAvailable);
          if (usable) {
            decklistSeatCount += 1;
            decklistSeats += 1;
          }
          const reason = classifySeatReason({ standing, deck, tournament, fetchedAt: input.fetchedAt });
          seatReasonCounts[reason] += 1;
        }
      }
    }

    const coveragePct = seatCount > 0 ? (decklistSeatCount / seatCount) * 100 : 0;
    let bucket: TournamentDecklistBucket = "0";
    if (coveragePct >= 100) bucket = "100";
    else if (coveragePct >= 90) bucket = "90-99";
    else if (coveragePct >= 50) bucket = "50-89";
    else if (coveragePct > 0) bucket = "1-49";

    tournamentBuckets[bucket].tournamentCount += 1;
    tournamentBuckets[bucket].podCount += podCount;
    tournamentBuckets[bucket].seatCount += seatCount;

    tournamentCoverage.push({
      tid,
      tournamentDate,
      temporalStatus,
      seatCount,
      decklistSeatCount,
      coveragePct: Number(coveragePct.toFixed(2)),
      bucket,
    });
  }

  return {
    seatReasonCounts,
    tournamentBuckets,
    tournamentCoverage,
    seatDecklistPct: {
      count: decklistSeats,
      denominator: totalSeats,
      pct: totalSeats > 0 ? Number(((decklistSeats / totalSeats) * 100).toFixed(2)) : 0,
    },
  };
}
