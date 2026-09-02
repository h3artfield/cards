import { COLLECTIONS } from "@/lib/firebase/collections";
import type { GoldenCatalogOracleCard } from "@/lib/deck-builder/golden-catalog/schemas";
import {
  getSemanticMapPoint,
  loadSemanticMapClusters,
  loadSemanticMapManifest,
  loadSemanticMapNeighbors,
  loadSemanticMapPoints,
  searchSemanticMapPoints,
  semanticMapArtifactsAvailable,
} from "./artifact-loader";
import {
  DEFAULT_SEMANTIC_MAP_FILTERS,
  filterSemanticMapPoints,
  normalizeCardName,
  rankBySemanticNeighborLimit,
} from "./filters-v1";
import {
  buildCardFeatureBundle,
  cosineDistance,
  explainNeighborSimilarity,
} from "./feature-vector-v1";
import type { ShadowSemanticInput } from "./shadow-input";
import { qualityStatusFromShadow } from "./shadow-input";
import type {
  SemanticMapCardDetail,
  SemanticMapCompareResult,
  SemanticMapFilters,
  SemanticMapInventoryOverlay,
  SemanticMapManifest,
  SemanticMapPoint,
} from "./types";
import { DERIVED_FEATURE_VERSION, NEIGHBOR_COUNT } from "./types";
import { createGunzip } from "node:zlib";
import { createReadStream, existsSync } from "node:fs";
import readline from "node:readline";
import { semanticMapArtifactPath } from "./artifact-paths";
import { getCachedStoreInventory } from "@/lib/deck-builder/store-inventory-cache";
import { inventoryEffectiveQuantity } from "@/lib/inventory/status";

let shadowCache: Map<string, ShadowSemanticInput> | null = null;
let featureBundleCache: Map<string, ReturnType<typeof buildCardFeatureBundle>> | null = null;

export function isSemanticMapReady(): boolean {
  return semanticMapArtifactsAvailable();
}

export function getSemanticMapManifest(): SemanticMapManifest {
  return loadSemanticMapManifest();
}

export function getSemanticMapPoints(): SemanticMapPoint[] {
  return loadSemanticMapPoints();
}

export async function getSemanticMapPayload(storeId: string, storeSlug: string) {
  const manifest = loadSemanticMapManifest();
  const points = loadSemanticMapPoints();
  const inventoryOverlay = await buildInventoryOverlay(storeId, storeSlug);
  return {
    manifest,
    points,
    inventoryOverlay,
  };
}

async function buildInventoryOverlay(
  storeId: string,
  storeSlug: string,
): Promise<Record<string, SemanticMapInventoryOverlay>> {
  const inventory = await getCachedStoreInventory(storeId);
  const byOracle = new Map<string, SemanticMapInventoryOverlay>();

  for (const item of inventory) {
    if (!item.catalogOracleId || item.game !== "Magic") continue;
    const qty = inventoryEffectiveQuantity(item);
    if (qty <= 0) continue;

    const existing = byOracle.get(item.catalogOracleId) ?? {
      oracleId: item.catalogOracleId,
      inStock: true,
      totalQty: 0,
      items: [],
    };

    existing.totalQty += qty;
    existing.items.push({
      inventoryItemId: item.id,
      name: item.name,
      qty,
      listPrice: item.listPrice,
      tcgLowPrice: item.tcgLowPrice,
      imageUrl: item.frontImageUrl,
      imageProxyUrl: `/api/store/${storeSlug}/inventory/image?itemId=${encodeURIComponent(item.id)}`,
      setName: item.setName,
    });
    byOracle.set(item.catalogOracleId, existing);
  }

  return Object.fromEntries(byOracle);
}

export async function getInventoryOverlayMap(
  storeId: string,
  storeSlug: string,
): Promise<Map<string, SemanticMapInventoryOverlay>> {
  const overlay = await buildInventoryOverlay(storeId, storeSlug);
  return new Map(Object.entries(overlay));
}

export function applySemanticMapFilters(
  points: SemanticMapPoint[],
  filters: SemanticMapFilters,
  inventoryByOracleId?: Map<string, SemanticMapInventoryOverlay>,
  commanderColors?: string[],
): SemanticMapPoint[] {
  let result = filterSemanticMapPoints(points, filters, inventoryByOracleId, commanderColors);

  if (filters.centerCommanderOracleId && filters.neighborLimit) {
    // neighbor filtering applied separately once neighbors are loaded
  }

  return result;
}

export async function applyCommanderNeighborFilter(
  points: SemanticMapPoint[],
  centerOracleId: string,
  neighborLimit: number,
): Promise<SemanticMapPoint[]> {
  const neighbors = await loadSemanticMapNeighbors();
  return rankBySemanticNeighborLimit(points, centerOracleId, neighbors, neighborLimit);
}

export function searchCards(query: string, limit = 20): SemanticMapPoint[] {
  return searchSemanticMapPoints(query, limit);
}

async function loadShadowRow(oracleId: string): Promise<ShadowSemanticInput | null> {
  await ensureShadowCache();
  return shadowCache?.get(oracleId) ?? null;
}

async function ensureShadowCache(): Promise<void> {
  if (shadowCache) return;
  shadowCache = new Map();
  const path = semanticMapArtifactPath("shadowParse");
  if (!existsSync(path)) return;

  const input = createReadStream(path).pipe(createGunzip());
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as ShadowSemanticInput & {
      needsReviewActions: ShadowSemanticInput["needsReviewActions"];
      publishable: boolean;
      structuralInvalid: boolean;
      parserVersion: string;
    };
    shadowCache.set(row.oracleId, row);
  }
}

/** RC8 shadow parse rows keyed by oracle id — for inventory semantic filters. */
export async function getShadowSemanticIndexMap(): Promise<
  Map<string, ShadowSemanticInput>
> {
  await ensureShadowCache();
  return shadowCache ?? new Map();
}

async function getGoldenOracleCard(oracleId: string): Promise<GoldenCatalogOracleCard | null> {
  const { ensureFirebaseAdmin, requireFirestore, isAdminConfigured } = await import(
    "@/lib/firebase/admin"
  );
  if (!ensureFirebaseAdmin().initialized || !isAdminConfigured()) return null;
  const db = requireFirestore();
  const snap = await db.collection(COLLECTIONS.catalogOracleCards).doc(oracleId).get();
  if (!snap.exists) return null;
  return snap.data() as GoldenCatalogOracleCard;
}

async function getCardImageUrl(oracleId: string, canonicalName: string): Promise<string | undefined> {
  const { ensureFirebaseAdmin, requireFirestore, isAdminConfigured } = await import(
    "@/lib/firebase/admin"
  );
  if (!ensureFirebaseAdmin().initialized || !isAdminConfigured()) {
    return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(canonicalName)}&format=image&version=normal`;
  }
  const db = requireFirestore();
  const printingSnap = await db
    .collection(COLLECTIONS.catalogCards)
    .where("oracleId", "==", oracleId)
    .limit(5)
    .get();
  for (const doc of printingSnap.docs) {
    const printing = doc.data() as { images?: { normal?: string; small?: string } };
    if (printing.images?.normal) return printing.images.normal;
    if (printing.images?.small) return printing.images.small;
  }
  return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(canonicalName)}&format=image&version=normal`;
}

function pointToFaces(card: GoldenCatalogOracleCard) {
  if (card.cardFaces?.length) {
    return card.cardFaces.map((f) => ({
      name: f.name ?? card.canonicalName,
      manaCost: f.manaCost,
      typeLine: f.typeLine,
      oracleText: f.oracleText,
      power: f.power,
      toughness: f.toughness,
    }));
  }
  return [
    {
      name: card.canonicalName,
      manaCost: card.manaCost,
      typeLine: card.typeLine,
      oracleText: card.oracleText,
    },
  ];
}

export async function getSemanticMapCardDetail(
  oracleId: string,
  neighborOracleId?: string,
): Promise<SemanticMapCardDetail | null> {
  const point = getSemanticMapPoint(oracleId);
  if (!point) return null;

  const [shadow, card, neighborsMap, imageUrl] = await Promise.all([
    loadShadowRow(oracleId),
    getGoldenOracleCard(oracleId),
    loadSemanticMapNeighbors(),
    getCardImageUrl(oracleId, point.name),
  ]);

  const neighborRows = (neighborsMap.get(oracleId) ?? []).slice(0, NEIGHBOR_COUNT);
  const neighbors = neighborRows.map((n) => {
    const np = getSemanticMapPoint(n.oracleId);
    return {
      oracleId: n.oracleId,
      name: np?.name ?? n.oracleId,
      distance: n.distance,
    };
  });

  let neighborExplanation;
  if (neighborOracleId && shadow && card) {
    const targetShadow = await loadShadowRow(neighborOracleId);
    const targetCard = await getGoldenOracleCard(neighborOracleId);
    if (targetShadow && targetCard) {
      const a = buildCardFeatureBundle({ shadow, card });
      const b = buildCardFeatureBundle({ shadow: targetShadow, card: targetCard });
      neighborExplanation = explainNeighborSimilarity(a, b);
    }
  }

  const semanticActions =
    shadow?.semantic.actions.map((action) => {
      const parent = shadow.semantic.abilities.find((a) => a.abilityId === action.parentAbilityId);
      return {
        actionType: action.actionType,
        reviewStatus: action.reviewStatus,
        sourceZones: action.arguments.sourceZone ?? [],
        destinationZones: action.arguments.destinationZone ?? [],
        semanticOwner: action.semanticOwner,
        executionContext: action.executionContext,
        abilityType: parent?.abilityType,
      };
    }) ?? [];

  return {
    oracleId,
    name: point.name,
    manaCost: point.manaCost ?? card?.manaCost,
    manaValue: point.manaValue,
    typeLine: point.typeLine,
    colorIdentity: point.colorIdentity,
    oracleText: card?.oracleText,
    faces: card ? pointToFaces(card) : [{ name: point.name, typeLine: point.typeLine }],
    imageUrl,
    layout: point.layout,
    commanderEligible: point.commanderEligible,
    qualityStatus: point.qualityStatus,
    publishable: point.publishable,
    hasNeedsReview: point.hasNeedsReview,
    structuralInvalid: point.structuralInvalid,
    parserVersion: shadow?.parserVersion,
    semanticActions,
    abilities: shadow?.semantic.abilities.map((a) => ({ abilityType: a.abilityType, abilityId: a.abilityId })) ?? [],
    zones: point.zones,
    semanticOwners: point.semanticOwners,
    derivedRoles: point.derivedRoles.map((role) => ({ role, version: DERIVED_FEATURE_VERSION })),
    coordinates: { x: point.x, y: point.y, z: point.z },
    clusterId: point.clusterId,
    neighbors,
    neighborExplanation,
  };
}

export async function compareSemanticMapCards(
  oracleIdA: string,
  oracleIdB: string,
): Promise<SemanticMapCompareResult | null> {
  const pointA = getSemanticMapPoint(oracleIdA);
  const pointB = getSemanticMapPoint(oracleIdB);
  if (!pointA || !pointB) return null;

  const [shadowA, shadowB, cardA, cardB] = await Promise.all([
    loadShadowRow(oracleIdA),
    loadShadowRow(oracleIdB),
    getGoldenOracleCard(oracleIdA),
    getGoldenOracleCard(oracleIdB),
  ]);
  if (!shadowA || !shadowB || !cardA || !cardB) {
    return {
      cardA: { oracleId: oracleIdA, name: pointA.name, coordinates: { x: pointA.x, y: pointA.y, z: pointA.z } },
      cardB: { oracleId: oracleIdB, name: pointB.name, coordinates: { x: pointB.x, y: pointB.y, z: pointB.z } },
      semanticDistance: Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y, pointA.z - pointB.z),
      sharedActions: pointA.topActions.filter((a) => pointB.topActions.includes(a)),
      differentActionsA: pointA.topActions.filter((a) => !pointB.topActions.includes(a)),
      differentActionsB: pointB.topActions.filter((a) => !pointA.topActions.includes(a)),
      sharedZones: pointA.zones.filter((z) => pointB.zones.includes(z)),
      sharedDerivedRoles: pointA.derivedRoles.filter((r) => pointB.derivedRoles.includes(r)),
      abilityStructureA: pointA.abilityTypes,
      abilityStructureB: pointB.abilityTypes,
      abilityStructureDiff: {
        onlyA: pointA.abilityTypes.filter((t) => !pointB.abilityTypes.includes(t)),
        onlyB: pointB.abilityTypes.filter((t) => !pointA.abilityTypes.includes(t)),
        shared: pointA.abilityTypes.filter((t) => pointB.abilityTypes.includes(t)),
      },
    };
  }

  const bundleA = buildCardFeatureBundle({ shadow: shadowA, card: cardA });
  const bundleB = buildCardFeatureBundle({ shadow: shadowB, card: cardB });

  return {
    cardA: { oracleId: oracleIdA, name: pointA.name, coordinates: { x: pointA.x, y: pointA.y, z: pointA.z } },
    cardB: { oracleId: oracleIdB, name: pointB.name, coordinates: { x: pointB.x, y: pointB.y, z: pointB.z } },
    semanticDistance: cosineDistance(bundleA.combinedVector, bundleB.combinedVector),
    sharedActions: bundleA.topActions.filter((a) => bundleB.topActions.includes(a)),
    differentActionsA: bundleA.topActions.filter((a) => !bundleB.topActions.includes(a)),
    differentActionsB: bundleB.topActions.filter((a) => !bundleA.topActions.includes(a)),
    sharedZones: bundleA.zones.filter((z) => bundleB.zones.includes(z)),
    sharedDerivedRoles: bundleA.derivedRoles.filter((r) => bundleB.derivedRoles.includes(r)),
    abilityStructureA: bundleA.abilityTypes,
    abilityStructureB: bundleB.abilityTypes,
    abilityStructureDiff: {
      onlyA: bundleA.abilityTypes.filter((t) => !bundleB.abilityTypes.includes(t)),
      onlyB: bundleB.abilityTypes.filter((t) => !pointA.abilityTypes.includes(t)),
      shared: bundleA.abilityTypes.filter((t) => bundleB.abilityTypes.includes(t)),
    },
  };
}

export function getSemanticMapClusters() {
  return loadSemanticMapClusters();
}

export function parseSemanticMapFiltersFromSearchParams(sp: URLSearchParams): SemanticMapFilters {
  const filters: SemanticMapFilters = { ...DEFAULT_SEMANTIC_MAP_FILTERS };
  const showScope = sp.get("showScope");
  if (showScope === "inventory") filters.showScope = "inventory";
  const colorMode = sp.get("colorMode");
  if (colorMode) filters.colorMode = colorMode as SemanticMapFilters["colorMode"];
  const includesColors = sp.get("includesColors");
  if (includesColors) filters.includesColors = includesColors.split(",").filter(Boolean);
  const cardTypes = sp.get("cardTypes");
  if (cardTypes) filters.cardTypes = cardTypes.split(",").filter(Boolean);
  const semanticActions = sp.get("semanticActions");
  if (semanticActions) filters.semanticActions = semanticActions.split(",").filter(Boolean);
  const derivedRoles = sp.get("derivedRoles");
  if (derivedRoles) filters.derivedRoles = derivedRoles.split(",").filter(Boolean);
  const quality = sp.get("quality");
  if (quality) filters.qualityFilter = quality as SemanticMapFilters["qualityFilter"];
  return filters;
}

export { DEFAULT_SEMANTIC_MAP_FILTERS, normalizeCardName, qualityStatusFromShadow };
