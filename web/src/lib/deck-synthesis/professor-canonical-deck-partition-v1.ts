/**
 * Canonical land/nonland deck partition (P0 truth).
 *
 * MDFC policy:
 * - If canonical cardTypes includes "Land", the card occupies a LAND structural slot.
 * - MDFCs playable as lands (e.g. Argoth, Sanctum of Nature // Titania) count as lands.
 * - Type-line regex heuristics must not override canonical cardTypes.
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import {
  resolveCanonicalCardTruthV4164,
  type CanonicalCardTruthV4164,
} from "./professor-canonical-card-truth-v4-16-4-v1";
import type { BlueprintSelectedCardV417, BrewBlueprintV417 } from "./professor-brew-blueprint-v4-17-v1";

export const PROFESSOR_CANONICAL_DECK_PARTITION_V1_VERSION = "professor-canonical-deck-partition-v1";

export const CANONICAL_MDFC_LAND_POLICY_V1 =
  "MDFC and other multi-face cards count as lands when canonical cardTypes includes Land.";

export function isCanonicalLandForDeckPartition(truth: CanonicalCardTruthV4164): boolean {
  return truth.status === "RESOLVED" && truth.cardTypes.includes("Land");
}

export function isCanonicalNonlandForDeckPartition(truth: CanonicalCardTruthV4164): boolean {
  return truth.status === "RESOLVED" && !truth.cardTypes.includes("Land");
}

export function resolveStructuralSlotKindV1(args: {
  name: string;
  oracleId?: string | null;
  typeLine?: string;
  catalog?: DeckResolutionCatalog | null;
}): "land" | "nonland" | "unresolved" {
  const truth = resolveCanonicalCardTruthV4164({
    name: args.name,
    oracleId: args.oracleId,
    typeLine: args.typeLine,
    catalog: args.catalog ?? undefined,
  });
  if (truth.status !== "RESOLVED") return "unresolved";
  return isCanonicalLandForDeckPartition(truth) ? "land" : "nonland";
}

export function countCanonicalNonlandsInBlueprintV1(args: {
  blueprint: Pick<BrewBlueprintV417, "selectedCards">;
  catalog?: DeckResolutionCatalog | null;
}): { nonlands: number; landsMisclassifiedAsNonlands: string[]; unresolved: string[] } {
  let nonlands = 0;
  const landsMisclassifiedAsNonlands: string[] = [];
  const unresolved: string[] = [];
  for (const card of args.blueprint.selectedCards) {
    const slot = resolveStructuralSlotKindV1({
      name: card.name,
      oracleId: card.oracleId,
      catalog: args.catalog ?? null,
    });
    if (slot === "nonland") nonlands += 1;
    else if (slot === "land") landsMisclassifiedAsNonlands.push(card.name);
    else unresolved.push(card.name);
  }
  return { nonlands, landsMisclassifiedAsNonlands, unresolved };
}

export function selectedNonlandsFromCanonicalTruthV1(args: {
  blueprint: Pick<BrewBlueprintV417, "selectedCards">;
  catalog?: DeckResolutionCatalog | null;
  fallbackCount?: number;
}): number {
  if (!args.catalog && args.fallbackCount != null) return args.fallbackCount;
  if (args.blueprint.selectedCards.length === 0) return 0;
  if (!args.catalog) return args.blueprint.selectedCards.length;
  return countCanonicalNonlandsInBlueprintV1(args).nonlands;
}

export function rejectCanonicalLandAsNonlandSelectionV1(args: {
  name: string;
  oracleId: string;
  catalog?: DeckResolutionCatalog | null;
}): { allowed: boolean; reason?: string } {
  const slot = resolveStructuralSlotKindV1(args);
  if (slot === "land") {
    return {
      allowed: false,
      reason: `CANONICAL_LAND_NOT_STRUCTURAL_NONLAND:${args.name}`,
    };
  }
  return { allowed: true };
}

export const P0_LAND_PARTITION_FIXTURE_NAMES_V1 = [
  "Access Tunnel",
  "Aether Hub",
  "Ally Encampment",
  "Arch of Orazca",
  "Argoth, Sanctum of Nature",
  "Abundant Countryside",
] as const;
