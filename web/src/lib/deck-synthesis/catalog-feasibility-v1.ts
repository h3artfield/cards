/**
 * Stage B — functional catalog feasibility scan.
 * Counts role-matching cards in legal color-identity pool; does NOT freeze candidate pools.
 */
import { buildCardFeatureBundle } from "@/lib/semantic-visualization/feature-vector-v1";
import { commanderLegalInIdentity } from "@/lib/semantic-visualization/filters-v1";
import {
  isCurrentlyCommanderLegal,
  isCompetitiveDeckOracle,
  paperMetaForOracle,
  type DeckResolutionCatalog,
} from "../../../scripts/lib/load-deck-resolution-catalog";
import type { ShadowSemanticIndex } from "../commander-strategy/shadow-semantic-index";
import type { DerivedRoleName } from "@/lib/semantic-visualization/derived-features-v1";
import type { CatalogSupportCensus, EnginePatternDef } from "./archetype-discovery-types-v1";

export type CatalogCardSemanticRecord = {
  oracleId: string;
  colorIdentity: string[];
  derivedRoles: DerivedRoleName[];
};

export type GlobalCatalogSemanticIndex = {
  records: CatalogCardSemanticRecord[];
  roleToOracleIds: Map<DerivedRoleName, Set<string>>;
  poolSize: number;
  builtAt: string;
};

export type CatalogRoleIndex = {
  poolSize: number;
  roleToOracleIds: Map<DerivedRoleName, Set<string>>;
  builtAt: string;
};

export function buildGlobalCatalogSemanticIndex(input: {
  catalog: DeckResolutionCatalog;
  shadowIndex: ShadowSemanticIndex;
}): GlobalCatalogSemanticIndex {
  const roleToOracleIds = new Map<DerivedRoleName, Set<string>>();
  const records: CatalogCardSemanticRecord[] = [];

  for (const [oracleId, card] of input.catalog.byOracleId.entries()) {
    const paper = paperMetaForOracle(input.catalog, oracleId);
    if (!paper.paperEligible) continue;
    if (!isCurrentlyCommanderLegal(card)) continue;
    if (!isCompetitiveDeckOracle(input.catalog, oracleId)) continue;

    const shadow = input.shadowIndex.byOracleId.get(oracleId);
    if (!shadow?.semantic) continue;

    const bundle = buildCardFeatureBundle({ shadow, card });
    records.push({ oracleId, colorIdentity: card.colorIdentity ?? [], derivedRoles: bundle.derivedRoles });
    for (const role of bundle.derivedRoles) {
      const bucket = roleToOracleIds.get(role) ?? new Set<string>();
      bucket.add(oracleId);
      roleToOracleIds.set(role, bucket);
    }
  }

  return {
    records,
    roleToOracleIds,
    poolSize: records.length,
    builtAt: new Date().toISOString(),
  };
}

export function filterCatalogRoleIndex(
  globalIndex: GlobalCatalogSemanticIndex,
  colorIdentity: string[],
): CatalogRoleIndex {
  const roleToOracleIds = new Map<DerivedRoleName, Set<string>>();
  let poolSize = 0;

  for (const record of globalIndex.records) {
    if (!commanderLegalInIdentity(record.colorIdentity, colorIdentity)) continue;
    poolSize += 1;
    for (const role of record.derivedRoles) {
      const bucket = roleToOracleIds.get(role) ?? new Set<string>();
      bucket.add(record.oracleId);
      roleToOracleIds.set(role, bucket);
    }
  }

  return { poolSize, roleToOracleIds, builtAt: globalIndex.builtAt };
}

/** @deprecated Prefer buildGlobalCatalogSemanticIndex + filterCatalogRoleIndex for benchmarks. */
export function buildCatalogRoleIndex(input: {
  catalog: DeckResolutionCatalog;
  shadowIndex: ShadowSemanticIndex;
  colorIdentity: string[];
}): CatalogRoleIndex {
  const globalIndex = buildGlobalCatalogSemanticIndex(input);
  return filterCatalogRoleIndex(globalIndex, input.colorIdentity);
}

function countBucket(index: CatalogRoleIndex, roles: DerivedRoleName[]): number {
  const ids = new Set<string>();
  for (const role of roles) {
    for (const id of index.roleToOracleIds.get(role) ?? []) ids.add(id);
  }
  return ids.size;
}

export function assessCatalogFeasibility(input: {
  pattern: EnginePatternDef;
  roleIndex: CatalogRoleIndex;
}): CatalogSupportCensus {
  const { pattern, roleIndex } = input;
  const roleDetail: Record<string, number> = {};

  const census: Omit<CatalogSupportCensus, "feasibilitySupport" | "roleDetail"> = {
    enablers: countBucket(roleIndex, pattern.catalogRoleBuckets.enablers),
    enginePieces: countBucket(roleIndex, pattern.catalogRoleBuckets.enginePieces),
    payoffs: countBucket(roleIndex, pattern.catalogRoleBuckets.payoffs),
    redundancy: countBucket(roleIndex, pattern.catalogRoleBuckets.redundancy),
    resourceSupport: countBucket(roleIndex, pattern.catalogRoleBuckets.resourceSupport),
    interactionProtection: countBucket(roleIndex, pattern.catalogRoleBuckets.interactionProtection),
    finishers: countBucket(roleIndex, pattern.catalogRoleBuckets.finishers),
  };

  for (const [bucket, roles] of Object.entries(pattern.catalogRoleBuckets)) {
    for (const role of roles) {
      roleDetail[`${bucket}.${role}`] = roleIndex.roleToOracleIds.get(role)?.size ?? 0;
    }
  }

  let pass = 0;
  let total = 0;
  for (const [bucket, min] of Object.entries(pattern.minCatalogCounts)) {
    if (min === undefined) continue;
    total += 1;
    const value = census[bucket as keyof typeof census];
    if (typeof value === "number" && value >= min) pass += 1;
  }
  const feasibilitySupport = total > 0 ? pass / total : 0;

  return { ...census, feasibilitySupport, roleDetail };
}

export function isCatalogFeasible(input: {
  pattern: EnginePatternDef;
  census: CatalogSupportCensus;
}): { feasible: boolean; detail: string } {
  const failures: string[] = [];
  for (const [bucket, min] of Object.entries(input.pattern.minCatalogCounts)) {
    if (min === undefined) continue;
    const value = input.census[bucket as keyof CatalogSupportCensus];
    if (typeof value === "number" && value < min) {
      failures.push(`${bucket}=${value}<${min}`);
    }
  }
  if (failures.length === 0) return { feasible: true, detail: "All functional role minimums satisfied." };
  if (input.census.feasibilitySupport >= 0.65) {
    return { feasible: true, detail: `Partial pass (${input.census.feasibilitySupport.toFixed(2)}): ${failures.join("; ")}` };
  }
  return { feasible: false, detail: failures.join("; ") };
}

export function commanderNamesFromCatalog(
  catalog: DeckResolutionCatalog,
  oracleIds: string[],
): string[] {
  return oracleIds.map((id) => catalog.byOracleId.get(id)?.canonicalName ?? id);
}
