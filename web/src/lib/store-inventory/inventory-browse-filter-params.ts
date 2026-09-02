import type { StoreInventorySemanticFilter } from "@/lib/deck-builder/store-inventory-semantic";
import { PRIMITIVE_ACTION_TYPES } from "@/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

export type InventoryBrowseGame = "magic" | "pokemon" | "riftbound";
export type InventoryBrowseSource = "inventory" | "catalog";
export type InventorySortBy =
  | "name"
  | "price_asc"
  | "price_desc"
  | "cmc_asc"
  | "cmc_desc";

export type InventoryBrowseFilterParams = {
  cardTypes: string[];
  oracleActions: string[];
  primitiveActions: string[];
  primitiveActionMode: "any" | "all";
  abilityTypes: string[];
  zones: string[];
  semanticOwners: string[];
  manaValuePreset: "all" | "0-2" | "3-4" | "5+";
  sortBy: InventorySortBy;
};

export const INVENTORY_PRIMITIVE_ACTION_OPTIONS = [...PRIMITIVE_ACTION_TYPES] as const;

export const INVENTORY_SEMANTIC_ABILITY_TYPES = [
  "triggered",
  "activated",
  "static",
  "replacement",
  "modal",
  "loyalty",
  "spell_effect",
] as const;

export const INVENTORY_SEMANTIC_ZONES = [
  "hand",
  "library",
  "graveyard",
  "battlefield",
  "exile",
  "stack",
] as const;

export const INVENTORY_SEMANTIC_OWNERS = [
  "source_card",
  "granted_object",
  "created_object",
  "granted_ability",
] as const;

export const INVENTORY_CARD_TYPE_OPTIONS = [
  "Creature",
  "Instant",
  "Sorcery",
  "Artifact",
  "Enchantment",
  "Planeswalker",
  "Land",
  "Battle",
] as const;

export type InventoryOracleActionChip = {
  id: string;
  label: string;
  tags: string[];
  oracleTextAny?: string[];
};

/** Curated oracle-tag action chips for inventory browse (Scryfall Tagger + text fallback). */
export const INVENTORY_ORACLE_ACTION_CHIPS: InventoryOracleActionChip[] = [
  {
    id: "ramp",
    label: "Ramp",
    tags: ["ramp"],
    oracleTextAny: ["search your library for a land", "add {", "add one mana of any"],
  },
  {
    id: "draw",
    label: "Draw",
    tags: ["draw"],
    oracleTextAny: ["draw a card", "draw two cards", "draw three cards"],
  },
  {
    id: "removal",
    label: "Removal",
    tags: ["removal"],
  },
  {
    id: "counterspell",
    label: "Counter",
    tags: ["counterspell"],
  },
  {
    id: "tutor",
    label: "Tutor",
    tags: ["tutor"],
    oracleTextAny: ["search your library for"],
  },
  {
    id: "board-wipe",
    label: "Board wipe",
    tags: ["board-wipe"],
    oracleTextAny: ["destroy all creatures", "destroy all permanents", "destroy all nonland permanents"],
  },
  {
    id: "reanimation",
    label: "Reanimation",
    tags: ["reanimation"],
    oracleTextAny: ["return target creature card from your graveyard", "return creature card from your graveyard"],
  },
  {
    id: "graveyard-hate",
    label: "Graveyard hate",
    tags: ["graveyard-hate"],
    oracleTextAny: ["exile target player's graveyard", "exile all cards from all graveyards"],
  },
];

export type InventoryManaValuePreset = "all" | "0-2" | "3-4" | "5+";

export function manaValuePresetToRange(
  preset: InventoryManaValuePreset,
): { cmcMin?: number; cmcMax?: number } {
  switch (preset) {
    case "0-2":
      return { cmcMin: 0, cmcMax: 2 };
    case "3-4":
      return { cmcMin: 3, cmcMax: 4 };
    case "5+":
      return { cmcMin: 5 };
    default:
      return {};
  }
}

export function inventoryAdvancedFiltersActive(
  filters: Pick<
    InventoryBrowseFilterParams,
    | "cardTypes"
    | "oracleActions"
    | "primitiveActions"
    | "abilityTypes"
    | "zones"
    | "semanticOwners"
    | "manaValuePreset"
  > & { cardType?: "all" | "commander" },
): boolean {
  return (
    filters.cardTypes.length > 0 ||
    filters.oracleActions.length > 0 ||
    filters.primitiveActions.length > 0 ||
    filters.abilityTypes.length > 0 ||
    filters.zones.length > 0 ||
    filters.semanticOwners.length > 0 ||
    filters.manaValuePreset !== "all" ||
    filters.cardType === "commander"
  );
}

export function buildInventorySemanticFilter(
  filters: Pick<
    InventoryBrowseFilterParams,
    | "cardTypes"
    | "oracleActions"
    | "primitiveActions"
    | "primitiveActionMode"
    | "abilityTypes"
    | "zones"
    | "semanticOwners"
    | "manaValuePreset"
  >,
): StoreInventorySemanticFilter | undefined {
  const semantic: StoreInventorySemanticFilter = {};
  const mv = manaValuePresetToRange(filters.manaValuePreset);
  if (mv.cmcMin != null) semantic.cmcMin = mv.cmcMin;
  if (mv.cmcMax != null) semantic.cmcMax = mv.cmcMax;

  if (filters.cardTypes.length > 0) {
    semantic.typeIncludes = filters.cardTypes.map((t) => t.toLowerCase());
  }

  if (filters.oracleActions.length > 0) {
    const tags = new Set<string>();
    const oracleTextAny = new Set<string>();
    for (const actionId of filters.oracleActions) {
      const chip = INVENTORY_ORACLE_ACTION_CHIPS.find((c) => c.id === actionId);
      if (!chip) continue;
      for (const tag of chip.tags) tags.add(tag);
      for (const text of chip.oracleTextAny ?? []) oracleTextAny.add(text);
    }
    if (tags.size > 0) semantic.oracleTagsAny = [...tags];
    if (oracleTextAny.size > 0) semantic.oracleTextAny = [...oracleTextAny];
  }

  if (filters.primitiveActions.length > 0) {
    semantic.primitiveActions = [...filters.primitiveActions];
    semantic.primitiveActionMode = filters.primitiveActionMode;
  }
  if (filters.abilityTypes.length > 0) {
    semantic.abilityTypes = [...filters.abilityTypes];
  }
  if (filters.zones.length > 0) semantic.zones = [...filters.zones];
  if (filters.semanticOwners.length > 0) {
    semantic.semanticOwners = [...filters.semanticOwners];
  }

  if (
    semantic.cmcMin == null &&
    semantic.cmcMax == null &&
    !semantic.typeIncludes?.length &&
    !semantic.oracleTagsAny?.length &&
    !semantic.primitiveActions?.length &&
    !semantic.abilityTypes?.length &&
    !semantic.zones?.length &&
    !semantic.semanticOwners?.length
  ) {
    return undefined;
  }
  return semantic;
}

export function appendInventoryBrowseParams(
  params: URLSearchParams,
  filters: InventoryBrowseFilterParams,
  query: string,
): void {
  if (query) params.set("q", query);
  if (filters.sortBy !== "name") params.set("sort", filters.sortBy);
  if (filters.cardTypes.length > 0) {
    params.set("types", filters.cardTypes.map((t) => t.toLowerCase()).join(","));
  }
  if (filters.oracleActions.length > 0) {
    params.set("actions", filters.oracleActions.join(","));
  }
  if (filters.primitiveActions.length > 0) {
    params.set("semActions", filters.primitiveActions.join(","));
    if (filters.primitiveActionMode === "all") params.set("semMode", "all");
  }
  if (filters.abilityTypes.length > 0) {
    params.set("semAbility", filters.abilityTypes.join(","));
  }
  if (filters.zones.length > 0) {
    params.set("semZones", filters.zones.join(","));
  }
  if (filters.semanticOwners.length > 0) {
    params.set("semOwners", filters.semanticOwners.join(","));
  }
  if (filters.manaValuePreset !== "all") {
    params.set("mv", filters.manaValuePreset);
  }
}
