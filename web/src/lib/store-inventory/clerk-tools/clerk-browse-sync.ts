import type {
  ColorCountFilter,
  StoreInventoryGameFilter,
  StoreInventoryTypeFilter,
} from "../../deck-builder/store-inventory-browse";
import type { StoreInventorySemanticFilter } from "../../deck-builder/store-inventory-semantic";
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

/** Map clerk parsed query → same browse params the filter bar uses. */
export function clerkQueryToBrowseFilterPatch(input: {
  userQuestion: string;
  conversationSummary?: string;
  cardType?: StoreInventoryTypeFilter;
}): ClerkBrowseFilterPatch {
  const parsed = parseClerkInventoryQuery({
    userQuestion: input.userQuestion,
    conversationSummary: input.conversationSummary,
  });
  const cardType =
    input.cardType ?? resolveClerkCardTypeFilter({ userQuestion: input.userQuestion, parsed });
  const colorParams = colorParamsFromSemantic(parsed.semantic);

  let colorCount = colorParams.colorCount;
  if (parsed.color === "multicolor") colorCount = "multicolor";
  else if (parsed.color === "two") colorCount = "two";
  else if (parsed.color === "three") colorCount = "three";
  else if (parsed.color === "C") {
    return {
      q: parsed.q ?? "",
      game: (parsed.browseGame ?? "magic") as StoreInventoryGameFilter,
      selectedColors: [],
      colorCount: "all",
      cardType,
    };
  } else if (parsed.color && WUBRG.has(parsed.color) && colorParams.selectedColors.length === 0) {
    colorParams.selectedColors = [parsed.color];
  }

  return {
    q: parsed.semanticOnly ? "" : (parsed.q ?? ""),
    game: (parsed.browseGame ?? "magic") as StoreInventoryGameFilter,
    selectedColors: colorParams.selectedColors,
    colorCount,
    cardType,
  };
}

export function browseColorParamsFromClerkSemantic(
  semantic?: StoreInventorySemanticFilter,
): { selectedColors?: string[]; colorCount?: ColorCountFilter | "all" } {
  if (!semantic) return {};
  const params = colorParamsFromSemantic(semantic);
  if (params.selectedColors.length === 0 && params.colorCount === "all") return {};
  return params;
}
