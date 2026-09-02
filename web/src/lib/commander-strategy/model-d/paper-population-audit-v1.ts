import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { DeckFeatureBundle } from "../model-c/deck-features-v1";
import {
  PAPER_POPULATION_COUNT,
  PAPER_POPULATION_HASH,
  SEMANTIC_INDEX_VERSION,
} from "../semantic-universe-v1";

const SHADOW_MANIFEST_PATH = resolve(
  process.cwd(),
  "data/milestones/catalog-shadow/catalog-shadow-parse-rc8-firestore-v2-manifest.json",
);

export const RC8_SEMANTIC_SUPERSET_CARD_COUNT = (() => {
  if (!existsSync(SHADOW_MANIFEST_PATH)) return 35932;
  const raw = JSON.parse(readFileSync(SHADOW_MANIFEST_PATH, "utf8")) as { eligibleOracleIds?: number };
  return raw.eligibleOracleIds ?? 35932;
})();

export type PaperPopulationProvenanceAudit = {
  pass: boolean;
  semanticSource: {
    artifact: string;
    description: string;
    eligibleOracleIds: number;
    parserBlobClosure: string;
  };
  operationalModelPopulation: {
    frame: string;
    paperEligibleIdentities: number;
    populationHash: string;
  };
  digitalOnlyOracleIdsInDeckFeatures: number;
  digitalOnlyMainboardCardQuantity: number;
  decksWithDigitalOnlyInFeatures: number;
  note: string;
};

export function auditPaperPopulationInDeckBundles(
  bundles: Iterable<DeckFeatureBundle>,
  parserBlobClosure: string,
): PaperPopulationProvenanceAudit {
  let digitalOnlyOracleIdsInDeckFeatures = 0;
  let digitalOnlyMainboardCardQuantity = 0;
  let decksWithDigitalOnlyInFeatures = 0;

  for (const bundle of bundles) {
    const n = bundle.census.digitalOnlyOracleIdsInFeatures;
    if (n > 0) {
      decksWithDigitalOnlyInFeatures += 1;
      digitalOnlyOracleIdsInDeckFeatures += n;
    }
    for (const row of bundle.cards) {
      if (row.card.paperPopulationFrame === "DIGITAL_ONLY") {
        digitalOnlyMainboardCardQuantity += row.quantity;
      }
    }
  }

  const pass = digitalOnlyOracleIdsInDeckFeatures === 0 && digitalOnlyMainboardCardQuantity === 0;

  return {
    pass,
    semanticSource: {
      artifact: SEMANTIC_INDEX_VERSION,
      description:
        "catalog-shadow-parse-rc8-firestore-v2 — frozen RC8 semantic superset used as lookup index only (not the operational tournament population).",
      eligibleOracleIds: RC8_SEMANTIC_SUPERSET_CARD_COUNT,
      parserBlobClosure,
    },
    operationalModelPopulation: {
      frame: "paper population v3",
      paperEligibleIdentities: PAPER_POPULATION_COUNT,
      populationHash: PAPER_POPULATION_HASH,
    },
    digitalOnlyOracleIdsInDeckFeatures,
    digitalOnlyMainboardCardQuantity,
    decksWithDigitalOnlyInFeatures,
    note:
      "Deck features are built from paper-eligible mainboard cards only. RC8 shadow index is a superset lookup; digital-only identities must not enter feature values.",
  };
}
