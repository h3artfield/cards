import { normalizeOracleName } from "@/lib/deck-builder/golden-catalog/normalize-name";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { resolveCatalogCardByName } from "./resolve-catalog-card-by-name";
import { normalizeDeckObjCardKey } from "./deck-obj-key-normalization-v1";
import type { NormalizedDeckInstance } from "./types";

/**
 * A — canonical paper card; deterministic catalog match exists (stored-unresolved defect)
 * B — source-format / deckObj key normalization defect (fixable structurally)
 * C — digital-only
 * D — non-paper / non-card
 * E — unset / acorn / special-object
 * F — malformed source entry
 * G — genuinely unresolved (fail-closed after full alias audit)
 */
export type UnresolvedCardCategory =
  | "A_canonical_paper_deterministic"
  | "B_source_key_normalization_defect"
  | "C_digital_only"
  | "D_non_paper_non_card"
  | "E_unset_acorn_special"
  | "F_malformed_source_entry"
  | "G_genuinely_unresolved";

export type NameLookupPathAudit = {
  canonicalName: boolean;
  printedNameAlias: boolean;
  flavorNameAlias: boolean;
  printingNameAlias: boolean;
  structuralNormalization: boolean;
  competitivePaperOracle: boolean;
  sourceDeckNameNotFound: boolean;
  aliasInvestigationRequired: boolean;
  normalizedLookupName: string;
};

export type ClassifiedUnresolvedCard = {
  sourceName: string;
  quantity: number;
  category: UnresolvedCardCategory;
  lookupStatus: string;
  normalizedLookupName?: string;
  keyNormalizationApplied?: string[];
  paperPopulationFrame?: string;
  lookupPathAudit?: NameLookupPathAudit;
};

export type UnresolvedClassificationReport = {
  unresolvedCardQuantity: number;
  unresolvedUniqueNames: number;
  byCategory: Record<UnresolvedCardCategory, { quantity: number; uniqueNames: number }>;
  allUnresolved: Array<{
    name: string;
    quantity: number;
    category: UnresolvedCardCategory;
    lookupStatus: string;
    lookupPathAudit?: NameLookupPathAudit;
  }>;
  topUnresolved: Array<{ name: string; quantity: number; category: UnresolvedCardCategory }>;
  aliasInvestigationSignals: Array<{
    name: string;
    quantity: number;
    lookupPathAudit: NameLookupPathAudit;
  }>;
};

export function auditNameLookupPaths(
  name: string,
  catalog: DeckResolutionCatalog,
): NameLookupPathAudit {
  const keyNorm = normalizeDeckObjCardKey(name);
  const normalizedLookupName = keyNorm.normalizedKey;
  const normalizedKey = normalizeOracleName(normalizedLookupName);

  const canonicalName = Boolean(catalog.byNormalizedName.get(normalizedKey)?.length);
  const printedNameAlias = catalog.officialAliasByNormalizedName.has(normalizedKey);
  const aliasRow = catalog.officialAliasByNormalizedName.get(normalizedKey);
  const flavorNameAlias = aliasRow?.aliasKind === "flavor_name";
  const printingNameAlias = aliasRow?.aliasKind === "printing_name" || aliasRow?.aliasKind === "printed_name";

  const lookup = resolveCatalogCardByName(name, catalog);
  const targetOracleId =
    lookup.status === "resolved"
      ? lookup.card.oracleId
      : aliasRow?.oracleId;
  const competitivePaperOracle = targetOracleId
    ? catalog.competitiveDeckOracleIds.has(targetOracleId)
    : false;

  const sourceDeckNameNotFound = lookup.status === "not_found" || lookup.status === "ambiguous";
  const aliasInvestigationRequired =
    sourceDeckNameNotFound &&
    !canonicalName &&
    !printedNameAlias &&
    !flavorNameAlias;

  return {
    canonicalName,
    printedNameAlias,
    flavorNameAlias,
    printingNameAlias,
    structuralNormalization: keyNorm.normalizationApplied.length > 0,
    competitivePaperOracle,
    sourceDeckNameNotFound,
    aliasInvestigationRequired,
    normalizedLookupName,
  };
}

export function classifyUnresolvedName(
  name: string,
  catalog: DeckResolutionCatalog,
): ClassifiedUnresolvedCard {
  const trimmed = name.trim();
  const keyNorm = normalizeDeckObjCardKey(name);
  const lookup = resolveCatalogCardByName(name, catalog);
  const lookupPathAudit = auditNameLookupPaths(name, catalog);

  if (!trimmed || trimmed.length < 2) {
    return {
      sourceName: name,
      quantity: 0,
      category: "F_malformed_source_entry",
      lookupStatus: "malformed",
      lookupPathAudit,
    };
  }

  if (/^[\s?_]+$/.test(trimmed) || trimmed.includes("????")) {
    return {
      sourceName: name,
      quantity: 0,
      category: "E_unset_acorn_special",
      lookupStatus: "special",
      lookupPathAudit,
    };
  }

  if (lookup.status === "resolved") {
    const paper = catalog.paperByOracleId.get(lookup.card.oracleId);
    if (paper?.paperPopulationFrame === "DIGITAL_ONLY") {
      return {
        sourceName: name,
        quantity: 0,
        category: "C_digital_only",
        lookupStatus: "resolved_digital",
        normalizedLookupName: lookup.normalizedLookupName,
        keyNormalizationApplied: keyNorm.normalizationApplied,
        paperPopulationFrame: paper.paperPopulationFrame,
        lookupPathAudit,
      };
    }
    if (paper?.paperPopulationFrame === "NON_CARD" || paper?.paperPopulationFrame === "MALFORMED") {
      return {
        sourceName: name,
        quantity: 0,
        category: "D_non_paper_non_card",
        lookupStatus: "resolved_non_card",
        normalizedLookupName: lookup.normalizedLookupName,
        keyNormalizationApplied: keyNorm.normalizationApplied,
        paperPopulationFrame: paper.paperPopulationFrame,
        lookupPathAudit,
      };
    }

    const category: UnresolvedCardCategory =
      keyNorm.normalizationApplied.length > 0 || keyNorm.rawKey !== keyNorm.normalizedKey
        ? "B_source_key_normalization_defect"
        : lookup.matchKind === "official_alias"
          ? "A_canonical_paper_deterministic"
          : "A_canonical_paper_deterministic";

    return {
      sourceName: name,
      quantity: 0,
      category,
      lookupStatus: "resolved_paper_stored_unresolved",
      normalizedLookupName: lookup.normalizedLookupName,
      keyNormalizationApplied: keyNorm.normalizationApplied,
      paperPopulationFrame: paper?.paperPopulationFrame,
      lookupPathAudit,
    };
  }

  if (lookup.status === "ambiguous") {
    return {
      sourceName: name,
      quantity: 0,
      category: lookupPathAudit.aliasInvestigationRequired ? "G_genuinely_unresolved" : "G_genuinely_unresolved",
      lookupStatus: "ambiguous",
      normalizedLookupName: lookup.normalizedLookupName,
      keyNormalizationApplied: keyNorm.normalizationApplied,
      lookupPathAudit,
    };
  }

  const lower = trimmed.toLowerCase();
  if (/^(a|an|the)$/i.test(trimmed)) {
    return {
      sourceName: name,
      quantity: 0,
      category: "F_malformed_source_entry",
      lookupStatus: "not_found",
      lookupPathAudit,
    };
  }
  if (lower.includes(" // ") && /_{3,}/.test(trimmed)) {
    return {
      sourceName: name,
      quantity: 0,
      category: "E_unset_acorn_special",
      lookupStatus: "not_found_unset",
      lookupPathAudit,
    };
  }

  if (keyNorm.normalizationApplied.length > 0) {
    return {
      sourceName: name,
      quantity: 0,
      category: "B_source_key_normalization_defect",
      lookupStatus: "not_found_after_key_norm",
      normalizedLookupName: lookup.normalizedLookupName,
      keyNormalizationApplied: keyNorm.normalizationApplied,
      lookupPathAudit,
    };
  }

  return {
    sourceName: name,
    quantity: 0,
    category: "G_genuinely_unresolved",
    lookupStatus: "not_found",
    normalizedLookupName: lookup.normalizedLookupName,
    lookupPathAudit,
  };
}

export function classifyUnresolvedCards(input: {
  decks: NormalizedDeckInstance[];
  catalog: DeckResolutionCatalog;
}): UnresolvedClassificationReport {
  const nameQuantities = new Map<string, number>();

  for (const deck of input.decks) {
    for (const card of deck.mainboard) {
      if (card.resolutionStatus === "resolved") continue;
      nameQuantities.set(card.sourceName, (nameQuantities.get(card.sourceName) ?? 0) + card.quantity);
    }
  }

  const byCategory: UnresolvedClassificationReport["byCategory"] = {
    A_canonical_paper_deterministic: { quantity: 0, uniqueNames: 0 },
    B_source_key_normalization_defect: { quantity: 0, uniqueNames: 0 },
    C_digital_only: { quantity: 0, uniqueNames: 0 },
    D_non_paper_non_card: { quantity: 0, uniqueNames: 0 },
    E_unset_acorn_special: { quantity: 0, uniqueNames: 0 },
    F_malformed_source_entry: { quantity: 0, uniqueNames: 0 },
    G_genuinely_unresolved: { quantity: 0, uniqueNames: 0 },
  };

  const allUnresolved: UnresolvedClassificationReport["allUnresolved"] = [];
  const aliasInvestigationSignals: UnresolvedClassificationReport["aliasInvestigationSignals"] = [];

  for (const [name, quantity] of nameQuantities.entries()) {
    const classified = classifyUnresolvedName(name, input.catalog);
    byCategory[classified.category].quantity += quantity;
    byCategory[classified.category].uniqueNames += 1;
    allUnresolved.push({
      name,
      quantity,
      category: classified.category,
      lookupStatus: classified.lookupStatus,
      lookupPathAudit: classified.lookupPathAudit,
    });
    if (classified.lookupPathAudit?.aliasInvestigationRequired) {
      aliasInvestigationSignals.push({
        name,
        quantity,
        lookupPathAudit: classified.lookupPathAudit,
      });
    }
  }

  allUnresolved.sort((a, b) => b.quantity - a.quantity);

  const unresolvedCardQuantity = [...nameQuantities.values()].reduce((s, q) => s + q, 0);

  return {
    unresolvedCardQuantity,
    unresolvedUniqueNames: nameQuantities.size,
    byCategory,
    allUnresolved,
    topUnresolved: allUnresolved.slice(0, 25),
    aliasInvestigationSignals,
  };
}
