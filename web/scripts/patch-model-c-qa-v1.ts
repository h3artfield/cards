#!/usr/bin/env npx tsx
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
loadProjectEnvLocal();
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { loadCombinedCorpus } from "../src/lib/commander-strategy/combined-corpus-v1";
import {
  buildTrainDeckHashSet,
  filterPrimaryPodSize,
  loadSplitObservations,
} from "../src/lib/commander-strategy/model-a/dataset-v1";
import { loadShadowSemanticIndex } from "../src/lib/commander-strategy/shadow-semantic-index";
import { buildDeckFeatureBundle } from "../src/lib/commander-strategy/model-c/deck-features-v1";
import { classifySemanticBucket } from "../src/lib/commander-strategy/model-c/deck-mainboard-v1";
import { loadTrainingSnapshotManifest, modelArtifactDir } from "../src/lib/commander-strategy/training-snapshot-v1";
import type { NormalizedDeckInstance } from "../src/lib/commander-strategy/types";

const qaPath = resolve(
  modelArtifactDir("commander-model-c-features-v1"),
  "commander-model-c-feature-generation-qa-v1.json",
);

async function main() {
  const qa = JSON.parse(readFileSync(qaPath, "utf8"));
  const manifest = loadTrainingSnapshotManifest();
  const corpus = await loadCombinedCorpus(manifest.topdeckSourceRuns.map((r) => r.month), {
    includeRawTournaments: false,
  });
  const catalog = await loadDeckResolutionCatalog();
  const shadow = await loadShadowSemanticIndex();
  const deckByHash = new Map<string, NormalizedDeckInstance>();
  for (const deck of corpus.combined.decks) {
    if (!deck.deckHash || deck.deckHash.startsWith("unresolved:")) continue;
    if (!deckByHash.has(deck.deckHash)) deckByHash.set(deck.deckHash, deck);
  }

  for (const split of ["train", "validation", "test"] as const) {
    const obs = filterPrimaryPodSize(
      loadSplitObservations({ manifest, corpus, split }),
    );
    const globalBucket = new Map<string, string>();
    for (const o of obs) {
      for (const s of o.seats) {
        const deck = deckByHash.get(s.deckHash);
        if (!deck) continue;
        const bundle = buildDeckFeatureBundle({ deck, catalog, shadowIndex: shadow });
        for (const row of bundle.cards) {
          if (globalBucket.has(row.oracleId)) continue;
          globalBucket.set(
            row.oracleId,
            classifySemanticBucket({ card: row.card, shadowIndex: shadow }),
          );
        }
      }
    }
    const bucketsByUniqueOracleId = {
      usable: 0,
      needs_review: 0,
      structurally_invalid: 0,
      absent: 0,
      unresolved: 0,
    };
    for (const bucket of globalBucket.values()) {
      bucketsByUniqueOracleId[bucket as keyof typeof bucketsByUniqueOracleId] += 1;
    }
    const uniq = globalBucket.size;
    qa.section2_fullDeckRepresentation[split].uniqueMainboardOracleIds = uniq;
    delete qa.section2_fullDeckRepresentation[split].eligibleMainboardUniqueOracleIds;
    qa.section2_fullDeckRepresentation[split].bucketsByUniqueOracleId = bucketsByUniqueOracleId;
    qa.section2_fullDeckRepresentation[split].semanticCoverageByUniqueOracleId =
      uniq > 0
        ? (bucketsByUniqueOracleId.usable + bucketsByUniqueOracleId.needs_review) / uniq
        : 0;
  }

  const trainObs = filterPrimaryPodSize(loadSplitObservations({ manifest, corpus, split: "train" }));
  const testObs = filterPrimaryPodSize(loadSplitObservations({ manifest, corpus, split: "test" }));
  const trainDeckHashes = buildTrainDeckHashSet(trainObs);
  qa.section6_cardNoveltyCensus.unseenDeckHashPods = testObs.filter((obs) =>
    obs.seats.some(
      (s) => !s.deckHash.startsWith("unresolved:") && !trainDeckHashes.has(s.deckHash),
    ),
  ).length;

  qa.generatedAt = new Date().toISOString();
  writeFileSync(qaPath, JSON.stringify(qa, null, 2));
  console.log(
    JSON.stringify(
      {
        trainUniqueOracleIds: qa.section2_fullDeckRepresentation.train.uniqueMainboardOracleIds,
        unseenDeckHashPods: qa.section6_cardNoveltyCensus.unseenDeckHashPods,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
