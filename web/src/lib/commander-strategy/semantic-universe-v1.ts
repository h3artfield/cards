/**
 * Pinned semantic universe identifiers for Commander Strategy derived layers.
 * RC8 parser is frozen — these values come from milestone artifacts, not live inference.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { CATALOG_COVERAGE_POPULATION_HASH } from "@/lib/catalog-coverage/adjudication-config";

export const RC8_PARSER_VERSION = "oracle-action-v1.44-rc8-ownership-grant-family";
export const RC8_PARSER_BLOB_CLOSURE = "d3af8eca52a6bce6582d7f8a62e8aa2a89b4baefa9f36bff036adc9b2a6ce560";
export const PAPER_POPULATION_HASH = CATALOG_COVERAGE_POPULATION_HASH;
export const PAPER_POPULATION_COUNT = 34862;
export const SEMANTIC_INDEX_VERSION = "catalog-shadow-parse-rc8-firestore-v2";
export const TOPDECK_SOURCE_POPULATION = "topdeck_edh_tournaments";

const SHADOW_MANIFEST_PATH = resolve(
  process.cwd(),
  "data/milestones/catalog-shadow/catalog-shadow-parse-rc8-firestore-v2-manifest.json",
);

export type SemanticUniverseManifest = {
  parserVersion: string;
  parserBlobClosure: string;
  semanticIndexVersion: string;
  paperPopulationHash: string;
  paperPopulationCount: number;
  shadowManifestPath: string;
};

export function loadSemanticUniverseManifest(): SemanticUniverseManifest {
  if (existsSync(SHADOW_MANIFEST_PATH)) {
    const raw = JSON.parse(readFileSync(SHADOW_MANIFEST_PATH, "utf8")) as {
      parserVersion?: string;
      parserBlobClosure?: string;
      version?: string;
    };
    return {
      parserVersion: raw.parserVersion ?? RC8_PARSER_VERSION,
      parserBlobClosure: raw.parserBlobClosure ?? RC8_PARSER_BLOB_CLOSURE,
      semanticIndexVersion: raw.version ?? SEMANTIC_INDEX_VERSION,
      paperPopulationHash: PAPER_POPULATION_HASH,
      paperPopulationCount: PAPER_POPULATION_COUNT,
      shadowManifestPath: SHADOW_MANIFEST_PATH,
    };
  }
  return {
    parserVersion: RC8_PARSER_VERSION,
    parserBlobClosure: RC8_PARSER_BLOB_CLOSURE,
    semanticIndexVersion: SEMANTIC_INDEX_VERSION,
    paperPopulationHash: PAPER_POPULATION_HASH,
    paperPopulationCount: PAPER_POPULATION_COUNT,
    shadowManifestPath: SHADOW_MANIFEST_PATH,
  };
}

export type DeckProfileProvenance = {
  parserVersion: string;
  parserBlobClosure: string;
  semanticIndexVersion: string;
  paperPopulationHash: string;
  strategyTaxonomyVersion: string;
  deckProfileVersion: string;
  generatedAt: string;
  status: "PROVISIONAL_DERIVED_PROFILE";
};

export function buildDeckProfileProvenance(input: {
  strategyTaxonomyVersion: string;
  deckProfileVersion: string;
  generatedAt?: string;
}): DeckProfileProvenance {
  const manifest = loadSemanticUniverseManifest();
  return {
    parserVersion: manifest.parserVersion,
    parserBlobClosure: manifest.parserBlobClosure,
    semanticIndexVersion: manifest.semanticIndexVersion,
    paperPopulationHash: manifest.paperPopulationHash,
    strategyTaxonomyVersion: input.strategyTaxonomyVersion,
    deckProfileVersion: input.deckProfileVersion,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    status: "PROVISIONAL_DERIVED_PROFILE",
  };
}
