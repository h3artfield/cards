#!/usr/bin/env npx tsx
/**
 * Re-normalize June/July/August study import runs from immutable raw artifacts.
 * Preserves v1/v2 normalized files; writes v3 alongside with manifest + dataset hash.
 */
import { createHash } from "node:crypto";
import { createReadStream, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createGunzip } from "node:zlib";
import readline from "node:readline";
import { loadProjectEnvLocal } from "./lib/script-env";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { normalizeTournament } from "../src/lib/commander-strategy/topdeck/normalize";
import { loadHistoricalImportManifest } from "../src/lib/commander-strategy/topdeck/historical-manifest";
import { topdeckRawRunDir, TOPDECK_DATA_DIR } from "../src/lib/commander-strategy/topdeck/artifact-paths";
import { COMMANDER_CONFIGURATION_SCHEMA_VERSION } from "../src/lib/commander-strategy/commander-configuration-v1";
import type { TopdeckTournament } from "../src/lib/commander-strategy/topdeck/types";
import type {
  NormalizedDeckInstance,
  TopdeckImportRun,
  TopdeckNormalizationManifest,
  TopdeckPodGame,
} from "../src/lib/commander-strategy/types";
import { twelveMonthWindowKeys } from "../src/lib/commander-strategy/topdeck/historical-window-v1";
import {
  DECK_RESOLVER_VERSION,
  TOPDECK_NORMALIZATION_VERSION,
} from "../src/lib/commander-strategy/types";

loadProjectEnvLocal();

function parseMonthArgs(): string[] {
  const idx = process.argv.indexOf("--months");
  if (idx >= 0 && process.argv[idx + 1]) {
    return process.argv[idx + 1]!.split(",").map((m) => m.trim()).filter(Boolean);
  }
  return twelveMonthWindowKeys();
}

const NORMALIZATION_SUFFIX = "v3";

async function loadRawTournaments(runDir: string): Promise<TopdeckTournament[]> {
  const rawPath = `${runDir}/raw-tournaments.jsonl.gz`;
  if (!existsSync(rawPath)) throw new Error(`Missing raw artifact: ${rawPath}`);
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

async function renormalizeRun(input: {
  monthKey: string;
  runId: string;
  catalog: Awaited<ReturnType<typeof loadDeckResolutionCatalog>>;
}): Promise<TopdeckNormalizationManifest> {
  const runDir = topdeckRawRunDir(input.runId);
  const importRun = JSON.parse(
    readFileSync(`${runDir}/run-manifest.json`, "utf8"),
  ) as TopdeckImportRun;
  const tournaments = await loadRawTournaments(runDir);

  const deckMap = new Map<string, NormalizedDeckInstance>();
  const podMap = new Map<string, TopdeckPodGame>();

  for (const tournament of tournaments) {
    try {
      const normalized = normalizeTournament({ tournament, catalog: input.catalog });
      for (const deck of normalized.deckInstances) deckMap.set(deck.deckInstanceId, deck);
      for (const pod of normalized.podGames) podMap.set(pod.podId, pod);
    } catch (err) {
      throw new Error(
        `Normalize failed for ${tournament.TID ?? "unknown"}: ${err instanceof Error ? err.stack ?? err.message : err}`,
      );
    }
  }

  const decks = [...deckMap.values()];
  const pods = [...podMap.values()];
  const payload = JSON.stringify({ decks, pods });
  const normalizedDatasetHash = createHash("sha256").update(payload).digest("hex");

  const supersedes = existsSync(`${runDir}/normalized-decks-v2.json`)
    ? ("normalized-decks-v2.json" as const)
    : existsSync(`${runDir}/normalized-decks.json`)
      ? ("normalized-decks.json" as const)
      : null;

  const manifest: TopdeckNormalizationManifest = {
    normalizationVersion: TOPDECK_NORMALIZATION_VERSION,
    resolverVersion: DECK_RESOLVER_VERSION,
    commanderConfigurationSchemaVersion: COMMANDER_CONFIGURATION_SCHEMA_VERSION,
    paperPopulationHash: input.catalog.catalogUniverse.paperPopulationHash,
    sourceRunId: input.runId,
    sourceRawDigest: importRun.rawDigest,
    generatedAt: new Date().toISOString(),
    normalizedDatasetHash,
    supersedes,
    tournamentCount: tournaments.length,
    podCount: pods.length,
    deckCount: decks.length,
  };

  writeFileSync(`${runDir}/normalized-decks-${NORMALIZATION_SUFFIX}.json`, JSON.stringify(decks));
  writeFileSync(`${runDir}/normalized-pods-${NORMALIZATION_SUFFIX}.json`, JSON.stringify(pods));
  writeFileSync(
    `${runDir}/normalization-manifest-${NORMALIZATION_SUFFIX}.json`,
    JSON.stringify(manifest, null, 2),
  );

  console.log(
    `${input.monthKey} (${input.runId}): decks=${decks.length} pods=${pods.length} hash=${normalizedDatasetHash.slice(0, 12)}…`,
  );

  return manifest;
}

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const historical = loadHistoricalImportManifest();
  const months = parseMonthArgs();
  const manifests: TopdeckNormalizationManifest[] = [];

  for (const monthKey of months) {
    const record = historical.months[monthKey];
    if (!record?.runId) throw new Error(`Missing run for ${monthKey}`);
    manifests.push(
      await renormalizeRun({ monthKey, runId: record.runId, catalog }),
    );
  }

  const combinedHash = createHash("sha256")
    .update(JSON.stringify(manifests.map((m) => m.normalizedDatasetHash)))
    .digest("hex");

  writeFileSync(
    `${TOPDECK_DATA_DIR}/topdeck-normalization-v3-combined-manifest.json`,
    JSON.stringify(
      {
        normalizationVersion: TOPDECK_NORMALIZATION_VERSION,
        resolverVersion: DECK_RESOLVER_VERSION,
        generatedAt: new Date().toISOString(),
        sourceRunIds: manifests.map((m) => m.sourceRunId),
        sourceRawHashes: manifests.map((m) => m.sourceRawDigest),
        normalizedDatasetHashes: manifests.map((m) => m.normalizedDatasetHash),
        combinedNormalizedDatasetHash: combinedHash,
        months,
      },
      null,
      2,
    ),
  );

  console.log(`Combined normalized dataset hash: ${combinedHash}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
