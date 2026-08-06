import type { InventoryItem } from "../types";
import { colorIdentityKey } from "../mtg/named-color-identities";

/** Structured filters resolved from natural-language clerk questions. */
export interface StoreInventorySemanticFilter {
  cmcMin?: number;
  cmcMax?: number;
  /** Lowercase type-line fragments, e.g. instant, creature, sorcery. */
  typeIncludes?: string[];
  /** Scryfall Tagger oracle tag slugs (any match). */
  oracleTagsAny?: string[];
  /** Scryfall keyword abilities (any match). */
  keywordsAny?: string[];
  /** Fallback substring search in oracle text when tags are not backfilled yet. */
  oracleTextAny?: string[];
  /** Match card/set display names (any fragment). */
  nameIncludesAny?: string[];
  /** Exact WUBRG color identity (order-independent). */
  colorIdentityExact?: string[];
  /** Identity must include at least one of these colors (e.g. "blue cards"). */
  colorIdentityContainsAny?: string[];
  /** Every identity color must be within this set (Scryfall id<=). */
  colorIdentitySubsetOf?: string[];
  /** Identity must include all of these colors (Scryfall id>=). */
  colorIdentitySupersetOf?: string[];
  /** Exact card colors (mana symbols on card), for Scryfall c:/color: queries. */
  colorsExact?: string[];
  /** Rarity names, e.g. mythic, rare, common. */
  rarityAny?: string[];
}

export interface SemanticFilterCardFields {
  name?: string;
  setName?: string;
  colorIdentity?: string[];
  colors?: string[];
  rarity?: string;
  cmc?: number;
  typeLine?: string;
  keywords?: string[];
  oracleTags?: string[];
  oracleText?: string;
}

export function isSemanticFilterActive(
  semantic: StoreInventorySemanticFilter | undefined,
): boolean {
  if (!semantic) return false;
  return Boolean(
    semantic.cmcMin != null ||
      semantic.cmcMax != null ||
      semantic.typeIncludes?.length ||
      semantic.oracleTagsAny?.length ||
      semantic.keywordsAny?.length ||
      semantic.oracleTextAny?.length ||
      semantic.nameIncludesAny?.length ||
      semantic.colorIdentityExact?.length ||
      semantic.colorIdentityContainsAny?.length ||
      semantic.colorIdentitySubsetOf?.length ||
      semantic.colorIdentitySupersetOf?.length ||
      semantic.colorsExact?.length ||
      semantic.rarityAny?.length,
  );
}

function isSubsetOfColors(
  itemColors: string[] | undefined,
  allowed: string[],
): boolean {
  if (!itemColors?.length) return allowed.length === 0;
  const allowedSet = new Set(allowed);
  return itemColors.every((c) => allowedSet.has(c));
}

function isSupersetOfColors(
  itemColors: string[] | undefined,
  required: string[],
): boolean {
  if (!required.length) return true;
  const itemSet = new Set(itemColors ?? []);
  return required.every((c) => itemSet.has(c));
}

function containsAnyColor(
  itemColors: string[] | undefined,
  wanted: string[],
): boolean {
  if (!wanted.length) return true;
  const itemSet = new Set(itemColors ?? []);
  return wanted.some((c) => itemSet.has(c));
}

function matchesExactColorIdentity(
  itemColors: string[] | undefined,
  wanted: string[],
): boolean {
  if (!itemColors?.length) return false;
  return colorIdentityKey(itemColors) === colorIdentityKey(wanted);
}

function itemNameHaystack(item: InventoryItem): string {
  return [
    item.displayName,
    item.productName,
    item.setName,
    item.title,
    item.catalogSetCode,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function normalizeTagSlug(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

function tagMatches(wanted: string, candidate: string): boolean {
  const w = normalizeTagSlug(wanted);
  const c = normalizeTagSlug(candidate);
  return c === w || c.includes(w) || w.includes(c);
}

export function itemMatchesSemanticFilter(
  item: InventoryItem,
  semantic: StoreInventorySemanticFilter | undefined,
): boolean {
  if (!isSemanticFilterActive(semantic) || !semantic) return true;

  if (semantic.nameIncludesAny?.length) {
    const haystack = itemNameHaystack(item);
    if (
      !semantic.nameIncludesAny.some((fragment) =>
        haystack.includes(fragment.toLowerCase()),
      )
    ) {
      return false;
    }
  }

  if (semantic.colorIdentityExact != null) {
    if (semantic.colorIdentityExact.length === 0) {
      if ((item.catalogColorIdentity ?? []).length > 0) {
        return false;
      }
    } else if (
      !matchesExactColorIdentity(
        item.catalogColorIdentity,
        semantic.colorIdentityExact,
      )
    ) {
      return false;
    }
  }

  if (semantic.colorIdentityContainsAny?.length) {
    if (
      !containsAnyColor(item.catalogColorIdentity, semantic.colorIdentityContainsAny)
    ) {
      return false;
    }
  }

  if (semantic.colorIdentitySubsetOf?.length) {
    if (
      !isSubsetOfColors(item.catalogColorIdentity, semantic.colorIdentitySubsetOf)
    ) {
      return false;
    }
  }

  if (semantic.colorIdentitySupersetOf?.length) {
    if (
      !isSupersetOfColors(
        item.catalogColorIdentity,
        semantic.colorIdentitySupersetOf,
      )
    ) {
      return false;
    }
  }

  if (semantic.colorsExact?.length) {
    if (
      !matchesExactColorIdentity(item.catalogColors, semantic.colorsExact)
    ) {
      return false;
    }
  }

  if (semantic.rarityAny?.length) {
    const rarity = (item.catalogRarity ?? "").toLowerCase();
    if (
      !semantic.rarityAny.some((wanted) => rarity.includes(wanted.toLowerCase()))
    ) {
      return false;
    }
  }

  const cmc = item.catalogCmc;
  if (semantic.cmcMin != null && (cmc == null || cmc < semantic.cmcMin)) {
    return false;
  }
  if (semantic.cmcMax != null && (cmc == null || cmc > semantic.cmcMax)) {
    return false;
  }

  if (semantic.typeIncludes?.length) {
    const typeLine = (item.catalogTypeLine ?? "").toLowerCase();
    if (
      !semantic.typeIncludes.some((fragment) =>
        typeLine.includes(fragment.toLowerCase()),
      )
    ) {
      return false;
    }
  }

  if (semantic.keywordsAny?.length) {
    const keywords = (item.catalogKeywords ?? []).map((k) => k.toLowerCase());
    if (
      !semantic.keywordsAny.some((wanted) =>
        keywords.some((k) => k.includes(wanted.toLowerCase())),
      )
    ) {
      return false;
    }
  }

  if (semantic.oracleTagsAny?.length) {
    const tags = item.catalogOracleTags ?? [];
    const tagHit = semantic.oracleTagsAny.some((wanted) =>
      tags.some((tag) => tagMatches(wanted, tag)),
    );
    if (!tagHit) {
      const text = (item.catalogOracleText ?? "").toLowerCase();
      const textHit = (semantic.oracleTextAny ?? []).some((snippet) =>
        text.includes(snippet.toLowerCase()),
      );
      if (!textHit) return false;
    }
  } else if (semantic.oracleTextAny?.length) {
    const text = (item.catalogOracleText ?? "").toLowerCase();
    if (
      !semantic.oracleTextAny.some((snippet) =>
        text.includes(snippet.toLowerCase()),
      )
    ) {
      return false;
    }
  }

  return true;
}

export function cardMatchesSemanticFilter(
  card: SemanticFilterCardFields,
  semantic: StoreInventorySemanticFilter | undefined,
): boolean {
  if (!isSemanticFilterActive(semantic) || !semantic) return true;

  if (semantic.nameIncludesAny?.length) {
    const haystack = [card.name, card.setName].filter(Boolean).join(" ").toLowerCase();
    if (
      !semantic.nameIncludesAny.some((fragment) =>
        haystack.includes(fragment.toLowerCase()),
      )
    ) {
      return false;
    }
  }

  if (semantic.colorIdentityExact != null) {
    if (semantic.colorIdentityExact.length === 0) {
      if ((card.colorIdentity ?? []).length > 0) {
        return false;
      }
    } else if (
      !matchesExactColorIdentity(card.colorIdentity, semantic.colorIdentityExact)
    ) {
      return false;
    }
  }

  if (semantic.colorIdentityContainsAny?.length) {
    if (
      !containsAnyColor(card.colorIdentity, semantic.colorIdentityContainsAny)
    ) {
      return false;
    }
  }

  if (semantic.colorIdentitySubsetOf?.length) {
    if (
      !isSubsetOfColors(card.colorIdentity, semantic.colorIdentitySubsetOf)
    ) {
      return false;
    }
  }

  if (semantic.colorIdentitySupersetOf?.length) {
    if (
      !isSupersetOfColors(card.colorIdentity, semantic.colorIdentitySupersetOf)
    ) {
      return false;
    }
  }

  if (semantic.colorsExact?.length) {
    if (!matchesExactColorIdentity(card.colors, semantic.colorsExact)) {
      return false;
    }
  }

  if (semantic.rarityAny?.length) {
    const rarity = (card.rarity ?? "").toLowerCase();
    if (
      !semantic.rarityAny.some((wanted) => rarity.includes(wanted.toLowerCase()))
    ) {
      return false;
    }
  }

  if (semantic.cmcMin != null && (card.cmc == null || card.cmc < semantic.cmcMin)) {
    return false;
  }
  if (semantic.cmcMax != null && (card.cmc == null || card.cmc > semantic.cmcMax)) {
    return false;
  }

  if (semantic.typeIncludes?.length) {
    const typeLine = (card.typeLine ?? "").toLowerCase();
    if (
      !semantic.typeIncludes.some((fragment) =>
        typeLine.includes(fragment.toLowerCase()),
      )
    ) {
      return false;
    }
  }

  if (semantic.keywordsAny?.length) {
    const keywords = (card.keywords ?? []).map((k) => k.toLowerCase());
    if (
      !semantic.keywordsAny.some((wanted) =>
        keywords.some((k) => k.includes(wanted.toLowerCase())),
      )
    ) {
      return false;
    }
  }

  if (semantic.oracleTagsAny?.length) {
    const tags = card.oracleTags ?? [];
    const tagHit = semantic.oracleTagsAny.some((wanted) =>
      tags.some((tag) => tagMatches(wanted, tag)),
    );
    if (!tagHit) {
      const text = (card.oracleText ?? "").toLowerCase();
      const textHit = (semantic.oracleTextAny ?? []).some((snippet) =>
        text.includes(snippet.toLowerCase()),
      );
      if (!textHit) return false;
    }
  } else if (semantic.oracleTextAny?.length) {
    const text = (card.oracleText ?? "").toLowerCase();
    if (
      !semantic.oracleTextAny.some((snippet) =>
        text.includes(snippet.toLowerCase()),
      )
    ) {
      return false;
    }
  }

  return true;
}
