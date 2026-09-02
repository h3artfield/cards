import { createReadStream, existsSync, readFileSync } from "node:fs";
import { createGunzip } from "node:zlib";
import readline from "node:readline";
import { loadHistoricalImportManifest } from "./topdeck/historical-manifest";
import { twelveMonthWindowKeys, latestMonthKey } from "./topdeck/historical-window-v1";
import { isHistoricalQAPod } from "./corpus-reconciliation-v1";
import { classifyTemporalStatus } from "./temporal-integrity-v1";
import { topdeckRawRunDir, TOPDECK_DATA_DIR } from "./topdeck/artifact-paths";
import type { TopdeckImportRun } from "./types";
import type { NormalizedDeckInstance, TopdeckPodGame } from "./types";
import type { TopdeckTournament } from "./topdeck/types";

export type CorpusMonthKey = string | "combined";

export const DEFAULT_HISTORICAL_MONTHS = twelveMonthWindowKeys();

export type LoadedImportRun = {
  monthKey: string;
  runId: string;
  manifest: TopdeckImportRun;
  pods: TopdeckPodGame[];
  decks: NormalizedDeckInstance[];
  aggregateStats: Record<string, unknown>;
  tournamentMeta: Array<{
    tid: string;
    name?: string;
    startDate?: number;
    participants?: number;
    city?: string;
    state?: string;
  }>;
  tournaments: TopdeckTournament[];
};

export type CombinedCorpus = {
  runs: LoadedImportRun[];
  combined: {
    rawPodRetrievals: number;
    uniquePodIds: number;
    duplicatePodRetrievals: number;
    rawTournamentRetrievals: number;
    uniqueTournamentTids: number;
    duplicateTournamentRetrievals: number;
    pods: TopdeckPodGame[];
    decks: NormalizedDeckInstance[];
    deckById: Map<string, NormalizedDeckInstance>;
    podProvenance: Map<string, string[]>;
    tournamentProvenance: Map<string, string[]>;
    tournaments: TopdeckTournament[];
    tournamentByTid: Map<string, TopdeckTournament>;
    fetchedAtByMonth: Record<string, string>;
  };
  byMonth: Record<string, {
    pods: TopdeckPodGame[];
    decks: NormalizedDeckInstance[];
    deckById: Map<string, NormalizedDeckInstance>;
    tournaments: TopdeckTournament[];
    runId: string;
    fetchedAt: string;
  }>;
};

const DEFAULT_MONTHS = DEFAULT_HISTORICAL_MONTHS;

async function loadRawTournaments(runDir: string): Promise<TopdeckTournament[]> {
  const rawPath = `${runDir}/raw-tournaments.jsonl.gz`;
  if (!existsSync(rawPath)) return [];
  const tournaments: TopdeckTournament[] = [];
  const input = createReadStream(rawPath).pipe(createGunzip());
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as { tournament?: TopdeckTournament };
    if (row.tournament) tournaments.push(row.tournament);
  }
  return tournaments;
}

function loadRunArtifacts(monthKey: string, runId: string): Omit<LoadedImportRun, "tournaments"> {
  const runDir = topdeckRawRunDir(runId);
  const v3ManifestPath = `${runDir}/normalization-manifest-v3.json`;
  const v2ManifestPath = `${runDir}/normalization-manifest-v2.json`;
  const useV3 = existsSync(v3ManifestPath);
  const useV2 = !useV3 && existsSync(v2ManifestPath);
  const podsPath = useV3
    ? `${runDir}/normalized-pods-v3.json`
    : useV2
      ? `${runDir}/normalized-pods-v2.json`
      : `${runDir}/normalized-pods.json`;
  const decksPath = useV3
    ? `${runDir}/normalized-decks-v3.json`
    : useV2
      ? `${runDir}/normalized-decks-v2.json`
      : `${runDir}/normalized-decks.json`;
  const pods = JSON.parse(readFileSync(podsPath, "utf8")) as TopdeckPodGame[];
  const decks = JSON.parse(readFileSync(decksPath, "utf8")) as NormalizedDeckInstance[];
  const manifest = JSON.parse(readFileSync(`${runDir}/run-manifest.json`, "utf8")) as TopdeckImportRun;
  const aggregate = existsSync(`${runDir}/aggregate-stats.json`)
    ? (JSON.parse(readFileSync(`${runDir}/aggregate-stats.json`, "utf8")) as {
        aggregateStats: Record<string, unknown>;
        tournamentMeta: LoadedImportRun["tournamentMeta"];
      })
    : { aggregateStats: {}, tournamentMeta: [] };

  return {
    monthKey,
    runId,
    manifest,
    pods,
    decks,
    aggregateStats: aggregate.aggregateStats,
    tournamentMeta: aggregate.tournamentMeta ?? [],
  };
}

export async function loadCombinedCorpus(
  monthKeys: string[] = DEFAULT_MONTHS,
  options: { includeRawTournaments?: boolean } = {},
): Promise<CombinedCorpus> {
  const includeRawTournaments = options.includeRawTournaments ?? true;
  const historical = loadHistoricalImportManifest();
  const runs: LoadedImportRun[] = [];

  for (const monthKey of monthKeys) {
    const record = historical.months[monthKey];
    if (!record?.runId) throw new Error(`Missing import run for month ${monthKey}`);
    const partial = loadRunArtifacts(monthKey, record.runId);
    const tournaments = includeRawTournaments
      ? await loadRawTournaments(topdeckRawRunDir(record.runId))
      : [];
    runs.push({ ...partial, tournaments });
  }

  const podMap = new Map<string, TopdeckPodGame>();
  const podProvenance = new Map<string, string[]>();
  const deckMap = new Map<string, NormalizedDeckInstance>();
  const tournamentMap = new Map<string, TopdeckTournament>();
  const tournamentProvenance = new Map<string, string[]>();
  let rawPodRetrievals = 0;
  let rawTournamentRetrievals = 0;
  const fetchedAtByMonth: Record<string, string> = {};
  const byMonth: CombinedCorpus["byMonth"] = {};

  for (const run of runs) {
    fetchedAtByMonth[run.monthKey] = run.manifest.fetchedAt;

    for (const pod of run.pods) {
      rawPodRetrievals += 1;
      const existing = podProvenance.get(pod.podId) ?? [];
      existing.push(run.runId);
      podProvenance.set(pod.podId, existing);
      if (!podMap.has(pod.podId)) podMap.set(pod.podId, pod);
    }

    for (const deck of run.decks) {
      deckMap.set(deck.deckInstanceId, deck);
    }

    for (const tournament of run.tournaments) {
      rawTournamentRetrievals += 1;
      const tid = tournament.TID ?? "unknown";
      const existing = tournamentProvenance.get(tid) ?? [];
      existing.push(run.runId);
      tournamentProvenance.set(tid, existing);
      if (!tournamentMap.has(tid)) tournamentMap.set(tid, tournament);
    }
  }

  for (const run of runs) {
    const monthKey = run.monthKey;
    const monthPods = [...podMap.values()].filter(
      (p) => (p.canonicalMonth ?? p.tournamentDate?.slice(0, 7)) === monthKey,
    );
    const monthDeckById = new Map<string, NormalizedDeckInstance>();
    for (const pod of monthPods) {
      for (const seat of pod.participants) {
        const deck = deckMap.get(seat.deckInstanceId);
        if (deck) monthDeckById.set(deck.deckInstanceId, deck);
      }
    }
    for (const deck of deckMap.values()) {
      const deckMonth = deck.canonicalMonth ?? deck.tournamentDate?.slice(0, 7);
      if (deckMonth === monthKey) monthDeckById.set(deck.deckInstanceId, deck);
    }

    byMonth[monthKey] = {
      pods: monthPods,
      decks: [...monthDeckById.values()],
      deckById: monthDeckById,
      tournaments: [...tournamentMap.values()].filter((t) => {
        if (!t.startDate) return false;
        const startMonth = new Date(t.startDate * 1000).toISOString().slice(0, 7);
        return startMonth === monthKey;
      }),
      runId: run.runId,
      fetchedAt: run.manifest.fetchedAt,
    };
  }

  return {
    runs,
    combined: {
      rawPodRetrievals,
      uniquePodIds: podMap.size,
      duplicatePodRetrievals: rawPodRetrievals - podMap.size,
      rawTournamentRetrievals,
      uniqueTournamentTids: tournamentMap.size,
      duplicateTournamentRetrievals: rawTournamentRetrievals - tournamentMap.size,
      pods: [...podMap.values()],
      decks: [...deckMap.values()],
      deckById: deckMap,
      podProvenance,
      tournamentProvenance,
      tournaments: [...tournamentMap.values()],
      tournamentByTid: tournamentMap,
      fetchedAtByMonth,
    },
    byMonth,
  };
}

export function monthKeyFromDate(date: string): string {
  return date.slice(0, 7);
}

export function filterHistoricalQAPodsFromScope(
  corpus: CombinedCorpus,
  scope: CorpusMonthKey,
): TopdeckPodGame[] {
  const pods = scope === "combined" ? corpus.combined.pods : (corpus.byMonth[scope]?.pods ?? []);
  return pods.filter((pod) => isHistoricalQAPod(pod, corpus));
}

export function filterPodsForScope(
  corpus: CombinedCorpus,
  scope: CorpusMonthKey,
  historicalOnly = false,
  fetchedAt?: string,
): TopdeckPodGame[] {
  const pods = scope === "combined" ? corpus.combined.pods : (corpus.byMonth[scope]?.pods ?? []);
  if (historicalOnly) {
    return pods.filter((pod) => isHistoricalQAPod(pod, corpus));
  }
  if (!fetchedAt) return pods;
  const fetchDay = fetchedAt.slice(0, 10);
  return pods.filter((p) => p.tournamentDate <= fetchDay);
}

export function filterDecksForScope(
  corpus: CombinedCorpus,
  scope: CorpusMonthKey,
  historicalOnly = false,
  fetchedAt?: string,
): NormalizedDeckInstance[] {
  const decks = scope === "combined" ? corpus.combined.decks : (corpus.byMonth[scope]?.decks ?? []);
  if (historicalOnly) {
    const historicalTids = new Set(
      filterHistoricalQAPodsFromScope(corpus, scope === "combined" ? "combined" : scope).map((p) => p.tid),
    );
    return decks.filter((d) => historicalTids.has(d.tid));
  }
  if (!fetchedAt) return decks;
  const fetchDay = fetchedAt.slice(0, 10);
  return decks.filter((d) => d.tournamentDate <= fetchDay);
}

export function filterTournamentsForScope(
  corpus: CombinedCorpus,
  scope: CorpusMonthKey,
  historicalOnly = false,
  fetchedAt?: string,
): TopdeckTournament[] {
  const tournaments =
    scope === "combined" ? corpus.combined.tournaments : (corpus.byMonth[scope]?.tournaments ?? []);
  if (historicalOnly) {
    const anchorMonth =
      scope === "combined"
        ? latestMonthKey(Object.keys(corpus.byMonth))
        : scope;
    const fetchedAt =
      corpus.byMonth[anchorMonth]?.fetchedAt ??
      corpus.combined.fetchedAtByMonth[anchorMonth] ??
      corpus.combined.fetchedAtByMonth[latestMonthKey(Object.keys(corpus.combined.fetchedAtByMonth))];
    return tournaments.filter(
      (t) =>
        classifyTemporalStatus({ tournamentStartDate: t.startDate, fetchedAt }) ===
        "HISTORICAL_THROUGH_FETCH",
    );
  }
  if (!fetchedAt) return tournaments;
  const fetchDay = fetchedAt.slice(0, 10);
  return tournaments.filter((t) => {
    if (!t.startDate) return true;
    const startDay = new Date(t.startDate * 1000).toISOString().slice(0, 10);
    return startDay <= fetchDay;
  });
}
