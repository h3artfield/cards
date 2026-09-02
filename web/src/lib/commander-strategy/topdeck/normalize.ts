import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import {
  computeDeckHash,
  hashTopdeckPlayerId,
  makeDeckInstanceId,
  makePodId,
} from "../deck-hash-v1";
import { resolveDeckAgainstCatalog } from "../deck-resolver-v1";
import { buildCommanderConfiguration } from "../commander-configuration-v1";
import type {
  NormalizedDeckInstance,
  TopdeckPodGame,
  TopdeckPodParticipant,
} from "../types";
import { TOPDECK_SOURCE_POPULATION } from "../semantic-universe-v1";
import type { TopdeckStandingRow, TopdeckTournament } from "./types";

export type NormalizationStats = {
  pods: number;
  completedPods: number;
  pendingPods: number;
  activePods: number;
  excludedPods: number;
  roundsObserved: number;
  podSizeCounts: Record<string, number>;
  deckAppearances: number;
  decklistAvailable: number;
  deckObjAvailable: number;
  structuredCommanderAvailable: number;
  parsedTextCommanderAvailable: number;
  draws: number;
  winnerAssigned: number;
  noWinnerPods: number;
};

const IGNORED_TABLE_STATUS = new Set(["Pending", "Active", "Bye"]);

export function normalizeTournament(input: {
  tournament: TopdeckTournament;
  catalog: DeckResolutionCatalog;
  requestedFetchWindow?: string;
}): {
  deckInstances: NormalizedDeckInstance[];
  podGames: TopdeckPodGame[];
  stats: NormalizationStats;
} {
  const { tournament, catalog, requestedFetchWindow } = input;
  const tid = tournament.TID ?? "unknown";
  const tournamentDate = tournament.startDate
    ? new Date(tournament.startDate * 1000).toISOString().slice(0, 10)
    : "unknown";
  const canonicalMonth = tournamentDate !== "unknown" ? tournamentDate.slice(0, 7) : undefined;
  const sourceFormat = tournament.format ?? "EDH";

  const stats: NormalizationStats = {
    pods: 0,
    completedPods: 0,
    pendingPods: 0,
    activePods: 0,
    excludedPods: 0,
    roundsObserved: tournament.rounds?.length ?? 0,
    podSizeCounts: {},
    deckAppearances: 0,
    decklistAvailable: 0,
    deckObjAvailable: 0,
    structuredCommanderAvailable: 0,
    parsedTextCommanderAvailable: 0,
    draws: 0,
    winnerAssigned: 0,
    noWinnerPods: 0,
  };

  const standingByPlayerId = new Map<string, TopdeckStandingRow>();
  for (const row of tournament.standings ?? []) {
    if (row.id) standingByPlayerId.set(row.id, row);
  }

  const deckInstances = new Map<string, NormalizedDeckInstance>();
  const podGames: TopdeckPodGame[] = [];

  const getOrCreateDeck = (
    playerId: string,
    decklist?: string | null,
    deckObj?: TopdeckStandingRow["deckObj"],
  ): NormalizedDeckInstance | null => {
    if (!playerId) return null;
    const playerIdHash = hashTopdeckPlayerId(playerId);
    const deckInstanceId = makeDeckInstanceId(tid, playerIdHash);
    const existing = deckInstances.get(deckInstanceId);
    if (existing) return existing;

    const standing = standingByPlayerId.get(playerId);
    const resolved = resolveDeckAgainstCatalog({
      deckObj: deckObj ?? standing?.deckObj,
      decklist: decklist ?? standing?.decklist,
      catalog,
    });

    if (resolved.decklistAvailable) stats.decklistAvailable += 1;
    if (resolved.deckObjAvailable) stats.deckObjAvailable += 1;
    if (resolved.structuredCommanderAvailable) stats.structuredCommanderAvailable += 1;
    if (resolved.parsedTextCommanderAvailable) stats.parsedTextCommanderAvailable += 1;
    stats.deckAppearances += 1;

    const resolvedMain = resolved.mainboard
      .filter((c) => c.oracleId)
      .map((c) => ({ oracleId: c.oracleId!, quantity: c.quantity }));

    const deckHash =
      resolved.commanderOracleIds.length > 0 && resolvedMain.length > 0
        ? computeDeckHash({
            commanderOracleIds: resolved.commanderOracleIds,
            mainboard: resolvedMain,
          })
        : `unresolved:${deckInstanceId}`;

    const commanderConfiguration = buildCommanderConfiguration({
      commanderOracleIds: resolved.commanderOracleIds,
      commanderNames: resolved.commanders.map((c) => c.sourceName),
    });

    const instance: NormalizedDeckInstance = {
      deckInstanceId,
      deckHash,
      tid,
      tournamentDate,
      canonicalMonth,
      sourceFormat,
      sourcePopulation: TOPDECK_SOURCE_POPULATION,
      playerIdHash,
      commanders: resolved.commanders,
      commanderOracleIds: resolved.commanderOracleIds,
      commanderConfigurationId: commanderConfiguration?.commanderConfigurationId,
      commanderResolutionStatus: resolved.commanderResolutionStatus,
      mainboard: resolved.mainboard,
      cardResolutionRate: resolved.cardResolutionRate,
      unresolvedCards: resolved.unresolvedCards,
      deckObjAvailable: resolved.deckObjAvailable,
      decklistAvailable: resolved.decklistAvailable,
      structuredCommanderAvailable: resolved.structuredCommanderAvailable,
      parsedTextCommanderAvailable: resolved.parsedTextCommanderAvailable,
      digitalOnlyCardCount: resolved.digitalOnlyCardCount,
      nonPaperCardCount: resolved.nonPaperCardCount,
    };
    deckInstances.set(deckInstanceId, instance);
    return instance;
  };

  for (const round of tournament.rounds ?? []) {
    const roundNum = round.round ?? "?";
    for (const table of round.tables ?? []) {
      if (table.table === "Byes" || table.table === "bye") {
        stats.excludedPods += 1;
        continue;
      }
      stats.pods += 1;

      const status = table.status ?? "Unknown";
      const podSize = table.players?.length ?? 0;
      stats.podSizeCounts[String(podSize)] = (stats.podSizeCounts[String(podSize)] ?? 0) + 1;

      if (status === "Pending") stats.pendingPods += 1;
      else if (status === "Active") stats.activePods += 1;
      else if (IGNORED_TABLE_STATUS.has(status)) stats.excludedPods += 1;

      if (IGNORED_TABLE_STATUS.has(status)) continue;
      if (status !== "Completed") continue;
      stats.completedPods += 1;

      const participants: TopdeckPodParticipant[] = [];
      let winnerPlayerIdHash: string | undefined;
      const draw = table.winner_id === "Draw" || table.winner === "Draw";

      for (const player of table.players ?? []) {
        if (!player.id) continue;
        const deck = getOrCreateDeck(player.id, player.decklist, player.deckObj);
        if (!deck) continue;
        const winner =
          !draw &&
          ((table.winner_id && table.winner_id === player.id) ||
            (table.winner && table.winner === player.name));
        if (winner) winnerPlayerIdHash = deck.playerIdHash;
        participants.push({
          playerIdHash: deck.playerIdHash,
          deckInstanceId: deck.deckInstanceId,
          deckHash: deck.deckHash,
          commanderOracleIds: deck.commanderOracleIds,
          commanderConfigurationId: deck.commanderConfigurationId,
          winner,
        });
      }

      if (draw) stats.draws += 1;
      else if (winnerPlayerIdHash) stats.winnerAssigned += 1;
      else stats.noWinnerPods += 1;

      podGames.push({
        podId: makePodId(tid, roundNum, table.table ?? "?"),
        tid,
        tournamentDate,
        canonicalMonth,
        requestedFetchWindow,
        round: roundNum,
        table: table.table ?? "?",
        podSize,
        status,
        participants,
        winnerPlayerIdHash,
        draw,
        sourceFormat,
        sourcePopulation: TOPDECK_SOURCE_POPULATION,
      });
    }
  }

  for (const row of tournament.standings ?? []) {
    if (row.id) getOrCreateDeck(row.id, row.decklist, row.deckObj);
  }

  return {
    deckInstances: [...deckInstances.values()],
    podGames,
    stats,
  };
}

export function isCompletedTrainingPod(pod: TopdeckPodGame): boolean {
  return pod.status === "Completed" && pod.participants.length >= 2;
}
