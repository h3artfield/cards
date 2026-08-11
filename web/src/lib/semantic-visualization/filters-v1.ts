import type { SemanticMapFilters, SemanticMapPoint } from "./types";
import type { SemanticMapInventoryOverlay } from "./types";

const COLOR_ORDER = ["W", "U", "B", "R", "G"] as const;

export function normalizeCardName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function colorIdentityKey(colors: string[]): string {
  return [...colors].sort((a, b) => COLOR_ORDER.indexOf(a as (typeof COLOR_ORDER)[number]) - COLOR_ORDER.indexOf(b as (typeof COLOR_ORDER)[number])).join("");
}

export function commanderLegalInIdentity(cardColors: string[], commanderColors: string[]): boolean {
  for (const c of cardColors) {
    if (!commanderColors.includes(c)) return false;
  }
  return true;
}

export function matchesColorMode(point: SemanticMapPoint, mode: SemanticMapFilters["colorMode"]): boolean {
  if (mode === "all") return true;
  const ci = point.colorIdentity;
  if (mode === "C") return ci.length === 0;
  if (mode === "multicolor") return ci.length > 1;
  return ci.length === 1 && ci[0] === mode;
}

export function matchesIncludesColors(point: SemanticMapPoint, includes: string[]): boolean {
  if (includes.length === 0) return true;
  return includes.every((c) => point.colorIdentity.includes(c));
}

export function matchesExactColorIdentity(point: SemanticMapPoint, exact: string[]): boolean {
  if (exact.length === 0) return true;
  return colorIdentityKey(point.colorIdentity) === colorIdentityKey(exact);
}

export function matchesCardTypes(point: SemanticMapPoint, types: string[]): boolean {
  if (types.length === 0) return true;
  return types.some((t) => point.types.map((x) => x.toLowerCase()).includes(t.toLowerCase()));
}

export function matchesSubtype(point: SemanticMapPoint, subtypeQuery?: string): boolean {
  if (!subtypeQuery?.trim()) return true;
  const q = subtypeQuery.trim().toLowerCase();
  return point.subtypes.some((s) => s.toLowerCase().includes(q)) || point.typeLine.toLowerCase().includes(q);
}

export function matchesSemanticActions(
  point: SemanticMapPoint,
  actions: string[],
  mode: "any" | "all",
): boolean {
  if (actions.length === 0) return true;
  const set = new Set(point.topActions);
  if (mode === "all") return actions.every((a) => set.has(a));
  return actions.some((a) => set.has(a));
}

export function matchesAbilityTypes(point: SemanticMapPoint, abilityTypes: string[]): boolean {
  if (abilityTypes.length === 0) return true;
  const normalized = point.abilityTypes.map((a) => a.toLowerCase());
  return abilityTypes.some((a) => normalized.includes(a.toLowerCase()));
}

export function matchesZones(point: SemanticMapPoint, zones: string[]): boolean {
  if (zones.length === 0) return true;
  return zones.some((z) => point.zones.includes(z));
}

export function matchesSemanticOwners(point: SemanticMapPoint, owners: string[]): boolean {
  if (owners.length === 0) return true;
  return owners.some((o) => point.semanticOwners.includes(o));
}

export function matchesDerivedRoles(point: SemanticMapPoint, roles: string[]): boolean {
  if (roles.length === 0) return true;
  return roles.some((r) => point.derivedRoles.includes(r));
}

export function matchesQuality(
  point: SemanticMapPoint,
  quality: SemanticMapFilters["qualityFilter"],
): boolean {
  switch (quality) {
    case "all":
      return true;
    case "publishable":
      return point.qualityStatus === "publishable";
    case "accepted":
      return point.qualityStatus !== "quarantined";
    case "needs_review":
      return point.qualityStatus === "needs_review";
    case "quarantined":
      return point.qualityStatus === "quarantined";
    default:
      return true;
  }
}

export function filterSemanticMapPoints(
  points: SemanticMapPoint[],
  filters: SemanticMapFilters,
  inventoryByOracleId?: Map<string, SemanticMapInventoryOverlay>,
  commanderColorIdentity?: string[],
): SemanticMapPoint[] {
  let filtered = points;

  if (filters.showScope === "inventory" && inventoryByOracleId) {
    filtered = filtered.filter((p) => inventoryByOracleId.get(p.oracleId)?.inStock);
  }

  if (filters.commanderEligible === "yes") {
    filtered = filtered.filter((p) => p.commanderEligible);
  } else if (filters.commanderEligible === "no") {
    filtered = filtered.filter((p) => !p.commanderEligible);
  }

  if (commanderColorIdentity && commanderColorIdentity.length >= 0) {
    filtered = filtered.filter((p) => commanderLegalInIdentity(p.colorIdentity, commanderColorIdentity));
  }

  filtered = filtered.filter((p) => matchesColorMode(p, filters.colorMode));
  filtered = filtered.filter((p) => matchesIncludesColors(p, filters.includesColors));
  filtered = filtered.filter((p) => matchesExactColorIdentity(p, filters.exactColorIdentity));
  filtered = filtered.filter((p) => matchesCardTypes(p, filters.cardTypes));
  filtered = filtered.filter((p) => matchesSubtype(p, filters.subtypeQuery));
  filtered = filtered.filter(
    (p) => p.manaValue >= filters.manaValueMin && p.manaValue <= filters.manaValueMax,
  );
  filtered = filtered.filter((p) =>
    matchesSemanticActions(p, filters.semanticActions, filters.semanticActionMode),
  );
  filtered = filtered.filter((p) => matchesAbilityTypes(p, filters.abilityTypes));
  filtered = filtered.filter((p) => matchesZones(p, filters.zones));
  filtered = filtered.filter((p) => matchesSemanticOwners(p, filters.semanticOwners));
  filtered = filtered.filter((p) => matchesDerivedRoles(p, filters.derivedRoles));
  filtered = filtered.filter((p) => matchesQuality(p, filters.qualityFilter));

  if (filters.qualityFilter !== "quarantined" && filters.qualityFilter !== "all") {
    filtered = filtered.filter((p) => p.qualityStatus !== "quarantined");
  }

  return filtered;
}

export function rankBySemanticNeighborLimit(
  points: SemanticMapPoint[],
  centerOracleId: string,
  neighbors: Map<string, Array<{ oracleId: string; distance: number }>>,
  limit: number,
): SemanticMapPoint[] {
  const neighborList = neighbors.get(centerOracleId) ?? [];
  const allowed = new Set(neighborList.slice(0, limit).map((n) => n.oracleId));
  allowed.add(centerOracleId);
  return points.filter((p) => allowed.has(p.oracleId));
}

export const DEFAULT_SEMANTIC_MAP_FILTERS: SemanticMapFilters = {
  showScope: "all",
  colorMode: "all",
  includesColors: [],
  exactColorIdentity: [],
  commanderEligible: "all",
  cardTypes: [],
  manaValueMin: 0,
  manaValueMax: 999,
  semanticActions: [],
  semanticActionMode: "any",
  abilityTypes: [],
  zones: [],
  semanticOwners: [],
  qualityFilter: "all",
  derivedRoles: [],
};
