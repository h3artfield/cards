import type {
  ColorCountFilter,
  StoreInventoryGameFilter,
  StoreInventoryTypeFilter,
} from "../../deck-builder/store-inventory-browse";
import {
  isSemanticFilterActive,
  type StoreInventorySemanticFilter,
} from "../../deck-builder/store-inventory-semantic";
import {
  type ParsedClerkInventoryQuery,
  parseClerkInventoryQuery,
} from "./clerk-query-parser";

/** Browse filter patch the inventory UI can apply after a clerk inventory answer. */
export type ClerkBrowseFilterPatch = {
  q: string;
  game: StoreInventoryGameFilter;
  selectedColors: string[];
  colorCount: ColorCountFilter | "all";
  cardType: StoreInventoryTypeFilter;
  /** The question named a color, so the color pips should update. */
  colorInQuery?: boolean;
  /** The question named a game. */
  gameInQuery?: boolean;
  colorMode?: "exact" | "including" | "atmost";
  commanderColors?: string[];
  typeLine?: string;
  manaValuePreset?: "0-2" | "3-4" | "5+";
  /**
   * The part of the question the filter controls cannot edit: oracle text,
   * tags, and keywords. Browse keeps this and ANDs the foil, mana, type,
   * text, color, and advanced choices on top.
   */
  baseSemantic?: StoreInventorySemanticFilter;
};

const WUBRG = new Set(["W", "U", "B", "R", "G"]);

/** True when the customer explicitly asked for commander-eligible cards only. */
export function isExplicitCommanderInventoryRequest(question: string): boolean {
  const q = question.trim();
  if (/\bcommanders?\b/i.test(q)) return true;
  if (/\bcan\s+.+?\s+be\s+(?:my|a|the)\s+commander\b/i.test(q)) return true;
  if (/\b(?:legendary|can be your commander)\b/i.test(q) && /\bcommander\b/i.test(q)) {
    return true;
  }
  return false;
}

export function resolveClerkCardTypeFilter(input: {
  userQuestion: string;
  parsed: ParsedClerkInventoryQuery;
}): StoreInventoryTypeFilter {
  if (isExplicitCommanderInventoryRequest(input.userQuestion)) return "commander";
  if (input.parsed.semantic.typeIncludes?.some((t) => t.includes("commander"))) {
    return "commander";
  }
  if (/^commanders?$/i.test(input.parsed.q ?? "")) return "commander";
  return "all";
}

function colorParamsFromSemantic(
  semantic: StoreInventorySemanticFilter,
): { selectedColors: string[]; colorCount: ColorCountFilter | "all" } {
  if (semantic.colorIdentityExact != null) {
    if (semantic.colorIdentityExact.length === 0) {
      return { selectedColors: [], colorCount: "all" };
    }
    const selectedColors = semantic.colorIdentityExact.filter((c) => WUBRG.has(c));
    return { selectedColors, colorCount: "all" };
  }
  if (semantic.colorIdentityContainsAny?.length) {
    const selectedColors = semantic.colorIdentityContainsAny.filter((c) => WUBRG.has(c));
    return { selectedColors, colorCount: "all" };
  }
  if (semantic.colorIdentitySupersetOf?.length) {
    const selectedColors = semantic.colorIdentitySupersetOf.filter((c) => WUBRG.has(c));
    return { selectedColors, colorCount: "all" };
  }
  return { selectedColors: [], colorCount: "all" };
}

function uniqStrings(...groups: Array<string[] | undefined>): string[] | undefined {
  const next = [...new Set(groups.flatMap((group) => group ?? []).filter(Boolean))];
  return next.length > 0 ? next : undefined;
}

/**
 * Constraints the search itself established. Color, mana value, and type line
 * stay on the editable controls so a later click can narrow them.
 */
export function clerkSearchBaseSemantic(
  ...sources: Array<StoreInventorySemanticFilter | undefined>
): StoreInventorySemanticFilter | undefined {
  const base: StoreInventorySemanticFilter = {};
  const oracleTagsAny = uniqStrings(...sources.map((source) => source?.oracleTagsAny));
  const oracleTextAny = uniqStrings(...sources.map((source) => source?.oracleTextAny));
  const keywordsAny = uniqStrings(...sources.map((source) => source?.keywordsAny));
  const nameIncludesAny = uniqStrings(...sources.map((source) => source?.nameIncludesAny));
  const rarityAny = uniqStrings(...sources.map((source) => source?.rarityAny));
  const primitiveActions = uniqStrings(...sources.map((source) => source?.primitiveActions));
  const abilityTypes = uniqStrings(...sources.map((source) => source?.abilityTypes));
  const zones = uniqStrings(...sources.map((source) => source?.zones));
  const semanticOwners = uniqStrings(...sources.map((source) => source?.semanticOwners));
  if (oracleTagsAny) base.oracleTagsAny = oracleTagsAny;
  if (oracleTextAny) base.oracleTextAny = oracleTextAny;
  if (keywordsAny) base.keywordsAny = keywordsAny;
  if (nameIncludesAny) base.nameIncludesAny = nameIncludesAny;
  if (rarityAny) base.rarityAny = rarityAny;
  if (primitiveActions) {
    base.primitiveActions = primitiveActions;
    base.primitiveActionMode = sources.find((source) => source?.primitiveActionMode)?.primitiveActionMode;
  }
  if (abilityTypes) base.abilityTypes = abilityTypes;
  if (zones) base.zones = zones;
  if (semanticOwners) base.semanticOwners = semanticOwners;
  return isSemanticFilterActive(base) ? base : undefined;
}

/** Map clerk parsed query → same browse params the filter bar uses. */
export function clerkQueryToBrowseFilterPatch(input: {
  userQuestion: string;
  conversationSummary?: string;
  cardType?: StoreInventoryTypeFilter;
  /** Semantic the inventory search actually ran, including a later reinterpretation. */
  semantic?: StoreInventorySemanticFilter;
}): ClerkBrowseFilterPatch {
  const parsed = parseClerkInventoryQuery({
    userQuestion: input.userQuestion,
    conversationSummary: input.conversationSummary,
  });
  const cardType =
    input.cardType ?? resolveClerkCardTypeFilter({ userQuestion: input.userQuestion, parsed });
  const colorParams = colorParamsFromSemantic(parsed.semantic);
  const commanderColors = (parsed.semantic.colorIdentitySubsetOf ?? []).filter((c) =>
    WUBRG.has(c),
  );

  let colorCount = colorParams.colorCount;
  if (parsed.color === "multicolor") colorCount = "multicolor";
  else if (parsed.color === "two") colorCount = "two";
  else if (parsed.color === "three") colorCount = "three";
  else if (parsed.color === "C") {
    colorParams.selectedColors = ["C"];
    colorCount = "all";
  } else if (parsed.color && WUBRG.has(parsed.color) && colorParams.selectedColors.length === 0) {
    colorParams.selectedColors = [parsed.color];
  }

  let colorMode: ClerkBrowseFilterPatch["colorMode"];
  if (parsed.semantic.colorIdentityExact?.length || parsed.semantic.colorsExact?.length) {
    colorMode = "exact";
  } else if (
    parsed.semantic.colorIdentityContainsAny?.length ||
    parsed.semantic.colorIdentitySupersetOf?.length
  ) {
    colorMode = "including";
  } else if (colorParams.selectedColors.length > 0) {
    colorMode = "exact";
  }

  const typeLine = parsed.semantic.typeIncludes?.filter(Boolean).join(" ");
  const manaValuePreset = manaValuePresetFromRange(
    parsed.semantic.cmcMin,
    parsed.semantic.cmcMax,
  );

  return {
    q: parsed.semanticOnly ? "" : (parsed.q ?? ""),
    game: (parsed.browseGame ?? "magic") as StoreInventoryGameFilter,
    selectedColors: colorParams.selectedColors,
    colorCount,
    cardType,
    colorInQuery: colorParams.selectedColors.length > 0 || colorCount !== "all",
    gameInQuery: Boolean(parsed.browseGame),
    colorMode,
    commanderColors: commanderColors.length > 0 ? commanderColors : undefined,
    typeLine: typeLine || undefined,
    manaValuePreset,
    baseSemantic: clerkSearchBaseSemantic(parsed.semantic, input.semantic),
  };
}

function manaValuePresetFromRange(
  cmcMin?: number,
  cmcMax?: number,
): "0-2" | "3-4" | "5+" | undefined {
  if (cmcMin == null && cmcMax == null) return undefined;
  if ((cmcMin == null || cmcMin <= 0) && cmcMax != null && cmcMax <= 2) return "0-2";
  if (cmcMin === 3 && cmcMax === 4) return "3-4";
  if (cmcMin != null && cmcMin >= 5 && cmcMax == null) return "5+";
  return undefined;
}

export function browseColorParamsFromClerkSemantic(
  semantic?: StoreInventorySemanticFilter,
): { selectedColors?: string[]; colorCount?: ColorCountFilter | "all" } {
  if (!semantic) return {};
  const params = colorParamsFromSemantic(semantic);
  if (params.selectedColors.length === 0 && params.colorCount === "all") return {};
  return params;
}
