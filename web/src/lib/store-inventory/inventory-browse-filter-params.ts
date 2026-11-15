import {
  isSemanticFilterActive,
  type StoreInventorySemanticFilter,
} from "@/lib/deck-builder/store-inventory-semantic";
import { PRIMITIVE_ACTION_TYPES } from "@/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

export type InventoryBrowseGame = string;
export type InventoryBrowseSource = "inventory" | "catalog";
export type InventorySortBy =
  | "name"
  | "newest"
  | "price_asc"
  | "price_desc"
  | "cmc_asc"
  | "cmc_desc";

export type ColorMatchMode = "exact" | "including" | "atmost";

export type InventoryFinishFilter = "all" | "foil" | "nonfoil";

/** Matches `InventoryChannelFilter` in lib/inventory/status. */
export type InventoryChannelFilter = "all" | "online" | "instore";

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
  finish: InventoryFinishFilter;
  channel?: InventoryChannelFilter;
  colorMode: ColorMatchMode;
  commanderColors: string[];
  rulesText: string;
  typeLine: string;
  typeLinePartial: boolean;
  manaCost: string;
  pokemonTypes?: string[];
  pokemonCards?: string[];
  pokemonStages?: string[];
  pokemonTrainers?: string[];
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
  if (filters.finish === "foil" || filters.finish === "nonfoil") {
    params.set("finish", filters.finish);
  }
  if (filters.channel === "online" || filters.channel === "instore") {
    params.set("channel", filters.channel);
  }
  if (filters.colorMode) params.set("colorMode", filters.colorMode);
  if (filters.commanderColors.length > 0) {
    params.set("commander", filters.commanderColors.join(","));
  }
  if (filters.rulesText.trim()) params.set("oracle", filters.rulesText.trim());
  if (filters.typeLine.trim()) {
    params.set("typeLine", filters.typeLine.trim());
    if (filters.typeLinePartial) params.set("typePartial", "1");
  }
  if (filters.manaCost.trim()) params.set("mana", filters.manaCost.trim());
  if (filters.pokemonTypes?.length) params.set("pokeType", filters.pokemonTypes.join(","));
  if (filters.pokemonCards?.length) params.set("pokeCard", filters.pokemonCards.join(","));
  if (filters.pokemonStages?.length) params.set("pokeStage", filters.pokemonStages.join(","));
  if (filters.pokemonTrainers?.length) params.set("pokeTrainer", filters.pokemonTrainers.join(","));
}

const CLERK_SEARCH_BASE_KEYS = [
  "oracleTagsAny",
  "oracleTextAny",
  "keywordsAny",
  "nameIncludesAny",
  "rarityAny",
  "primitiveActions",
  "abilityTypes",
  "zones",
  "semanticOwners",
] as const satisfies readonly (keyof StoreInventorySemanticFilter)[];

/** Keep a search base across filter changes. Unknown fields are dropped. */
export function parseClerkSearchBaseParam(
  raw: string | null,
): StoreInventorySemanticFilter | undefined {
  if (!raw?.trim()) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  const src = parsed as Record<string, unknown>;
  const base: StoreInventorySemanticFilter = {};
  for (const key of CLERK_SEARCH_BASE_KEYS) {
    const value = src[key];
    if (!Array.isArray(value)) continue;
    const strings = value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0 && entry.length <= 120)
      .slice(0, 16);
    if (strings.length > 0) base[key] = strings;
  }
  if (src.primitiveActionMode === "all" || src.primitiveActionMode === "any") {
    base.primitiveActionMode = src.primitiveActionMode;
  }
  return isSemanticFilterActive(base) ? base : undefined;
}

export function appendClerkSearchBaseParam(
  params: URLSearchParams,
  base: StoreInventorySemanticFilter | undefined,
): void {
  if (!base || !isSemanticFilterActive(base)) return;
  params.set("qbase", JSON.stringify(base));
}
