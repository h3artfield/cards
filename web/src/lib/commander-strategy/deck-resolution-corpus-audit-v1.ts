import { normalizeDeckObjCardKey } from "./deck-obj-key-normalization-v1";
import { resolveCatalogCardByName } from "./resolve-catalog-card-by-name";
import { classifyUnresolvedName } from "./unresolved-card-classification-v1";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { NormalizedDeckInstance } from "./types";

export type RemainingNameAuditRow = {
  name: string;
  quantity: number;
  priorV3Category?: string;
  newCategory: string;
  priorV3LookupStatus?: string;
  newLookupStatus: string;
  resolves: boolean;
  resolutionMethod?: string;
  canonicalOracleId?: string;
  canonicalOracleName?: string;
  exclusionEvidence?: string[];
};

export type DeckResolutionCorpusAudit = {
  priorV3RemainingNames: RemainingNameAuditRow[];
  officialAliasResolutionQuantity: number;
  officialAliasUniqueSourceNames: number;
  topOfficialAliasResolutions: Array<{
    sourceName: string;
    quantity: number;
    canonicalOracleName: string;
    oracleId: string;
  }>;
  sourceNameOracleConsistency: {
    inconsistentSourceNames: Array<{
      sourceName: string;
      oracleIds: string[];
      quantityByOracleId: Record<string, number>;
    }>;
    inconsistentCount: number;
  };
  resolutionMethodCounts: Record<string, number>;
};

const PRIOR_V3_REMAINING = [
  "Pick Your Poison",
  "Rick, Steadfast Leader",
  "Phenomena Recorder",
  "Bayo, Irritable Instructor",
  "Basil, Cabaretti Loudmouth",
  "Detect Intrusion",
  "The Terminus of Return",
  "Holga, Relentless Rager",
];

export function auditDeckResolutionCorpus(input: {
  decks: NormalizedDeckInstance[];
  catalog: DeckResolutionCatalog;
  priorV3UnresolvedRows?: Array<{
    name: string;
    quantity: number;
    category?: string;
    lookupStatus?: string;
  }>;
}): DeckResolutionCorpusAudit {
  const nameQuantities = new Map<string, number>();
  const sourceOracleMap = new Map<string, Map<string, number>>();
  const resolutionMethodCounts: Record<string, number> = {};
  const officialAliasCounts = new Map<
    string,
    { quantity: number; canonicalOracleName: string; oracleId: string }
  >();

  for (const deck of input.decks) {
    for (const card of deck.mainboard) {
      if (card.resolutionStatus !== "resolved") continue;
      if (card.resolutionMethod) {
        resolutionMethodCounts[card.resolutionMethod] =
          (resolutionMethodCounts[card.resolutionMethod] ?? 0) + card.quantity;
      }
      if (card.resolutionMethod === "official_alias" && card.oracleId) {
        const existing = officialAliasCounts.get(card.sourceName) ?? {
          quantity: 0,
          canonicalOracleName: card.canonicalOracleName ?? card.sourceName,
          oracleId: card.oracleId,
        };
        existing.quantity += card.quantity;
        officialAliasCounts.set(card.sourceName, existing);
      }

      const oracleBucket = sourceOracleMap.get(card.sourceName) ?? new Map<string, number>();
      if (card.oracleId) {
        oracleBucket.set(card.oracleId, (oracleBucket.get(card.oracleId) ?? 0) + card.quantity);
      }
      sourceOracleMap.set(card.sourceName, oracleBucket);
    }

    for (const card of deck.mainboard) {
      if (card.resolutionStatus === "resolved") continue;
      nameQuantities.set(card.sourceName, (nameQuantities.get(card.sourceName) ?? 0) + card.quantity);
    }
  }

  const priorByName = new Map(
    (input.priorV3UnresolvedRows ?? []).map((row) => [row.name, row]),
  );

  const priorV3RemainingNames: RemainingNameAuditRow[] = PRIOR_V3_REMAINING.map((name) => {
    const quantity = nameQuantities.get(name) ?? 0;
    const prior = priorByName.get(name);
    const classified = classifyUnresolvedName(name, input.catalog);
    const lookup = resolveCatalogCardByName(normalizeDeckObjCardKey(name).normalizedKey, input.catalog);
    return {
      name,
      quantity,
      priorV3Category: prior?.category,
      newCategory: classified.category,
      priorV3LookupStatus: prior?.lookupStatus,
      newLookupStatus: classified.lookupStatus,
      resolves: lookup.status === "resolved",
      resolutionMethod: lookup.status === "resolved" ? lookup.matchKind : undefined,
      canonicalOracleId: lookup.status === "resolved" ? lookup.card.oracleId : undefined,
      canonicalOracleName: lookup.status === "resolved" ? lookup.card.canonicalName : undefined,
      exclusionEvidence:
        lookup.status === "ambiguous" ? lookup.exclusionEvidence : undefined,
    };
  });

  const inconsistentSourceNames: DeckResolutionCorpusAudit["sourceNameOracleConsistency"]["inconsistentSourceNames"] =
    [];
  for (const [sourceName, oracleIds] of sourceOracleMap.entries()) {
    if (oracleIds.size <= 1) continue;
    inconsistentSourceNames.push({
      sourceName,
      oracleIds: [...oracleIds.keys()],
      quantityByOracleId: Object.fromEntries(oracleIds.entries()),
    });
  }

  const officialAliasResolutionQuantity = [...officialAliasCounts.values()].reduce(
    (s, row) => s + row.quantity,
    0,
  );

  return {
    priorV3RemainingNames,
    officialAliasResolutionQuantity,
    officialAliasUniqueSourceNames: officialAliasCounts.size,
    topOfficialAliasResolutions: [...officialAliasCounts.entries()]
      .sort((a, b) => b[1].quantity - a[1].quantity)
      .slice(0, 25)
      .map(([sourceName, row]) => ({
        sourceName,
        quantity: row.quantity,
        canonicalOracleName: row.canonicalOracleName,
        oracleId: row.oracleId,
      })),
    sourceNameOracleConsistency: {
      inconsistentSourceNames: inconsistentSourceNames.sort((a, b) =>
        a.sourceName.localeCompare(b.sourceName),
      ),
      inconsistentCount: inconsistentSourceNames.length,
    },
    resolutionMethodCounts,
  };
}

export function mergeDeckResolutionCorpusAudits(
  audits: DeckResolutionCorpusAudit[],
): DeckResolutionCorpusAudit {
  const resolutionMethodCounts: Record<string, number> = {};
  const officialAliasCounts = new Map<
    string,
    { quantity: number; canonicalOracleName: string; oracleId: string }
  >();
  const sourceOracleMap = new Map<string, Map<string, number>>();

  for (const audit of audits) {
    for (const [method, count] of Object.entries(audit.resolutionMethodCounts)) {
      resolutionMethodCounts[method] = (resolutionMethodCounts[method] ?? 0) + count;
    }
    for (const row of audit.topOfficialAliasResolutions) {
      const existing = officialAliasCounts.get(row.sourceName) ?? {
        quantity: 0,
        canonicalOracleName: row.canonicalOracleName,
        oracleId: row.oracleId,
      };
      existing.quantity += row.quantity;
      officialAliasCounts.set(row.sourceName, existing);
    }
    for (const row of audit.sourceNameOracleConsistency.inconsistentSourceNames) {
      const oracleIds = sourceOracleMap.get(row.sourceName) ?? new Map();
      for (const [oracleId, qty] of Object.entries(row.quantityByOracleId)) {
        oracleIds.set(oracleId, (oracleIds.get(oracleId) ?? 0) + qty);
      }
      sourceOracleMap.set(row.sourceName, oracleIds);
    }
  }

  const inconsistentSourceNames: DeckResolutionCorpusAudit["sourceNameOracleConsistency"]["inconsistentSourceNames"] =
    [];
  for (const [sourceName, oracleIds] of sourceOracleMap.entries()) {
    if (oracleIds.size <= 1) continue;
    inconsistentSourceNames.push({
      sourceName,
      oracleIds: [...oracleIds.keys()],
      quantityByOracleId: Object.fromEntries(oracleIds.entries()),
    });
  }

  return {
    priorV3RemainingNames: audits[0]?.priorV3RemainingNames ?? [],
    officialAliasResolutionQuantity: [...officialAliasCounts.values()].reduce(
      (s, row) => s + row.quantity,
      0,
    ),
    officialAliasUniqueSourceNames: officialAliasCounts.size,
    topOfficialAliasResolutions: [...officialAliasCounts.entries()]
      .sort((a, b) => b[1].quantity - a[1].quantity)
      .slice(0, 25)
      .map(([sourceName, row]) => ({
        sourceName,
        quantity: row.quantity,
        canonicalOracleName: row.canonicalOracleName,
        oracleId: row.oracleId,
      })),
    sourceNameOracleConsistency: {
      inconsistentSourceNames: inconsistentSourceNames.sort((a, b) =>
        a.sourceName.localeCompare(b.sourceName),
      ),
      inconsistentCount: inconsistentSourceNames.length,
    },
    resolutionMethodCounts,
  };
}
