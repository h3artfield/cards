import type { IdentityMappingRecord, IdentityResolutionClass, OracleCardRef } from "./types";

export type ExternalCardRef = {
  externalId: string;
  name: string;
  oracleId?: string;
};

export type OracleIdentityIndex = {
  byOracleId: Map<string, OracleCardRef>;
  byExactName: Map<string, OracleCardRef[]>;
  byNormalizedName: Map<string, OracleCardRef[]>;
};

export function normalizeCardName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function buildOracleIdentityIndex(cards: OracleCardRef[]): OracleIdentityIndex {
  const byOracleId = new Map<string, OracleCardRef>();
  const byExactName = new Map<string, OracleCardRef[]>();
  const byNormalizedName = new Map<string, OracleCardRef[]>();
  for (const card of cards) {
    byOracleId.set(card.oracleId, card);
    const exact = card.name;
    const bucket = byExactName.get(exact) ?? [];
    bucket.push(card);
    byExactName.set(exact, bucket);
    const norm = normalizeCardName(card.name);
    const nb = byNormalizedName.get(norm) ?? [];
    nb.push(card);
    byNormalizedName.set(norm, nb);
  }
  return { byOracleId, byExactName, byNormalizedName };
}

export function mapExternalCard(ref: ExternalCardRef, index: OracleIdentityIndex): IdentityMappingRecord {
  if (ref.oracleId) {
    const hit = index.byOracleId.get(ref.oracleId);
    if (hit) {
      return {
        externalId: ref.externalId,
        externalName: ref.name,
        externalOracleId: ref.oracleId,
        classification: "EXACT_ID",
        oracleId: hit.oracleId,
      };
    }
    return {
      externalId: ref.externalId,
      externalName: ref.name,
      externalOracleId: ref.oracleId,
      classification: "UNRESOLVED",
      reason: "stable oracleId present but not in local Golden/snapshot index",
    };
  }

  const exact = index.byExactName.get(ref.name) ?? [];
  if (exact.length === 1) {
    return {
      externalId: ref.externalId,
      externalName: ref.name,
      classification: "EXACT_NAME_UNAMBIGUOUS",
      oracleId: exact[0].oracleId,
    };
  }
  if (exact.length > 1) {
    return ambiguous(ref, "EXACT_NAME", exact);
  }

  const norm = index.byNormalizedName.get(normalizeCardName(ref.name)) ?? [];
  if (norm.length === 1) {
    return {
      externalId: ref.externalId,
      externalName: ref.name,
      classification: "NORMALIZED_NAME_UNAMBIGUOUS",
      oracleId: norm[0].oracleId,
    };
  }
  if (norm.length > 1) {
    return ambiguous(ref, "NORMALIZED_NAME", norm);
  }

  return {
    externalId: ref.externalId,
    externalName: ref.name,
    classification: "UNRESOLVED",
    reason: "no stable id and no unique name match",
  };
}

function ambiguous(
  ref: ExternalCardRef,
  via: "EXACT_NAME" | "NORMALIZED_NAME",
  candidates: OracleCardRef[],
): IdentityMappingRecord {
  return {
    externalId: ref.externalId,
    externalName: ref.name,
    classification: "AMBIGUOUS",
    candidates,
    reason: `${via} matched ${candidates.length} oracle cards; refusing silent fuzzy match`,
  };
}

export function summarizeIdentityMappings(rows: IdentityMappingRecord[]): {
  totalExternalCardRefs: number;
  uniqueExternalCards: number;
  resolvedByStableId: number;
  resolvedByExactName: number;
  resolvedByNormalizedName: number;
  ambiguous: number;
  unresolved: number;
  resolutionPct: number;
  examples: Record<IdentityResolutionClass, IdentityMappingRecord[]>;
} {
  const unique = new Set(rows.map((r) => r.externalId));
  const count = (cls: IdentityResolutionClass) => rows.filter((r) => r.classification === cls).length;
  const resolved = count("EXACT_ID") + count("EXACT_NAME_UNAMBIGUOUS") + count("NORMALIZED_NAME_UNAMBIGUOUS");
  const examples = {
    EXACT_ID: rows.filter((r) => r.classification === "EXACT_ID").slice(0, 3),
    EXACT_NAME_UNAMBIGUOUS: rows.filter((r) => r.classification === "EXACT_NAME_UNAMBIGUOUS").slice(0, 3),
    NORMALIZED_NAME_UNAMBIGUOUS: rows.filter((r) => r.classification === "NORMALIZED_NAME_UNAMBIGUOUS").slice(0, 3),
    AMBIGUOUS: rows.filter((r) => r.classification === "AMBIGUOUS").slice(0, 5),
    UNRESOLVED: rows.filter((r) => r.classification === "UNRESOLVED").slice(0, 5),
  };
  return {
    totalExternalCardRefs: rows.length,
    uniqueExternalCards: unique.size,
    resolvedByStableId: count("EXACT_ID"),
    resolvedByExactName: count("EXACT_NAME_UNAMBIGUOUS"),
    resolvedByNormalizedName: count("NORMALIZED_NAME_UNAMBIGUOUS"),
    ambiguous: count("AMBIGUOUS"),
    unresolved: count("UNRESOLVED"),
    resolutionPct: rows.length ? (resolved / rows.length) * 100 : 0,
    examples,
  };
}
