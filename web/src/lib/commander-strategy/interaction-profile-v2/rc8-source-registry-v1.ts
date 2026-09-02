/**
 * Versioned registry of RC8 sources Interaction Profile v2 may reference.
 * Unknown keys HARD FAIL at profile build time — no silent zeros.
 */
import { PRIMITIVE_ACTION_TYPES } from "@/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import type { SemanticAbilityType } from "@/lib/deck-builder/golden-catalog/oracle-semantic-parse-schema";
import { RC8_SOURCE_REGISTRY_VERSION } from "./types";

/** Emitted in shadow index but outside canonical taxonomy — explicitly allowed. */
export const RC8_SHADOW_EXTRA_ACTION_TYPES = ["transform"] as const;

export const RC8_KNOWN_ACTION_TYPES = new Set<string>([
  ...PRIMITIVE_ACTION_TYPES,
  ...RC8_SHADOW_EXTRA_ACTION_TYPES,
]);

export const RC8_KNOWN_ABILITY_TYPES = new Set<SemanticAbilityType>([
  "static",
  "activated",
  "triggered",
  "spell_effect",
  "modal",
  "loyalty",
  "replacement",
]);

export const RC8_KNOWN_ZONES = new Set([
  "hand",
  "library",
  "battlefield",
  "graveyard",
  "exile",
  "stack",
  "command",
]);

export class UnknownRc8SourceError extends Error {
  constructor(
    public readonly sourceKind: string,
    public readonly sourceKey: string,
    public readonly oracleId: string,
  ) {
    super(`Unknown RC8 source [${sourceKind}]: "${sourceKey}" for oracleId=${oracleId}`);
    this.name = "UnknownRc8SourceError";
  }
}

export function assertKnownRc8ActionType(actionType: string, oracleId: string): void {
  if (!RC8_KNOWN_ACTION_TYPES.has(actionType)) {
    throw new UnknownRc8SourceError("actionType", actionType, oracleId);
  }
}

export function assertKnownRc8AbilityType(abilityType: string, oracleId: string): void {
  if (!RC8_KNOWN_ABILITY_TYPES.has(abilityType as SemanticAbilityType)) {
    throw new UnknownRc8SourceError("abilityType", abilityType, oracleId);
  }
}

export function registryMetadata() {
  return {
    version: RC8_SOURCE_REGISTRY_VERSION,
    knownActionTypes: [...RC8_KNOWN_ACTION_TYPES].sort(),
    knownAbilityTypes: [...RC8_KNOWN_ABILITY_TYPES].sort(),
    knownZones: [...RC8_KNOWN_ZONES].sort(),
    policy: "Unknown source keys HARD FAIL — no silent zero features.",
  };
}
