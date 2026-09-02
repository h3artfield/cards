import { normalizeOracleName } from "@/lib/deck-builder/golden-catalog/normalize-name";
import type { GoldenCatalogOracleCard } from "@/lib/deck-builder/golden-catalog/schemas";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import {
  isCompetitiveDeckOracle,
  paperMetaForOracle,
} from "../../../scripts/lib/load-deck-resolution-catalog";
import { normalizeDeckObjCardKey } from "./deck-obj-key-normalization-v1";

export type DeckCardResolutionMethod =
  | "official_alias"
  | "unique"
  | "exact_canonical"
  | "face_name"
  | "paper_preferred"
  | "playable_layout_preferred"
  | "competitive_filter"
  | "commander_legal_disambiguation";

export type DisambiguationStep =
  | "exact_canonical_singleton"
  | "front_face_singleton"
  | "non_playable_layout_filter"
  | "competitive_filter"
  | "paper_eligible_filter"
  | "normal_layout_filter"
  | "commander_legal_filter"
  | "single_remaining";

export type ResolutionAuditTrail = {
  sourceName: string;
  normalizedLookupName: string;
  keyNormalizationApplied: string[];
  initialCandidateCount: number;
  candidateCountAfterCompetitiveGate: number;
  ambiguousBeforeFiltering: boolean;
  disambiguationStep?: DisambiguationStep;
  matchKind?: DeckCardResolutionMethod;
  finalCandidateCount: number;
  status: "resolved" | "ambiguous" | "not_found";
  chosenOracleId?: string;
  commanderLegalStepApplied: boolean;
  commanderLegalChangedChoice: boolean;
};

export type CatalogLookupResult =
  | {
      status: "resolved";
      card: GoldenCatalogOracleCard;
      matchKind: DeckCardResolutionMethod;
      normalizedLookupName: string;
      aliasEvidence?: {
        aliasKind: "printing_name" | "flavor_name" | "printed_name";
        evidenceSetCode: string;
        evidenceSetName?: string;
      };
    }
  | {
      status: "ambiguous";
      candidates: GoldenCatalogOracleCard[];
      normalizedName: string;
      normalizedLookupName: string;
      exclusionEvidence?: string[];
    }
  | { status: "not_found"; normalizedName: string; normalizedLookupName: string };

const NON_PLAYABLE_DECK_LAYOUTS = new Set([
  "token",
  "art_series",
  "double_faced_token",
  "emblem",
  "vanguard",
  "planar",
  "scheme",
]);

function canonicalNameKeys(name: string): string[] {
  const keys = new Set<string>();
  keys.add(normalizeOracleName(name));
  const front = name.split("//")[0]?.trim();
  if (front && front !== name) keys.add(normalizeOracleName(front));
  return [...keys];
}

function indexNameKeys(card: GoldenCatalogOracleCard): string[] {
  const keys = new Set<string>();
  keys.add(normalizeOracleName(card.canonicalName));
  const front = card.canonicalName.split("//")[0]?.trim();
  if (front) keys.add(normalizeOracleName(front));
  const back = card.canonicalName.split("//")[1]?.trim();
  if (back && back !== front) keys.add(normalizeOracleName(back));
  return [...keys];
}

/** Register alternate normalized lookup keys for double-faced / multi-face oracle records. */
export function registerCatalogNameAliases(
  card: GoldenCatalogOracleCard,
  byNormalizedName: Map<string, GoldenCatalogOracleCard[]>,
): void {
  for (const key of indexNameKeys(card)) {
    const bucket = byNormalizedName.get(key) ?? [];
    if (!bucket.some((c) => c.oracleId === card.oracleId)) bucket.push(card);
    byNormalizedName.set(key, bucket);
  }
}

function resolveOfficialAlias(
  key: string,
  catalog: DeckResolutionCatalog,
): CatalogLookupResult | null {
  const alias = catalog.officialAliasByNormalizedName.get(key);
  if (!alias) return null;
  const card = catalog.byOracleId.get(alias.oracleId);
  if (!card) return null;
  if (!isCompetitiveDeckOracle(catalog, card.oracleId)) return null;

  return {
    status: "resolved",
    card,
    matchKind: "official_alias",
    normalizedLookupName: alias.aliasDisplayName,
    aliasEvidence: {
      aliasKind: alias.aliasKind,
      evidenceSetCode: alias.evidenceSetCode,
      evidenceSetName: alias.evidenceSetName,
    },
  };
}

function filterCompetitiveCandidates(
  candidates: GoldenCatalogOracleCard[],
  catalog: DeckResolutionCatalog,
): GoldenCatalogOracleCard[] {
  if (catalog.competitiveDeckOracleIds.size === 0) return candidates;
  return candidates.filter((c) => isCompetitiveDeckOracle(catalog, c.oracleId));
}

function preferPaperEligible(
  candidates: GoldenCatalogOracleCard[],
  catalog: DeckResolutionCatalog,
): GoldenCatalogOracleCard | null {
  const paper = candidates.filter((c) => paperMetaForOracle(catalog, c.oracleId).paperEligible);
  if (paper.length === 1) return paper[0];
  return null;
}

function exclusionEvidenceForCandidates(
  candidates: GoldenCatalogOracleCard[],
  catalog: DeckResolutionCatalog,
): string[] {
  const evidence: string[] = [];
  for (const card of candidates) {
    if (NON_PLAYABLE_DECK_LAYOUTS.has(card.layout ?? "normal")) {
      evidence.push(`${card.canonicalName}: excluded_non_playable_layout:${card.layout ?? "normal"}`);
    }
    if (!isCompetitiveDeckOracle(catalog, card.oracleId)) {
      evidence.push(
        `${card.canonicalName}: excluded_non_competitive:${catalog.nonCompetitiveOracleReasons.get(card.oracleId) ?? "not_in_competitive_frame"}`,
      );
    }
    if (!paperMetaForOracle(catalog, card.oracleId).paperEligible) {
      evidence.push(`${card.canonicalName}: excluded_not_paper_eligible`);
    }
  }
  return [...new Set(evidence)];
}

export function disambiguateDeterministicCandidates(input: {
  candidates: GoldenCatalogOracleCard[];
  trimmedName: string;
  catalog: DeckResolutionCatalog;
}): GoldenCatalogOracleCard | null {
  return (
    disambiguateDeterministicCandidatesWithStep(input)?.card ?? null
  );
}

export function disambiguateDeterministicCandidatesWithStep(input: {
  candidates: GoldenCatalogOracleCard[];
  trimmedName: string;
  catalog: DeckResolutionCatalog;
}): { card: GoldenCatalogOracleCard; step: DisambiguationStep } | null {
  let pool = input.candidates;
  let step: DisambiguationStep = "single_remaining";

  const exactCanonical = pool.filter((c) => c.canonicalName === input.trimmedName);
  if (exactCanonical.length === 1) {
    return { card: exactCanonical[0]!, step: "exact_canonical_singleton" };
  }
  if (exactCanonical.length > 1) pool = exactCanonical;

  const frontExact = pool.filter((c) => c.canonicalName.split("//")[0]?.trim() === input.trimmedName);
  if (frontExact.length === 1) {
    return { card: frontExact[0]!, step: "front_face_singleton" };
  }
  if (frontExact.length > 1) pool = frontExact;

  const withoutNonPlayable = pool.filter((c) => !NON_PLAYABLE_DECK_LAYOUTS.has(c.layout ?? "normal"));
  if (withoutNonPlayable.length === 1) {
    return { card: withoutNonPlayable[0]!, step: "non_playable_layout_filter" };
  }
  if (withoutNonPlayable.length > 0) {
    pool = withoutNonPlayable;
    step = "non_playable_layout_filter";
  }

  const competitive = filterCompetitiveCandidates(pool, input.catalog);
  if (competitive.length === 1) {
    return { card: competitive[0]!, step: "competitive_filter" };
  }
  if (competitive.length > 0) {
    pool = competitive;
    step = "competitive_filter";
  }

  const paper = pool.filter((c) => paperMetaForOracle(input.catalog, c.oracleId).paperEligible);
  if (paper.length === 1) {
    return { card: paper[0]!, step: "paper_eligible_filter" };
  }
  if (paper.length > 0) {
    pool = paper;
    step = "paper_eligible_filter";
  }

  const normalLayout = pool.filter((c) => (c.layout ?? "normal") === "normal");
  if (normalLayout.length === 1) {
    return { card: normalLayout[0]!, step: "normal_layout_filter" };
  }
  if (normalLayout.length > 1) {
    pool = normalLayout;
    step = "normal_layout_filter";
  }

  const commanderLegal = pool.filter((c) => c.legalities?.commander === "legal");
  if (commanderLegal.length === 1) {
    return { card: commanderLegal[0]!, step: "commander_legal_filter" };
  }
  if (commanderLegal.length > 0) {
    pool = commanderLegal;
    step = "commander_legal_filter";
  }

  if (pool.length === 1) return { card: pool[0]!, step };
  return null;
}

function mapDisambiguationStepToMatchKind(
  step: DisambiguationStep,
  competitiveMatches: GoldenCatalogOracleCard[],
  allMatches: GoldenCatalogOracleCard[],
): DeckCardResolutionMethod {
  if (step === "commander_legal_filter") return "commander_legal_disambiguation";
  if (step === "competitive_filter" && competitiveMatches.length < allMatches.length) {
    return "competitive_filter";
  }
  if (step === "non_playable_layout_filter" || step === "normal_layout_filter") {
    return "playable_layout_preferred";
  }
  if (step === "paper_eligible_filter") return "paper_preferred";
  if (step === "exact_canonical_singleton") return "exact_canonical";
  if (step === "front_face_singleton") return "face_name";
  return "playable_layout_preferred";
}

export function resolveCatalogCardByNameWithAudit(
  name: string,
  catalog: DeckResolutionCatalog,
): CatalogLookupResult & { audit: ResolutionAuditTrail } {
  const keyNorm = normalizeDeckObjCardKey(name);
  const trimmed = keyNorm.normalizedKey;
  const audit: ResolutionAuditTrail = {
    sourceName: name,
    normalizedLookupName: trimmed,
    keyNormalizationApplied: keyNorm.normalizationApplied,
    initialCandidateCount: 0,
    candidateCountAfterCompetitiveGate: 0,
    ambiguousBeforeFiltering: false,
    finalCandidateCount: 0,
    status: "not_found",
    commanderLegalStepApplied: false,
    commanderLegalChangedChoice: false,
  };

  const keys = canonicalNameKeys(trimmed);

  for (const key of keys) {
    const aliasHit = resolveOfficialAlias(key, catalog);
    if (aliasHit) {
      audit.status = "resolved";
      audit.matchKind = "official_alias";
      audit.finalCandidateCount = 1;
      audit.chosenOracleId = aliasHit.card.oracleId;
      return { ...aliasHit, audit };
    }

    const matches = catalog.byNormalizedName.get(key);
    if (!matches?.length) continue;

    audit.initialCandidateCount = matches.length;
    audit.ambiguousBeforeFiltering = matches.length > 1;

    const competitiveMatches = filterCompetitiveCandidates(matches, catalog);
    const candidatePool = competitiveMatches.length > 0 ? competitiveMatches : matches;
    audit.candidateCountAfterCompetitiveGate = candidatePool.length;

    if (candidatePool.length === 1) {
      audit.status = "resolved";
      audit.matchKind = "unique";
      audit.finalCandidateCount = 1;
      audit.chosenOracleId = candidatePool[0]!.oracleId;
      return {
        status: "resolved",
        card: candidatePool[0]!,
        matchKind: "unique",
        normalizedLookupName: trimmed,
        audit,
      };
    }

    const exactCanonical = candidatePool.filter((c) => c.canonicalName === trimmed);
    if (exactCanonical.length === 1) {
      audit.status = "resolved";
      audit.matchKind = "exact_canonical";
      audit.finalCandidateCount = 1;
      audit.chosenOracleId = exactCanonical[0]!.oracleId;
      return {
        status: "resolved",
        card: exactCanonical[0]!,
        matchKind: "exact_canonical",
        normalizedLookupName: trimmed,
        audit,
      };
    }

    const frontExact = candidatePool.filter((c) => c.canonicalName.split("//")[0]?.trim() === trimmed);
    if (frontExact.length === 1) {
      audit.status = "resolved";
      audit.matchKind = "face_name";
      audit.finalCandidateCount = 1;
      audit.chosenOracleId = frontExact[0]!.oracleId;
      return {
        status: "resolved",
        card: frontExact[0]!,
        matchKind: "face_name",
        normalizedLookupName: trimmed,
        audit,
      };
    }

    const paperPreferred = preferPaperEligible(
      exactCanonical.length > 0 ? exactCanonical : frontExact.length > 0 ? frontExact : candidatePool,
      catalog,
    );
    if (paperPreferred) {
      audit.status = "resolved";
      audit.matchKind = "paper_preferred";
      audit.finalCandidateCount = 1;
      audit.chosenOracleId = paperPreferred.oracleId;
      return {
        status: "resolved",
        card: paperPreferred,
        matchKind: "paper_preferred",
        normalizedLookupName: trimmed,
        audit,
      };
    }

    const poolBeforeCommander = [...candidatePool];
    const disambiguated = disambiguateDeterministicCandidatesWithStep({
      candidates: candidatePool,
      trimmedName: trimmed,
      catalog,
    });
    if (disambiguated) {
      const withoutCommander = disambiguateDeterministicCandidatesWithStep({
        candidates: poolBeforeCommander.filter((c) => !NON_PLAYABLE_DECK_LAYOUTS.has(c.layout ?? "normal")),
        trimmedName: trimmed,
        catalog,
      });
      audit.commanderLegalStepApplied = disambiguated.step === "commander_legal_filter";
      audit.commanderLegalChangedChoice =
        audit.commanderLegalStepApplied &&
        Boolean(withoutCommander && withoutCommander.card.oracleId !== disambiguated.card.oracleId);

      const matchKind = mapDisambiguationStepToMatchKind(
        disambiguated.step,
        competitiveMatches,
        matches,
      );
      audit.status = "resolved";
      audit.matchKind = matchKind;
      audit.disambiguationStep = disambiguated.step;
      audit.finalCandidateCount = 1;
      audit.chosenOracleId = disambiguated.card.oracleId;
      return {
        status: "resolved",
        card: disambiguated.card,
        matchKind,
        normalizedLookupName: trimmed,
        audit,
      };
    }

    audit.status = "ambiguous";
    audit.finalCandidateCount = matches.length;
    return {
      status: "ambiguous",
      candidates: matches,
      normalizedName: key,
      normalizedLookupName: trimmed,
      exclusionEvidence: exclusionEvidenceForCandidates(matches, catalog),
      audit,
    };
  }

  audit.status = "not_found";
  audit.finalCandidateCount = 0;
  return {
    status: "not_found",
    normalizedName: normalizeOracleName(trimmed),
    normalizedLookupName: trimmed,
    audit,
  };
}

export function resolveCatalogCardByName(
  name: string,
  catalog: DeckResolutionCatalog,
): CatalogLookupResult {
  const { normalizedKey: trimmed } = normalizeDeckObjCardKey(name);
  const keys = canonicalNameKeys(trimmed);

  for (const key of keys) {
    const aliasHit = resolveOfficialAlias(key, catalog);
    if (aliasHit) return aliasHit;

    const matches = catalog.byNormalizedName.get(key);
    if (!matches?.length) continue;

    const competitiveMatches = filterCompetitiveCandidates(matches, catalog);
    const candidatePool = competitiveMatches.length > 0 ? competitiveMatches : matches;

    if (candidatePool.length === 1) {
      return {
        status: "resolved",
        card: candidatePool[0],
        matchKind: "unique",
        normalizedLookupName: trimmed,
      };
    }

    const exactCanonical = candidatePool.filter((c) => c.canonicalName === trimmed);
    if (exactCanonical.length === 1) {
      return {
        status: "resolved",
        card: exactCanonical[0],
        matchKind: "exact_canonical",
        normalizedLookupName: trimmed,
      };
    }

    const frontExact = candidatePool.filter((c) => c.canonicalName.split("//")[0]?.trim() === trimmed);
    if (frontExact.length === 1) {
      return {
        status: "resolved",
        card: frontExact[0],
        matchKind: "face_name",
        normalizedLookupName: trimmed,
      };
    }

    const paperPreferred = preferPaperEligible(
      exactCanonical.length > 0
        ? exactCanonical
        : frontExact.length > 0
          ? frontExact
          : candidatePool,
      catalog,
    );
    if (paperPreferred) {
      return {
        status: "resolved",
        card: paperPreferred,
        matchKind: "paper_preferred",
        normalizedLookupName: trimmed,
      };
    }

    const disambiguated = disambiguateDeterministicCandidatesWithStep({
      candidates: candidatePool,
      trimmedName: trimmed,
      catalog,
    });
    if (disambiguated) {
      const matchKind = mapDisambiguationStepToMatchKind(
        disambiguated.step,
        competitiveMatches,
        matches,
      );
      return {
        status: "resolved",
        card: disambiguated.card,
        matchKind,
        normalizedLookupName: trimmed,
      };
    }

    return {
      status: "ambiguous",
      candidates: matches,
      normalizedName: key,
      normalizedLookupName: trimmed,
      exclusionEvidence: exclusionEvidenceForCandidates(matches, catalog),
    };
  }

  return {
    status: "not_found",
    normalizedName: normalizeOracleName(trimmed),
    normalizedLookupName: trimmed,
  };
}
