/**
 * Load spent-pilot truth supplements layered on frozen independent truth v1.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { IndependentCommanderMechanismTruthCase } from "../../src/lib/deck-synthesis/independent-truth-types-v1";
import type { ImplementedMechanismCatalogEntry } from "./phase6a1-implemented-mechanism-catalog-v1";
import { IMPLEMENTED_MECHANISM_CATALOG_V1_VERSION } from "./phase6a1-implemented-mechanism-catalog-v1";
import {
  getMechanismTruthCase,
  INDEPENDENT_TRUTH_LOADER_V1_VERSION,
} from "./phase6a1-independent-truth-loader-v1";
import type { FrozenOpportunityCase } from "./phase6a1-frozen-semantic-opportunity-v322-loader-v1";
import { loadFrozenSemanticOpportunityModelV322 } from "./phase6a1-frozen-semantic-opportunity-v322-loader-v1";
import {
  MECHANISM_TRUTH_SUPPLEMENT_PATH,
  OPPORTUNITY_SUPPLEMENT_PATH,
  OPPORTUNITY_SUPPLEMENT_V2_PATH,
} from "./phase6a1-serialization-pilot-v8-config-v1";
import { MILESTONES } from "./phase6a1-pinned-implementation-container-v1";

export const YURIKO_PROSPECTIVE_MECHANISM_TRUTH_V1_PATH = resolve(
  MILESTONES,
  "phase6a1-professor-v3-yuriko-prospective-mechanism-truth-v1.json",
);

export const ZADA_PROSPECTIVE_MECHANISM_TRUTH_V1_PATH = resolve(
  MILESTONES,
  "phase6a1-professor-v3-zada-prospective-mechanism-truth-v1.json",
);

export const CHATTERFANG_PROSPECTIVE_MECHANISM_TRUTH_V1_PATH = resolve(
  MILESTONES,
  "phase6a1-professor-v3-chatterfang-prospective-mechanism-truth-v1.json",
);

export const SPENT_PILOT_TRUTH_LOADER_V1_VERSION = "phase6a1-spent-pilot-truth-loader-v1";

export type SpentPilotMechanismTruthSupplement = {
  version: string;
  cases: IndependentCommanderMechanismTruthCase[];
};

export type SpentPilotOpportunitySupplement = {
  version: string;
  cases: FrozenOpportunityCase[];
};

let mechanismSupplementSha: string | null = null;
let opportunitySupplementSha: string | null = null;
let opportunitySupplementV2Sha: string | null = null;
let mechanismSupplementCache: SpentPilotMechanismTruthSupplement | null = null;
let opportunitySupplementCache: SpentPilotOpportunitySupplement | null = null;
let opportunitySupplementV2Cache: SpentPilotOpportunitySupplement | null = null;

function loadJsonFile<T>(path: string): { raw: string; parsed: T; sha256: string } {
  const raw = readFileSync(path, "utf8");
  return {
    raw,
    parsed: JSON.parse(raw) as T,
    sha256: createHash("sha256").update(raw).digest("hex"),
  };
}

export function loadSpentPilotMechanismTruthSupplement(): SpentPilotMechanismTruthSupplement {
  if (!mechanismSupplementCache) {
    const loaded = loadJsonFile<SpentPilotMechanismTruthSupplement>(MECHANISM_TRUTH_SUPPLEMENT_PATH);
    mechanismSupplementCache = loaded.parsed;
    mechanismSupplementSha = loaded.sha256;
  }
  return mechanismSupplementCache;
}

export function loadSpentPilotOpportunitySupplement(): SpentPilotOpportunitySupplement {
  if (!opportunitySupplementCache) {
    const loaded = loadJsonFile<SpentPilotOpportunitySupplement>(OPPORTUNITY_SUPPLEMENT_PATH);
    opportunitySupplementCache = loaded.parsed;
    opportunitySupplementSha = loaded.sha256;
  }
  return opportunitySupplementCache;
}

export function getSpentPilotMechanismTruthSupplementSha256(): string {
  loadSpentPilotMechanismTruthSupplement();
  return mechanismSupplementSha!;
}

export function loadSpentPilotOpportunitySupplementV2(): SpentPilotOpportunitySupplement {
  if (!opportunitySupplementV2Cache) {
    const loaded = loadJsonFile<SpentPilotOpportunitySupplement>(OPPORTUNITY_SUPPLEMENT_V2_PATH);
    opportunitySupplementV2Cache = loaded.parsed;
    opportunitySupplementV2Sha = loaded.sha256;
  }
  return opportunitySupplementV2Cache;
}

export function getSpentPilotOpportunitySupplementV2Sha256(): string {
  loadSpentPilotOpportunitySupplementV2();
  return opportunitySupplementV2Sha!;
}

export function getSpentPilotOpportunitySupplementSha256(): string {
  try {
    return getSpentPilotOpportunitySupplementV2Sha256();
  } catch {
    loadSpentPilotOpportunitySupplement();
    return opportunitySupplementSha!;
  }
}

let yurikoProspectiveMechanismTruthCache: IndependentCommanderMechanismTruthCase | null = null;
let zadaProspectiveMechanismTruthCache: IndependentCommanderMechanismTruthCase | null = null;
let chatterfangProspectiveMechanismTruthCache: IndependentCommanderMechanismTruthCase | null = null;

function loadYurikoProspectiveMechanismTruthCase(): IndependentCommanderMechanismTruthCase {
  if (!yurikoProspectiveMechanismTruthCache) {
    const parsed = loadJsonFile<{ case: IndependentCommanderMechanismTruthCase }>(YURIKO_PROSPECTIVE_MECHANISM_TRUTH_V1_PATH);
    yurikoProspectiveMechanismTruthCache = parsed.parsed.case;
  }
  return yurikoProspectiveMechanismTruthCache;
}

function loadZadaProspectiveMechanismTruthCase(): IndependentCommanderMechanismTruthCase {
  if (!zadaProspectiveMechanismTruthCache) {
    const parsed = loadJsonFile<{ case: IndependentCommanderMechanismTruthCase }>(ZADA_PROSPECTIVE_MECHANISM_TRUTH_V1_PATH);
    zadaProspectiveMechanismTruthCache = parsed.parsed.case;
  }
  return zadaProspectiveMechanismTruthCache;
}

function loadChatterfangProspectiveMechanismTruthCase(): IndependentCommanderMechanismTruthCase {
  if (!chatterfangProspectiveMechanismTruthCache) {
    const parsed = loadJsonFile<{ case: IndependentCommanderMechanismTruthCase }>(CHATTERFANG_PROSPECTIVE_MECHANISM_TRUTH_V1_PATH);
    chatterfangProspectiveMechanismTruthCache = parsed.parsed.case;
  }
  return chatterfangProspectiveMechanismTruthCache;
}

export function getPilotMechanismTruthCase(caseId: string): IndependentCommanderMechanismTruthCase | undefined {
  if (caseId === "multi-yuriko") return loadYurikoProspectiveMechanismTruthCase();
  if (caseId === "multi-zada") return loadZadaProspectiveMechanismTruthCase();
  if (caseId === "multi-chatterfang") return loadChatterfangProspectiveMechanismTruthCase();
  const base = getMechanismTruthCase(caseId);
  if (base) return base;
  return loadSpentPilotMechanismTruthSupplement().cases.find((c) => c.caseId === caseId);
}

export function getPilotMechanismCatalogEntry(caseId: string): ImplementedMechanismCatalogEntry | undefined {
  const truthCase = getPilotMechanismTruthCase(caseId);
  if (!truthCase) return undefined;
  const fromSupplement = loadSpentPilotMechanismTruthSupplement().cases.some((c) => c.caseId === caseId);
  const fromYurikoProspective = caseId === "multi-yuriko";
  const fromZadaProspective = caseId === "multi-zada";
  const fromChatterfangProspective = caseId === "multi-chatterfang";
  return {
    ...truthCase,
    implementationSource: fromYurikoProspective
      ? "phase6a1-professor-v3-yuriko-prospective-mechanism-truth-v1"
      : fromZadaProspective
        ? "phase6a1-professor-v3-zada-prospective-mechanism-truth-v1"
        : fromChatterfangProspective
          ? "phase6a1-professor-v3-chatterfang-prospective-mechanism-truth-v1"
          : fromSupplement
            ? "phase6a1-spent-pilot-commander-mechanism-truth-supplement-v1"
            : "phase6a1-independent-commander-mechanism-truth-v1",
    implementationVersion: IMPLEMENTED_MECHANISM_CATALOG_V1_VERSION,
    loaderVersion: fromYurikoProspective
      ? "phase6a1-professor-v3-yuriko-prospective-mechanism-truth-v1"
      : fromZadaProspective
        ? "phase6a1-professor-v3-zada-prospective-mechanism-truth-v1"
        : fromChatterfangProspective
          ? "phase6a1-professor-v3-chatterfang-prospective-mechanism-truth-v1"
          : fromSupplement
            ? SPENT_PILOT_TRUTH_LOADER_V1_VERSION
            : INDEPENDENT_TRUTH_LOADER_V1_VERSION,
    adjudicationStatus: "FROZEN_DEV_TRUTH",
  };
}

export function getPilotOpportunityCase(caseId: string): FrozenOpportunityCase | undefined {
  const frozen = loadFrozenSemanticOpportunityModelV322().cases.find((c) => c.caseId === caseId);
  if (frozen) return frozen;
  try {
    const v2 = loadSpentPilotOpportunitySupplementV2().cases.find((c) => c.caseId === caseId);
    if (v2) return v2;
  } catch {
    // fall through to historical v1 supplement
  }
  return loadSpentPilotOpportunitySupplement().cases.find((c) => c.caseId === caseId);
}

export function assertPilotTruthSupplementsPresent(): void {
  loadSpentPilotMechanismTruthSupplement();
  loadSpentPilotOpportunitySupplementV2();
}
