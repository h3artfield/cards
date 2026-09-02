import taxonomyJson from "./strategy-taxonomy-v1.json";
import type { StrategyTaxonomyEntry } from "../types";
import { STRATEGY_TAXONOMY_VERSION } from "../types";

type TaxonomyFile = {
  taxonomyVersion: string;
  source: string;
  sourceDate: string;
  entries: Array<Omit<StrategyTaxonomyEntry, "source" | "sourceDate" | "taxonomyVersion">>;
};

const file = taxonomyJson as TaxonomyFile;

export function loadStrategyTaxonomy(): StrategyTaxonomyEntry[] {
  return file.entries.map((entry) => ({
    ...entry,
    source: file.source,
    sourceDate: file.sourceDate,
    taxonomyVersion: STRATEGY_TAXONOMY_VERSION,
  }));
}

export function strategyTaxonomyById(): Map<string, StrategyTaxonomyEntry> {
  return new Map(loadStrategyTaxonomy().map((e) => [e.strategyId, e]));
}

export function archetypeEntries(): StrategyTaxonomyEntry[] {
  return loadStrategyTaxonomy().filter((e) => e.kind === "archetype");
}

export function themeEntries(): StrategyTaxonomyEntry[] {
  return loadStrategyTaxonomy().filter((e) => e.kind === "theme");
}
