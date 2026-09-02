/**
 * Benchmark commander name resolution — strict preflight (Phase 5.3).
 *
 * Policy:
 * - Exact canonical match preferred
 * - Curated typo corrections allowed (provenance recorded)
 * - Official supplement aliases allowed (provenance recorded)
 * - DFC/partner face resolution allowed when unambiguous
 * - fuzzy_confirmed / stale_historical_name / prefix match = HARD FAIL unless curated correction
 * - Ambiguity (multiple candidates) = HARD FAIL
 */
import { normalizeOracleName } from "@/lib/deck-builder/golden-catalog/normalize-name";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import {
  buildCatalogResolverIndexes,
  resolveCatalogSeed,
  type CatalogResolutionResult,
  type SeedNameClassification,
} from "../../../scripts/lib/catalog-resolver";
import { lookupGoldenByName } from "../../../scripts/lib/load-golden-catalog-index";
import type { GoldenCatalogOracleCard } from "@/lib/deck-builder/golden-catalog/schemas";

export type BenchmarkResolutionRootCause =
  | "BENCHMARK_TYPO"
  | "NAME_NORMALIZATION"
  | "ALIAS_REQUIRED"
  | "DFC_NAME_VARIANT"
  | "PARTNER_CONFIGURATION"
  | "CATALOG_ACTUALLY_MISSING"
  | "AMBIGUOUS_RESOLUTION"
  | "FUZZY_SUBSTITUTION_REJECTED"
  | "OTHER";

export type BenchmarkResolutionMethod =
  | "exact_canonical"
  | "curated_typo_correction"
  | "official_supplement_alias"
  | "dfc_face_unambiguous"
  | "rejected";

export type BenchmarkCommanderResolutionAudit = {
  benchmarkInputName: string;
  normalizedInput: string;
  exactCanonicalMatchAttempted: string | null;
  exactCanonicalOracleId: string | null;
  aliasesAttempted: string[];
  resolverMatchedBy: SeedNameClassification | null;
  resolutionMethod: BenchmarkResolutionMethod;
  candidateCanonicalNames: string[];
  canonicalName: string | null;
  oracleId: string | null;
  rootCause: BenchmarkResolutionRootCause;
  rootCauseDetail: string;
  resolved: boolean;
  ambiguityHardFail: boolean;
};

/** Curated benchmark spelling corrections — same commander identity, not membership swap. */
export const BENCHMARK_COMMANDER_NAME_CORRECTIONS_V1: Record<string, string> = {
  "Ghave, Guru of Spore": "Ghave, Guru of Spores",
};

const ALLOWED_DFC_METHODS: SeedNameClassification[] = [
  "exact_face_name",
  "partial_multiface_name",
  "adventure_spell_name",
  "adventure_creature_name",
  "reversed_split_name",
  "wrong_companion_face",
];

const REJECTED_FUZZY_METHODS: SeedNameClassification[] = ["fuzzy_confirmed", "stale_historical_name"];

function candidateNames(catalog: DeckResolutionCatalog, normalizedInput: string): string[] {
  const out: string[] = [];
  for (const card of catalog.byOracleId.values()) {
    const cn = normalizeOracleName(card.canonicalName);
    const prefix = normalizedInput.slice(0, Math.min(12, normalizedInput.length));
    if (prefix.length >= 4 && (cn.includes(prefix) || normalizedInput.includes(cn.slice(0, 12)))) {
      out.push(card.canonicalName);
    }
  }
  return [...new Set(out)].slice(0, 12);
}

function isAmbiguousExactLookup(catalog: DeckResolutionCatalog, name: string): boolean {
  const matches = catalog.byNormalizedName.get(normalizeOracleName(name)) ?? [];
  if (matches.length <= 1) return false;
  const exactMatches = matches.filter(
    (c) => c.canonicalName === name || c.canonicalName.startsWith(`${name} //`),
  );
  if (exactMatches.length === 1) return false;
  if (exactMatches.length > 1) {
    return new Set(exactMatches.map((c) => c.oracleId)).size > 1;
  }
  return new Set(matches.map((c) => c.oracleId)).size > 1;
}

function resolveUnambiguousExact(
  catalog: DeckResolutionCatalog,
  name: string,
): GoldenCatalogOracleCard | null {
  const matches = catalog.byNormalizedName.get(normalizeOracleName(name));
  if (!matches?.length) return null;
  const exactMatches = matches.filter(
    (c) => c.canonicalName === name || c.canonicalName.startsWith(`${name} //`),
  );
  if (exactMatches.length === 1) return exactMatches[0]!;
  if (exactMatches.length > 1) {
    const unique = [...new Set(exactMatches.map((c) => c.oracleId))];
    return unique.length === 1 ? exactMatches[0]! : null;
  }
  if (matches.length === 1) return matches[0]!;
  return null;
}

function resolveStrict(
  catalog: DeckResolutionCatalog,
  benchmarkInputName: string,
): BenchmarkCommanderResolutionAudit {
  const normalizedInput = normalizeOracleName(benchmarkInputName);
  const correctedInput = BENCHMARK_COMMANDER_NAME_CORRECTIONS_V1[benchmarkInputName] ?? benchmarkInputName;
  const indexes = buildCatalogResolverIndexes(catalog);
  const aliasesAttempted: string[] = [];

  const aliasRow = catalog.officialAliasByNormalizedName.get(normalizeOracleName(benchmarkInputName));
  if (aliasRow) aliasesAttempted.push(aliasRow.canonicalOracleName);

  const exactEarly =
    resolveUnambiguousExact(catalog, correctedInput) ?? lookupGoldenByName(catalog, correctedInput);
  if (exactEarly) {
    const isTypo = correctedInput !== benchmarkInputName;
    return {
      benchmarkInputName,
      normalizedInput,
      exactCanonicalMatchAttempted: exactEarly.canonicalName,
      exactCanonicalOracleId: exactEarly.oracleId,
      aliasesAttempted,
      resolverMatchedBy: "exact_canonical",
      resolutionMethod: isTypo ? "curated_typo_correction" : "exact_canonical",
      candidateCanonicalNames: [],
      canonicalName: exactEarly.canonicalName,
      oracleId: exactEarly.oracleId,
      rootCause: isTypo ? "BENCHMARK_TYPO" : "NAME_NORMALIZATION",
      rootCauseDetail: isTypo
        ? `Curated correction: "${benchmarkInputName}" → "${correctedInput}"`
        : "Exact canonical match.",
      resolved: true,
      ambiguityHardFail: false,
    };
  }

  if (isAmbiguousExactLookup(catalog, correctedInput)) {
    const dfcResolution =
      resolveCatalogSeed(catalog, indexes, { name: correctedInput }) ??
      resolveCatalogSeed(catalog, indexes, { name: benchmarkInputName });
    if (dfcResolution && ALLOWED_DFC_METHODS.includes(dfcResolution.matchedBy) && dfcResolution.oracleId) {
      return {
        benchmarkInputName,
        normalizedInput,
        exactCanonicalMatchAttempted: correctedInput,
        exactCanonicalOracleId: null,
        aliasesAttempted,
        resolverMatchedBy: dfcResolution.matchedBy,
        resolutionMethod: "dfc_face_unambiguous",
        candidateCanonicalNames: [],
        canonicalName: dfcResolution.canonicalName,
        oracleId: dfcResolution.oracleId,
        rootCause: dfcResolution.matchedBy === "wrong_companion_face" ? "PARTNER_CONFIGURATION" : "DFC_NAME_VARIANT",
        rootCauseDetail: `MDFC/DFC face resolution for ambiguous exact-name index: ${dfcResolution.matchedBy}`,
        resolved: true,
        ambiguityHardFail: false,
      };
    }
    return {
      benchmarkInputName,
      normalizedInput,
      exactCanonicalMatchAttempted: correctedInput,
      exactCanonicalOracleId: null,
      aliasesAttempted,
      resolverMatchedBy: null,
      resolutionMethod: "rejected",
      candidateCanonicalNames: candidateNames(catalog, normalizedInput),
      canonicalName: null,
      oracleId: null,
      rootCause: "AMBIGUOUS_RESOLUTION",
      rootCauseDetail: "Multiple distinct oracle identities for exact name.",
      resolved: false,
      ambiguityHardFail: true,
    };
  }

  if (aliasRow?.oracleId) {
    const aliasCard = catalog.byOracleId.get(aliasRow.oracleId);
    if (aliasCard) {
      return {
        benchmarkInputName,
        normalizedInput,
        exactCanonicalMatchAttempted: null,
        exactCanonicalOracleId: null,
        aliasesAttempted,
        resolverMatchedBy: "alias_lookup",
        resolutionMethod: "official_supplement_alias",
        candidateCanonicalNames: [],
        canonicalName: aliasCard.canonicalName,
        oracleId: aliasCard.oracleId,
        rootCause: "ALIAS_REQUIRED",
        rootCauseDetail: `Official supplement alias → ${aliasCard.canonicalName}`,
        resolved: true,
        ambiguityHardFail: false,
      };
    }
  }

  const resolution =
    resolveCatalogSeed(catalog, indexes, { name: correctedInput }) ??
    resolveCatalogSeed(catalog, indexes, { name: benchmarkInputName });

  if (resolution && REJECTED_FUZZY_METHODS.includes(resolution.matchedBy)) {
    return {
      benchmarkInputName,
      normalizedInput,
      exactCanonicalMatchAttempted: null,
      exactCanonicalOracleId: null,
      aliasesAttempted,
      resolverMatchedBy: resolution.matchedBy,
      resolutionMethod: "rejected",
      candidateCanonicalNames: candidateNames(catalog, normalizedInput),
      canonicalName: resolution.canonicalName,
      oracleId: null,
      rootCause: "FUZZY_SUBSTITUTION_REJECTED",
      rootCauseDetail: `Rejected ${resolution.matchedBy} — add curated correction or fix benchmark name.`,
      resolved: false,
      ambiguityHardFail: true,
    };
  }

  if (resolution && ALLOWED_DFC_METHODS.includes(resolution.matchedBy)) {
    return {
      benchmarkInputName,
      normalizedInput,
      exactCanonicalMatchAttempted: null,
      exactCanonicalOracleId: null,
      aliasesAttempted,
      resolverMatchedBy: resolution.matchedBy,
      resolutionMethod: "dfc_face_unambiguous",
      candidateCanonicalNames: [],
      canonicalName: resolution.canonicalName,
      oracleId: resolution.oracleId,
      rootCause: resolution.matchedBy === "wrong_companion_face" ? "PARTNER_CONFIGURATION" : "DFC_NAME_VARIANT",
      rootCauseDetail: resolution.matchedBy,
      resolved: true,
      ambiguityHardFail: false,
    };
  }

  return {
    benchmarkInputName,
    normalizedInput,
    exactCanonicalMatchAttempted: null,
    exactCanonicalOracleId: null,
    aliasesAttempted,
    resolverMatchedBy: resolution?.matchedBy ?? null,
    resolutionMethod: "rejected",
    candidateCanonicalNames: candidateNames(catalog, normalizedInput),
    canonicalName: resolution?.canonicalName ?? null,
    oracleId: resolution?.oracleId ?? null,
    rootCause: "CATALOG_ACTUALLY_MISSING",
    rootCauseDetail: "No strict-resolution match.",
    resolved: Boolean(resolution?.oracleId),
    ambiguityHardFail: !resolution?.oracleId,
  };
}

export function resolveBenchmarkCommanderName(
  catalog: DeckResolutionCatalog,
  benchmarkInputName: string,
): BenchmarkCommanderResolutionAudit {
  return resolveStrict(catalog, benchmarkInputName);
}

export function resolveBenchmarkCommanderOracleIds(
  catalog: DeckResolutionCatalog,
  commanderNames: string[],
): { oracleIds: string[]; audits: BenchmarkCommanderResolutionAudit[]; resolved: boolean } {
  const audits = commanderNames.map((name) => resolveBenchmarkCommanderName(catalog, name));
  const oracleIds = audits.map((a) => a.oracleId).filter((id): id is string => Boolean(id));
  return {
    oracleIds,
    audits,
    resolved: oracleIds.length === commanderNames.length && audits.every((a) => a.resolved && !a.ambiguityHardFail),
  };
}

export type BenchmarkResolutionPreflightResult = {
  pass: boolean;
  totalCommanderNames: number;
  resolvedCount: number;
  unresolved: BenchmarkCommanderResolutionAudit[];
  ambiguousHardFails: BenchmarkCommanderResolutionAudit[];
};

export function benchmarkCommanderResolutionPreflight(input: {
  catalog: DeckResolutionCatalog;
  commanderNames: string[];
}): BenchmarkResolutionPreflightResult {
  const audits = input.commanderNames.map((name) => resolveBenchmarkCommanderName(input.catalog, name));
  const unresolved = audits.filter((a) => !a.resolved);
  const ambiguousHardFails = audits.filter((a) => a.ambiguityHardFail);
  return {
    pass: unresolved.length === 0 && ambiguousHardFails.length === 0,
    totalCommanderNames: input.commanderNames.length,
    resolvedCount: audits.filter((a) => a.resolved).length,
    unresolved,
    ambiguousHardFails,
  };
}

/** Benchmark accounting — 40 cases may include multi-command-zone entries. */
export function benchmarkCaseAccounting(cases: Array<{ id: string; commanders: string[] }>): {
  caseCount: number;
  commanderNameCount: number;
  partnerCases: Array<{ caseId: string; commanders: string[] }>;
} {
  const partnerCases = cases.filter((c) => c.commanders.length > 1);
  return {
    caseCount: cases.length,
    commanderNameCount: cases.reduce((n, c) => n + c.commanders.length, 0),
    partnerCases: partnerCases.map((c) => ({ caseId: c.id, commanders: c.commanders })),
  };
}
