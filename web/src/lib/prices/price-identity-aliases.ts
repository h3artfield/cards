import type { CardPriceSnapshotCategory } from "./types";

/** Slug form used in identity keys (paldea-evolved, sv2, …). */
export function normalizeSetSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Equivalent Pokémon set identifiers — TCG API codes, PriceCharting slugs, set names.
 * Derived from catalog metadata in pokemon-utils + Scarlet/Violet era codes.
 */
const POKEMON_SET_ALIAS_GROUPS: string[][] = [
  ["sv1", "sv01", "scarlet-violet", "scarlet-and-violet"],
  ["sv2", "sv02", "paldea-evolved"],
  ["sv3", "sv03", "obsidian-flames"],
  ["sv4", "sv04", "paradox-rift"],
  ["sv4pt5", "paldean-fates"],
  ["sv5", "sv05", "temporal-forces"],
  ["sv6", "sv06", "twilight-masquerade"],
  ["swsh07", "evolving-skies"],
  ["swsh08", "fusion-strike"],
  ["swsh09", "brilliant-stars"],
  ["swsh10", "astral-radiance"],
  ["swsh11", "lost-origin"],
  ["swsh12pt5", "crown-zenith"],
];

const pokemonAliasIndex = new Map<string, Set<string>>();

function buildPokemonAliasIndex(): Map<string, Set<string>> {
  if (pokemonAliasIndex.size > 0) return pokemonAliasIndex;

  for (const group of POKEMON_SET_ALIAS_GROUPS) {
    const slugs = group.map(normalizeSetSlug);
    const aliasSet = new Set(slugs);
    for (const slug of slugs) {
      pokemonAliasIndex.set(slug, aliasSet);
    }
  }
  return pokemonAliasIndex;
}

function pokemonSetAliases(setPart: string): string[] {
  const slug = normalizeSetSlug(setPart);
  const index = buildPokemonAliasIndex();
  const group = index.get(slug);
  if (!group) return [slug];
  return [...group];
}

export type ParsedIdentityKey = {
  category: CardPriceSnapshotCategory;
  setPart?: string;
  collectorNumber?: string;
  finish?: string;
  treatment?: string;
  language?: string;
  tail: string[];
};

export function parseIdentityKey(identityKey: string): ParsedIdentityKey | null {
  const parts = identityKey.split("|");
  if (parts.length < 3) return null;
  const category = parts[0] as CardPriceSnapshotCategory;

  if (category === "pokemon") {
    return {
      category,
      setPart: parts[1],
      collectorNumber: parts[2],
      finish: parts[3],
      language: parts[4],
      tail: parts.slice(5),
    };
  }
  if (category === "mtg") {
    return {
      category,
      setPart: parts[1],
      collectorNumber: parts[2],
      finish: parts[3],
      treatment: parts[4],
      language: parts[5],
      tail: parts.slice(6),
    };
  }
  if (category === "yugioh" || category === "onepiece") {
    return {
      category,
      setPart: parts[1],
      collectorNumber: parts[2],
      language: parts[3],
      tail: parts.slice(4),
    };
  }
  return { category, tail: parts.slice(1) };
}

function rebuildIdentityKey(parsed: ParsedIdentityKey, setPart: string): string {
  if (parsed.category === "pokemon") {
    return [
      "pokemon",
      setPart,
      parsed.collectorNumber ?? "",
      parsed.finish ?? "unknown",
      parsed.language ?? "en",
      ...parsed.tail,
    ].join("|");
  }
  if (parsed.category === "mtg") {
    return [
      "mtg",
      setPart.toUpperCase(),
      parsed.collectorNumber ?? "",
      parsed.finish ?? "nonfoil",
      parsed.treatment ?? "normal",
      parsed.language ?? "en",
      ...parsed.tail,
    ].join("|");
  }
  if (parsed.category === "yugioh" || parsed.category === "onepiece") {
    return [
      parsed.category,
      setPart,
      parsed.collectorNumber ?? "",
      parsed.language ?? "en",
      ...parsed.tail,
    ].join("|");
  }
  return [parsed.category, setPart, ...parsed.tail].join("|");
}

/** Expand one identity key with known equivalent keys (same card, different set slug/code). */
export function expandIdentityKeyAliases(identityKey: string): string[] {
  const keys = new Set<string>([identityKey]);
  const parsed = parseIdentityKey(identityKey);
  if (!parsed?.setPart) return [identityKey];

  if (parsed.category === "pokemon" && parsed.collectorNumber) {
    for (const alias of pokemonSetAliases(parsed.setPart)) {
      keys.add(rebuildIdentityKey(parsed, alias));
    }
  }

  return [...keys];
}

export function resolvePriceHistoryLookupKeys(input: {
  identityKey: string | null;
  category?: CardPriceSnapshotCategory;
  setCode?: string;
  setName?: string;
  collectorNumber?: string;
  finish?: string;
  treatment?: string;
  language?: string;
}): string[] {
  const keys = new Set<string>();

  if (input.identityKey) {
    for (const k of expandIdentityKeyAliases(input.identityKey)) {
      keys.add(k);
    }
  }

  if (
    input.category === "pokemon" &&
    input.collectorNumber &&
    (input.setCode || input.setName)
  ) {
    const finish = (input.finish ?? "unknown").toLowerCase().replace(/\s+/g, "_");
    const lang = (input.language ?? "en").toLowerCase().startsWith("jp") ? "jp" : "en";
    const setSources = [input.setCode, input.setName].filter(Boolean) as string[];
    for (const src of setSources) {
      for (const alias of pokemonSetAliases(src)) {
        keys.add(
          ["pokemon", alias, input.collectorNumber.replace(/^#/, ""), finish, lang].join("|"),
        );
      }
    }
  }

  return [...keys];
}

export type PriceHistoryEmptyReason =
  | "no_identity"
  | "no_snapshots_for_exact_identity"
  | "no_alias_matched"
  | "source_absent_from_feed";

export function describePriceHistoryEmptyReason(input: {
  requestedIdentityKey: string | null;
  lookupKeys: string[];
  matchedKeys: string[];
}): PriceHistoryEmptyReason {
  if (!input.requestedIdentityKey || input.lookupKeys.length === 0) {
    return "no_identity";
  }
  if (input.requestedIdentityKey.startsWith("mtg|MAR|")) {
    return "source_absent_from_feed";
  }
  if (input.lookupKeys.length > 1 && input.matchedKeys.length === 0) {
    return "no_alias_matched";
  }
  return "no_snapshots_for_exact_identity";
}
