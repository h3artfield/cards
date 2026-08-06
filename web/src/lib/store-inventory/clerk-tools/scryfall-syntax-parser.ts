import type { StoreInventoryColorFilter } from "../../deck-builder/store-inventory-browse";
import type { StoreInventorySemanticFilter } from "../../deck-builder/store-inventory-semantic";
import {
  colorIdentityKey,
  parseNamedColorIdentityFromText,
} from "../../mtg/named-color-identities";
import type { ParsedClerkInventoryQuery } from "./clerk-query-parser";

export interface ScryfallInventoryParseResult extends ParsedClerkInventoryQuery {
  cardTypeCommander?: boolean;
}

const SCRYFALL_COMPARISON =
  /\b(mv|manavalue|cmc|pow|power|tou|toughness|usd|eur)(>=|<=|!=|>|<|=)(\d+(?:\.\d+)?)\b/gi;

const SCRYFALL_COLOR_COMPARISON =
  /\b(id|identity|c|color)(>=|<=|!=|>|<|=)([^\s]+)/gi;

const SCRYFALL_TOKEN =
  /!?-?(?:id|identity|c|color|t|type|o|oracle|fo|fulloracle|kw|keyword|mv|manavalue|m|f|format|e|set|edition|s|r|rarity|function|otag|oracletag|is|not|pow|power|tou|toughness|usd|eur|a|artist):(?:"[^"]+"|[^\s"]+)|![^\s"]+|"[^"]+"|[^\s]+/gi;

const SCRYFALL_HINT =
  /\b(?:id|identity|c|color|t|type|o|oracle|kw|keyword|mv|manavalue|cmc|f|format|e|set|edition|s|r|rarity|function|otag|oracletag|is|not)\b|[!]/i;

const LETTER_TO_COLOR: Record<string, string> = {
  w: "W",
  u: "U",
  b: "B",
  r: "R",
  g: "G",
};

const COLOR_NAME_TO_LETTER: Record<string, string> = {
  white: "W",
  blue: "U",
  black: "B",
  red: "R",
  green: "G",
};

function mergeSemantic(
  base: StoreInventorySemanticFilter,
  patch: StoreInventorySemanticFilter,
): StoreInventorySemanticFilter {
  return {
    cmcMin: patch.cmcMin ?? base.cmcMin,
    cmcMax: patch.cmcMax ?? base.cmcMax,
    typeIncludes: [...new Set([...(base.typeIncludes ?? []), ...(patch.typeIncludes ?? [])])],
    oracleTagsAny: [...new Set([...(base.oracleTagsAny ?? []), ...(patch.oracleTagsAny ?? [])])],
    keywordsAny: [...new Set([...(base.keywordsAny ?? []), ...(patch.keywordsAny ?? [])])],
    oracleTextAny: [...new Set([...(base.oracleTextAny ?? []), ...(patch.oracleTextAny ?? [])])],
    nameIncludesAny: [...new Set([...(base.nameIncludesAny ?? []), ...(patch.nameIncludesAny ?? [])])],
    colorIdentityExact:
      patch.colorIdentityExact !== undefined
        ? patch.colorIdentityExact
        : base.colorIdentityExact,
    colorIdentityContainsAny:
      patch.colorIdentityContainsAny ?? base.colorIdentityContainsAny,
    colorIdentitySubsetOf: patch.colorIdentitySubsetOf ?? base.colorIdentitySubsetOf,
    colorIdentitySupersetOf: patch.colorIdentitySupersetOf ?? base.colorIdentitySupersetOf,
    colorsExact: patch.colorsExact ?? base.colorsExact,
    rarityAny: [...new Set([...(base.rarityAny ?? []), ...(patch.rarityAny ?? [])])],
  };
}

function parseColorLetters(raw: string): string[] | undefined {
  const text = raw.trim().toLowerCase();
  if (!text) return undefined;

  const named = parseNamedColorIdentityFromText(text);
  if (named) return named.colors;

  if (text === "c" || text === "colorless") return [];
  if (text === "m" || text === "multicolor") return undefined;

  const letters: string[] = [];
  for (const char of text.replace(/[^wubrg]/gi, "")) {
    const color = LETTER_TO_COLOR[char.toLowerCase()];
    if (color) letters.push(color);
  }
  if (letters.length > 0) return [...new Set(letters)];

  const byName = COLOR_NAME_TO_LETTER[text];
  if (byName) return [byName];

  return undefined;
}

function parseNumericComparison(raw: string): { op: string; value: number } | null {
  const match = raw.trim().match(/^(>=|<=|!=|>|<|=)?\s*(\d+(?:\.\d+)?)/);
  if (!match?.[2]) return null;
  return { op: match[1] || "=", value: Number.parseFloat(match[2]) };
}

function applyManaValueFilter(
  semantic: StoreInventorySemanticFilter,
  raw: string,
): StoreInventorySemanticFilter {
  const cmp = parseNumericComparison(raw);
  if (!cmp) return semantic;

  if (cmp.op === ">" || cmp.op === ">=") {
    const min = cmp.op === ">" ? cmp.value + 1 : cmp.value;
    return { ...semantic, cmcMin: Math.max(semantic.cmcMin ?? 0, min) };
  }
  if (cmp.op === "<" || cmp.op === "<=") {
    const max = cmp.op === "<" ? cmp.value - 1 : cmp.value;
    return {
      ...semantic,
      cmcMax: semantic.cmcMax == null ? max : Math.min(semantic.cmcMax, max),
    };
  }
  if (cmp.op === "=" || cmp.op === "") {
    return { ...semantic, cmcMin: cmp.value, cmcMax: cmp.value };
  }
  return semantic;
}

function applyColorIdentityFilter(
  semantic: StoreInventorySemanticFilter,
  input: { op: string; colors: string[]; key: "id" | "c" },
): StoreInventorySemanticFilter {
  const { op, colors, key } = input;
  if (key === "c") {
    if (colors.length === 0) return semantic;
    if (colors.length === 1 && (op === "=" || op === "")) {
      return semantic;
    }
    if (op === "=" || op === "") {
      return mergeSemantic(semantic, { colorsExact: colors });
    }
    return semantic;
  }

  if (op === "<=" || op === "<") {
    return mergeSemantic(semantic, { colorIdentitySubsetOf: colors });
  }
  if (op === ">=" || op === ">") {
    return mergeSemantic(semantic, { colorIdentitySupersetOf: colors });
  }
  if (op === "=" || op === "") {
    return mergeSemantic(semantic, { colorIdentityExact: colors });
  }
  return semantic;
}

function normalizeRarity(raw: string): string {
  const lower = raw.trim().toLowerCase();
  if (lower.startsWith("m")) return "mythic";
  if (lower.startsWith("r") && lower !== "rare") return lower;
  if (lower === "r") return "rare";
  return lower;
}

/** True when the query uses Scryfall-style search tokens. */
export function looksLikeScryfallSyntax(question: string): boolean {
  return (
    SCRYFALL_HINT.test(question) ||
    /![A-Za-z"]/.test(question)
  );
}

function tokenizeScryfallQuery(question: string): string[] {
  return [...question.matchAll(SCRYFALL_TOKEN)].map((match) => match[0]?.trim()).filter(Boolean);
}

/** Parse Scryfall search syntax into clerk inventory params. */
export function parseScryfallInventoryQuery(
  question: string,
): ScryfallInventoryParseResult | null {
  if (!looksLikeScryfallSyntax(question)) return null;

  const exactQuoted = question.match(/!"([^"]+)"/);
  if (exactQuoted?.[1]) {
    return {
      q: exactQuoted[1],
      semantic: {},
      semanticOnly: false,
      browseGame: "magic",
      searchLimit: 24,
    };
  }

  const exactUnquoted = question.match(/!\s*([A-Za-z0-9',\-]+(?:\s+[A-Za-z0-9',\-]+)*)/);
  if (exactUnquoted?.[1] && !/[: ]/.test(exactUnquoted[1]) === false) {
    const candidate = exactUnquoted[1].trim();
    if (candidate && !candidate.includes(":")) {
      const remainder = question.slice((exactUnquoted.index ?? 0) + exactUnquoted[0].length);
      if (!remainder.trim() || !SCRYFALL_HINT.test(remainder)) {
        return {
          q: candidate,
          semantic: {},
          semanticOnly: false,
          browseGame: "magic",
          searchLimit: 24,
        };
      }
    }
  }

  let semantic: StoreInventorySemanticFilter = {};
  let q: string | undefined;
  let color: StoreInventoryColorFilter | undefined;
  let colorIdentityLabel: string | undefined;
  let cardTypeCommander = false;
  const looseWords: string[] = [];

  for (const match of question.matchAll(SCRYFALL_COMPARISON)) {
    const key = match[1]?.toLowerCase();
    const op = match[2] ?? "=";
    const value = match[3];
    if (!key || !value) continue;
    if (key === "mv" || key === "manavalue" || key === "cmc") {
      semantic = applyManaValueFilter(semantic, `${op}${value}`);
    }
  }

  for (const match of question.matchAll(SCRYFALL_COLOR_COMPARISON)) {
    const key = match[1]?.toLowerCase();
    const op = match[2] ?? "=";
    const rawValue = match[3]?.trim();
    if (!key || !rawValue) continue;
    const colors = parseColorLetters(rawValue);
    if (!colors) continue;
    const named = parseNamedColorIdentityFromText(rawValue);
    if (named) colorIdentityLabel = named.label;
    if (key === "id" || key === "identity") {
      semantic = applyColorIdentityFilter(semantic, {
        op,
        colors,
        key: "id",
      });
    } else if (key === "c" || key === "color") {
      if (colors.length === 0) {
        color = "C";
      } else if (colors.length === 1 && (op === "=" || op === "")) {
        color = colors[0] as StoreInventoryColorFilter;
      } else {
        semantic = applyColorIdentityFilter(semantic, {
          op,
          colors,
          key: "c",
        });
      }
    }
  }

  for (const token of tokenizeScryfallQuery(question)) {
    if (token.startsWith("!")) {
      q = token.slice(1).replace(/^"|"$/g, "");
      continue;
    }

    const negated = token.startsWith("-");
    const normalized = negated ? token.slice(1) : token;
    const colon = normalized.indexOf(":");
    if (colon <= 0) {
      looseWords.push(token.replace(/^"|"$/g, ""));
      continue;
    }

    const key = normalized.slice(0, colon).toLowerCase();
    const rawValue = normalized
      .slice(colon + 1)
      .replace(/^"|"$/g, "")
      .trim();
    if (!rawValue || negated) continue;

    switch (key) {
      case "id":
      case "identity": {
        const colors = parseColorLetters(rawValue);
        if (colors) {
          semantic = applyColorIdentityFilter(semantic, {
            op: "=",
            colors,
            key: "id",
          });
          const named = parseNamedColorIdentityFromText(rawValue);
          if (named) colorIdentityLabel = named.label;
        }
        break;
      }
      case "c":
      case "color": {
        const colors = parseColorLetters(rawValue);
        if (colors) {
          if (colors.length === 0) {
            color = "C";
          } else if (colors.length === 1) {
            color = colors[0] as StoreInventoryColorFilter;
          } else {
            semantic = mergeSemantic(semantic, { colorsExact: colors });
          }
        } else if (rawValue.toLowerCase() === "multicolor") {
          color = "multicolor";
        }
        break;
      }
      case "t":
      case "type":
        semantic = mergeSemantic(semantic, {
          typeIncludes: [rawValue.toLowerCase()],
        });
        break;
      case "o":
      case "oracle":
      case "fo":
      case "fulloracle":
        semantic = mergeSemantic(semantic, {
          oracleTextAny: [rawValue.toLowerCase()],
        });
        break;
      case "kw":
      case "keyword":
        semantic = mergeSemantic(semantic, {
          keywordsAny: [rawValue],
        });
        break;
      case "function":
      case "otag":
      case "oracletag":
        semantic = mergeSemantic(semantic, {
          oracleTagsAny: [rawValue.toLowerCase().replace(/\s+/g, "-")],
        });
        break;
      case "mv":
      case "manavalue":
      case "m":
        if (/^\d/.test(rawValue) || /^[<>=!]/.test(rawValue)) {
          semantic = applyManaValueFilter(semantic, rawValue);
        }
        break;
      case "e":
      case "set":
      case "edition":
      case "s":
        q = rawValue;
        break;
      case "r":
      case "rarity":
        semantic = mergeSemantic(semantic, {
          rarityAny: [normalizeRarity(rawValue)],
        });
        break;
      case "is":
      case "not":
        if (rawValue.toLowerCase() === "commander") {
          cardTypeCommander = key !== "not";
        }
        break;
      case "usd":
      case "eur":
        break;
      default:
        looseWords.push(rawValue);
    }
  }

  if (!q && looseWords.length > 0) {
    q = looseWords.join(" ").trim() || undefined;
  }

  const hasSemantic = Boolean(
    semantic.cmcMin != null ||
      semantic.cmcMax != null ||
      semantic.typeIncludes?.length ||
      semantic.oracleTagsAny?.length ||
      semantic.keywordsAny?.length ||
      semantic.oracleTextAny?.length ||
      semantic.colorIdentityExact?.length ||
      semantic.colorIdentityContainsAny?.length ||
      semantic.colorIdentitySubsetOf?.length ||
      semantic.colorIdentitySupersetOf?.length ||
      semantic.colorsExact?.length ||
      semantic.rarityAny?.length,
  );

  const semanticOnly = hasSemantic && !q;

  if (!hasSemantic && !q) return null;

  return {
    q,
    color,
    semantic,
    semanticOnly,
    browseGame: "magic",
    colorIdentityLabel,
    searchLimit: 96,
    cardTypeCommander,
  };
}

export function parsedQuerySignature(parsed: ParsedClerkInventoryQuery): string {
  return JSON.stringify({
    q: parsed.q,
    color: parsed.color,
    semantic: parsed.semantic,
    semanticOnly: parsed.semanticOnly,
    browseGame: parsed.browseGame,
  });
}

export function isSameInventoryParse(
  a: ParsedClerkInventoryQuery,
  b: ParsedClerkInventoryQuery,
): boolean {
  return parsedQuerySignature(a) === parsedQuerySignature(b);
}

/** Merge Scryfall parse into an existing parse when syntax tokens are present. */
export function mergeScryfallIntoParsedQuery(
  base: ParsedClerkInventoryQuery,
  question: string,
): ParsedClerkInventoryQuery {
  const scryfall = parseScryfallInventoryQuery(question);
  if (!scryfall) return base;

  return {
    ...base,
    q: scryfall.q ?? base.q,
    color: scryfall.color ?? base.color,
    semantic: {
      ...base.semantic,
      ...scryfall.semantic,
      typeIncludes: [
        ...new Set([
          ...(base.semantic.typeIncludes ?? []),
          ...(scryfall.semantic.typeIncludes ?? []),
        ]),
      ],
      oracleTagsAny: [
        ...new Set([
          ...(base.semantic.oracleTagsAny ?? []),
          ...(scryfall.semantic.oracleTagsAny ?? []),
        ]),
      ],
      keywordsAny: [
        ...new Set([
          ...(base.semantic.keywordsAny ?? []),
          ...(scryfall.semantic.keywordsAny ?? []),
        ]),
      ],
      oracleTextAny: [
        ...new Set([
          ...(base.semantic.oracleTextAny ?? []),
          ...(scryfall.semantic.oracleTextAny ?? []),
        ]),
      ],
      colorIdentityExact:
        scryfall.semantic.colorIdentityExact ?? base.semantic.colorIdentityExact,
      colorsExact: scryfall.semantic.colorsExact ?? base.semantic.colorsExact,
      rarityAny: [
        ...new Set([
          ...(base.semantic.rarityAny ?? []),
          ...(scryfall.semantic.rarityAny ?? []),
        ]),
      ],
      cmcMin: scryfall.semantic.cmcMin ?? base.semantic.cmcMin,
      cmcMax: scryfall.semantic.cmcMax ?? base.semantic.cmcMax,
    },
    semanticOnly: scryfall.semanticOnly || base.semanticOnly,
    colorIdentityLabel: scryfall.colorIdentityLabel ?? base.colorIdentityLabel,
    searchLimit: Math.max(base.searchLimit ?? 0, scryfall.searchLimit ?? 0) || undefined,
    browseGame: base.browseGame ?? scryfall.browseGame,
  };
}

export function describeScryfallParse(parsed: ParsedClerkInventoryQuery): string {
  const parts: string[] = [];
  if (parsed.semantic.colorIdentitySubsetOf?.length) {
    parts.push(`identity<=${colorIdentityKey(parsed.semantic.colorIdentitySubsetOf)}`);
  }
  if (parsed.semantic.colorIdentityExact?.length) {
    parts.push(`identity ${colorIdentityKey(parsed.semantic.colorIdentityExact)}`);
  }
  if (parsed.semantic.colorsExact?.length) {
    parts.push(`colors ${colorIdentityKey(parsed.semantic.colorsExact)}`);
  }
  if (parsed.semantic.typeIncludes?.length) {
    parts.push(parsed.semantic.typeIncludes.join("/"));
  }
  if (parsed.q) parts.push(`"${parsed.q}"`);
  return parts.join(", ") || "Scryfall syntax";
}
