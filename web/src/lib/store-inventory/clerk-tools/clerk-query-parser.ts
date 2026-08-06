import type {
  StoreInventoryColorFilter,
  StoreInventoryGameFilter,
} from "../../deck-builder/store-inventory-browse";
import type { StoreInventorySemanticFilter } from "../../deck-builder/store-inventory-semantic";
import { isSemanticFilterActive } from "../../deck-builder/store-inventory-semantic";
import {
  formatColorIdentitySearchLabel,
  parseNamedColorIdentityFromText,
  stripNamedColorIdentityTokens,
} from "../../mtg/named-color-identities";
import { looksLikeScryfallSyntax } from "./scryfall-syntax-parser";

export type { StoreInventorySemanticFilter } from "../../deck-builder/store-inventory-semantic";
export {
  cardMatchesSemanticFilter,
  itemMatchesSemanticFilter,
  isSemanticFilterActive,
} from "../../deck-builder/store-inventory-semantic";

export interface ParsedClerkInventoryQuery {
  q?: string;
  color?: StoreInventoryColorFilter;
  maxPrice?: number;
  semantic: StoreInventorySemanticFilter;
  /** True when predicates should drive matching instead of product-name substring search. */
  semanticOnly: boolean;
  /** Browse grid game filter when a set/product line is implied (e.g. Final Fantasy → magic). */
  browseGame?: StoreInventoryGameFilter;
  /** Sub-theme within a product line (e.g. FF7 within Final Fantasy). */
  setProductTheme?: "ff7";
  /** Named wedge/shard/guild label when colorIdentityExact is set. */
  colorIdentityLabel?: string;
  /** Higher cap for set/product-line searches that match many SKUs. */
  searchLimit?: number;
  /** Sort picks by store list price (highest/lowest price questions). */
  priceSort?: "asc" | "desc";
}

/** Name fragments for Final Fantasy VII cards in the MTG Final Fantasy set. */
const FF7_NAME_FRAGMENTS = [
  "cloud",
  "tifa",
  "aerith",
  "barret",
  "sephiroth",
  "vincent",
  "yuffie",
  "zack",
  "hojo",
  "rufus",
  "midgar",
  "mako",
  "shinra",
  "avalanche",
  "gainsborough",
  "freeflier",
  "one-winged",
  "red xiii",
  "scorpion sentinel",
  "heidegger",
  "jenova",
  "materia hunter",
  "midgar mercenary",
  "planet's champion",
  "vengeful atoner",
  "proud warrior",
  "rescue mission",
  "city of mako",
];

const SET_PRODUCT_PHRASES: Array<{
  pattern: RegExp;
  q: string;
  browseGame: StoreInventoryGameFilter;
  theme?: "ff7";
}> = [
  {
    pattern: /\b(?:ff7|ffvii|final fantasy(?:\s+vii|\s+7))\b/i,
    q: "final fantasy",
    browseGame: "magic",
    theme: "ff7",
  },
  { pattern: /\bfinal fantasy\b/i, q: "final fantasy", browseGame: "magic" },
  {
    pattern: /\blord of the rings?\b/i,
    q: "lord of the rings",
    browseGame: "magic",
  },
  { pattern: /\bcommander masters\b/i, q: "commander masters", browseGame: "magic" },
  { pattern: /\bmodern horizons\b/i, q: "modern horizons", browseGame: "magic" },
  { pattern: /\buniverses beyond\b/i, q: "universes beyond", browseGame: "magic" },
  { pattern: /\bedge of eternities\b/i, q: "edge of eternities", browseGame: "magic" },
  { pattern: /\bavatar\b.*\blegends\b/i, q: "avatar legends", browseGame: "magic" },
  { pattern: /\bpokemon\b/i, q: "pokemon", browseGame: "pokemon" },
  { pattern: /\bpokémon\b/i, q: "pokemon", browseGame: "pokemon" },
];

function parseSetProductQuery(text: string): {
  q?: string;
  browseGame?: StoreInventoryGameFilter;
  theme?: "ff7";
} {
  for (const entry of SET_PRODUCT_PHRASES) {
    if (entry.pattern.test(text)) {
      return { q: entry.q, browseGame: entry.browseGame, theme: entry.theme };
    }
  }
  return {};
}

const SET_PRODUCT_FOLLOW_UP =
  /\b(?:ff7|ffviii|ffix|ffx|ones?\s+from|from\s+ff|cards?\s+from)\b/i;

/** Merge prior customer set/product mentions into follow-up questions (e.g. "ff7" after "final fantasy"). */
export function enrichQuestionWithConversationContext(input: {
  userQuestion: string;
  conversationSummary?: string;
}): string {
  const question = input.userQuestion.trim();
  if (parseSetProductQuery(question).q) return question;
  if (!SET_PRODUCT_FOLLOW_UP.test(question)) return question;

  const priorCustomer = (input.conversationSummary ?? "")
    .split("\n")
    .filter((line) => line.startsWith("Customer:"))
    .map((line) => line.replace(/^Customer:\s*/, "").trim())
    .slice(-3);

  for (let i = priorCustomer.length - 1; i >= 0; i -= 1) {
    const prior = priorCustomer[i]!;
    if (parseSetProductQuery(prior).q || /\bfinal fantasy\b/i.test(prior)) {
      return `${prior}. ${question}`;
    }
  }

  return question;
}

export function isSetProductInventoryRequest(input: {
  userQuestion: string;
  conversationSummary?: string;
}): boolean {
  const enriched = enrichQuestionWithConversationContext(input);
  return Boolean(parseSetProductQuery(enriched).q);
}

export function setProductSearchLabel(parsed: ParsedClerkInventoryQuery): string {
  if (parsed.setProductTheme === "ff7") return "Final Fantasy VII";
  if (parsed.q === "final fantasy") return "Final Fantasy";
  if (parsed.q === "lord of the rings") return "Lord of the Rings";
  return parsed.q ? parsed.q.replace(/\b\w/g, (c) => c.toUpperCase()) : "that set";
}

/** Customer wants highest- or lowest-priced in-stock cards. */
export function parsePriceSortFromQuery(q: string): "asc" | "desc" | undefined {
  const lower = q.toLowerCase();
  if (
    /\b(highest|most expensive|priciest|top[- ]priced|max(?:imum)?\s+price)\b/i.test(
      lower,
    )
  ) {
    return "desc";
  }
  if (
    /\b(lowest|cheapest|least expensive|min(?:imum)?\s+price)\b/i.test(lower)
  ) {
    return "asc";
  }
  return undefined;
}

function stripPriceSortBoilerplate(q: string): string {
  return q
    .replace(
      /\b(?:what(?:'s| is| are| was)|whats)\s+(?:the\s+)?(?:highest|lowest|cheapest|most expensive|priciest)\s+(?:store\s+)?(?:price(?:d)?|cost(?:ing)?|card(?:s)?)\s+(?:in\s+(?:our|your|the|my)\s+inventory\s+)?/gi,
      " ",
    )
    .replace(
      /\b(?:what(?:'s| is| are| was)|whats)\s+(?:the\s+)?(?:highest|lowest|cheapest|most expensive|priciest)\s+(?:store\s+)?(?:price(?:d)?|cost(?:ing)?)\s+/gi,
      " ",
    )
    .replace(
      /\b(?:highest|lowest|cheapest|most expensive|priciest|best)\s+(?:store\s+)?(?:price(?:d)?|cost(?:ing)?)\s+/gi,
      " ",
    )
    .replace(/\b(?:in\s+)?(?:our|your|the|my)\s+inventory\b/gi, " ")
    .replace(/\bmagic\s+cards?\b/gi, " ")
    .replace(/[?!.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function colorIdentitySearchLabel(parsed: ParsedClerkInventoryQuery): string {
  if (parsed.semantic.colorIdentityExact?.length) {
    return formatColorIdentitySearchLabel({
      colors: parsed.semantic.colorIdentityExact,
      name: parsed.colorIdentityLabel,
    });
  }
  if (parsed.semantic.colorIdentityContainsAny?.length) {
    const map: Record<string, string> = {
      W: "white",
      U: "blue",
      B: "black",
      R: "red",
      G: "green",
    };
    return parsed.semantic.colorIdentityContainsAny.map((c) => map[c] ?? c).join("/");
  }
  return "that color";
}

export function isColorIdentityInventoryRequest(input: {
  userQuestion: string;
  conversationSummary?: string;
}): boolean {
  if (looksLikeScryfallSyntax(input.userQuestion)) return false;
  const enriched = enrichQuestionWithConversationContext(input);
  return Boolean(parseNamedColorIdentityFromText(enriched)?.colors.length);
}

function normalizeInventoryTextQuery(q: string): string {
  return q
    .replace(/^\bthe\s+/i, "")
    .replace(/\bcards?\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ORACLE_TAG_PHRASES: Array<{
  pattern: RegExp;
  tags: string[];
  oracleTextAny?: string[];
  keywordsAny?: string[];
}> = [
  {
    pattern: /\bmass[-\s]?reanim(?:ation|ate|ating)?\b/i,
    tags: ["mass-reanimation"],
    oracleTextAny: ["return all creature cards from graveyards", "return all creature cards from all graveyards"],
  },
  {
    pattern: /\bgraveyard\s+recursion\b/i,
    tags: ["graveyard-recursion", "reanimation"],
  },
  {
    pattern: /\breanim(?:ation|ate|ating)\b/i,
    tags: ["reanimation"],
    oracleTextAny: ["return target creature card from your graveyard", "return creature card from your graveyard"],
  },
  {
    pattern: /\bboard\s+wipe?s?\b/i,
    tags: ["board-wipe"],
    oracleTextAny: ["destroy all creatures", "destroy all permanents", "destroy all nonland permanents"],
  },
  {
    pattern: /\bramp\b/i,
    tags: ["ramp"],
    oracleTextAny: ["search your library for a land", "add {", "add one mana of any"],
  },
  {
    pattern: /\btutor(?:ing|s)?\b/i,
    tags: ["tutor"],
    oracleTextAny: ["search your library for"],
  },
  {
    pattern: /\bremoval\b/i,
    tags: ["removal"],
  },
  {
    pattern: /\bcounterspell?s?\b/i,
    tags: ["counterspell"],
    keywordsAny: ["Counter"],
  },
  {
    pattern: /\bcard\s+draw\b|\bdraw\s+cards?\b/i,
    tags: ["draw"],
    oracleTextAny: ["draw a card", "draw two cards", "draw three cards"],
  },
  {
    pattern: /\bgraveyard\s+hate\b|\bgraveyard\s+exile\b|\bexile\s+graveyard\b/i,
    tags: ["graveyard-hate"],
    oracleTextAny: ["exile target player's graveyard", "exile all cards from all graveyards"],
  },
  {
    pattern: /\bextra\s+turn?s?\b/i,
    tags: ["extra-turn"],
    oracleTextAny: ["take an extra turn"],
  },
  {
    pattern: /\bwin\s?con\b|\bcombo\s+piece\b/i,
    tags: ["combo-piece"],
  },
];

const TYPE_PHRASES: Array<{ pattern: RegExp; types: string[] }> = [
  { pattern: /\b(?:instant|instants)\b/i, types: ["instant"] },
  { pattern: /\b(?:sorcery|sorceries)\b/i, types: ["sorcery"] },
  { pattern: /\b(?:creature|creatures)\b/i, types: ["creature"] },
  { pattern: /\b(?:artifact|artifacts)\b/i, types: ["artifact"] },
  { pattern: /\b(?:enchantment|enchantments)\b/i, types: ["enchantment"] },
  { pattern: /\b(?:planeswalker|planeswalkers)\b/i, types: ["planeswalker"] },
  { pattern: /\b(?:land|lands)\b/i, types: ["land"] },
  { pattern: /\b(?:battle|battles)\b/i, types: ["battle"] },
  {
    pattern: /\b(?:spell|spells)\b/i,
    types: ["instant", "sorcery"],
  },
];

const KEYWORD_PHRASES: Array<{ pattern: RegExp; keywords: string[] }> = [
  { pattern: /\bflash\b/i, keywords: ["Flash"] },
  { pattern: /\bflying\b/i, keywords: ["Flying"] },
  { pattern: /\btrample\b/i, keywords: ["Trample"] },
  { pattern: /\bdeathtouch\b/i, keywords: ["Deathtouch"] },
  { pattern: /\blifelink\b/i, keywords: ["Lifelink"] },
  { pattern: /\bhexproof\b/i, keywords: ["Hexproof"] },
  { pattern: /\bward\b/i, keywords: ["Ward"] },
  { pattern: /\bmenace\b/i, keywords: ["Menace"] },
  { pattern: /\bhaste\b/i, keywords: ["Haste"] },
  { pattern: /\bvigilance\b/i, keywords: ["Vigilance"] },
  { pattern: /\breach\b/i, keywords: ["Reach"] },
  { pattern: /\bdefender\b/i, keywords: ["Defender"] },
  { pattern: /\bfirst\s+strike\b/i, keywords: ["First strike"] },
  { pattern: /\bdouble\s+strike\b/i, keywords: ["Double strike"] },
  { pattern: /\bindestructible\b/i, keywords: ["Indestructible"] },
];

function uniq<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function normalizeTagSlug(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

function mergeSemantic(
  base: StoreInventorySemanticFilter,
  patch: StoreInventorySemanticFilter,
): StoreInventorySemanticFilter {
  return {
    cmcMin: patch.cmcMin ?? base.cmcMin,
    cmcMax: patch.cmcMax ?? base.cmcMax,
    typeIncludes: uniq([...(base.typeIncludes ?? []), ...(patch.typeIncludes ?? [])]),
    oracleTagsAny: uniq([...(base.oracleTagsAny ?? []), ...(patch.oracleTagsAny ?? [])]),
    keywordsAny: uniq([...(base.keywordsAny ?? []), ...(patch.keywordsAny ?? [])]),
    oracleTextAny: uniq([...(base.oracleTextAny ?? []), ...(patch.oracleTextAny ?? [])]),
    nameIncludesAny: uniq([...(base.nameIncludesAny ?? []), ...(patch.nameIncludesAny ?? [])]),
    colorIdentityExact:
      patch.colorIdentityExact !== undefined
        ? patch.colorIdentityExact
        : base.colorIdentityExact,
    colorIdentityContainsAny:
      patch.colorIdentityContainsAny ?? base.colorIdentityContainsAny,
    colorIdentitySubsetOf: patch.colorIdentitySubsetOf ?? base.colorIdentitySubsetOf,
    colorIdentitySupersetOf:
      patch.colorIdentitySupersetOf ?? base.colorIdentitySupersetOf,
    colorsExact: patch.colorsExact ?? base.colorsExact,
    rarityAny: uniq([...(base.rarityAny ?? []), ...(patch.rarityAny ?? [])]),
  };
}

const COLOR_NAME_TO_LETTER: Record<string, string> = {
  white: "W",
  blue: "U",
  black: "B",
  red: "R",
  green: "G",
};

function colorNameToLetter(name: string): string | undefined {
  return COLOR_NAME_TO_LETTER[name.toLowerCase()];
}

/** Map natural-language color wording to semantic identity operators. */
function parseColorIdentitySemanticsFromQuery(q: string): {
  semantic: StoreInventorySemanticFilter;
  stripped: string;
  countFilter?: StoreInventoryColorFilter;
} {
  let stripped = q;
  const semantic: StoreInventorySemanticFilter = {};

  if (/\bcolorless\b/i.test(q)) {
    semantic.colorIdentityExact = [];
    stripped = stripped.replace(/\bcolorless\b/gi, " ");
    return { semantic, stripped };
  }

  const mono = q.match(/\bmono-?\s*(white|blue|black|red|green)\b/i);
  if (mono) {
    const letter = colorNameToLetter(mono[1]);
    if (letter) {
      semantic.colorIdentityExact = [letter];
      stripped = stripped.replace(mono[0], " ");
      return { semantic, stripped };
    }
  }

  const commanderColor = q.match(/\b(white|blue|black|red|green)\s+commander\b/i);
  if (commanderColor) {
    const letter = colorNameToLetter(commanderColor[1]);
    if (letter) {
      semantic.colorIdentityExact = [letter];
      stripped = stripped.replace(commanderColor[0], " ");
      return { semantic, stripped };
    }
  }

  const dualMatch = q.match(
    /\b(white|blue|black|red|green)\s*(?:[-/,]\s*|\s+and\s+|\s*,\s*)\s*(white|blue|black|red|green)\b/i,
  );
  if (dualMatch) {
    const left = colorNameToLetter(dualMatch[1]);
    const right = colorNameToLetter(dualMatch[2]);
    if (left && right) {
      semantic.colorIdentitySupersetOf = [...new Set([left, right])];
      stripped = stripped.replace(dualMatch[0], " ");
      return { semantic, stripped };
    }
  }

  const containsMatch = q.match(
    /\b(white|blue|black|red|green)\s+(?:cards?|spells?|commanders?|options?)\b/i,
  );
  if (containsMatch) {
    const letter = colorNameToLetter(containsMatch[1]);
    if (letter) {
      semantic.colorIdentityContainsAny = [letter];
      stripped = stripped.replace(containsMatch[0], " ");
      return { semantic, stripped };
    }
  }

  let countFilter: StoreInventoryColorFilter | undefined;
  if (/\bmulticolor\b|\bmulti-?color\b/i.test(q)) countFilter = "multicolor";
  else if (/\btwo-?color\b|\b2-?color\b/i.test(q)) countFilter = "two";
  else if (/\bthree-?color\b|\b3-?color\b/i.test(q)) countFilter = "three";

  return { semantic, stripped, countFilter };
}

function hasColorIdentitySemanticFilter(
  semantic: StoreInventorySemanticFilter,
): boolean {
  return (
    semantic.colorIdentityExact != null ||
    Boolean(semantic.colorIdentityContainsAny?.length) ||
    Boolean(semantic.colorIdentitySubsetOf?.length) ||
    Boolean(semantic.colorIdentitySupersetOf?.length)
  );
}

export function parseColorFromQuery(q: string): StoreInventoryColorFilter | undefined {
  const lower = q.toLowerCase();
  if (/\bmono-?white\b|\bwhite commander\b|\bgreen\s+and\s+white\b/.test(lower)) return "W";
  if (/\bmono-?blue\b|\bblue commander\b/.test(lower)) return "U";
  if (/\bmono-?black\b|\bblack commander\b/.test(lower)) return "B";
  if (/\bmono-?red\b|\bred commander\b/.test(lower)) return "R";
  if (/\bmono-?green\b|\bgreen commander\b/.test(lower)) return "G";
  if (/\bcolorless\b/.test(lower)) return "C";
  if (/\bmulticolor\b|\bmulti-?color\b/.test(lower)) return "multicolor";
  if (/\btwo-?color\b|\b2-?color\b/.test(lower)) return "two";
  if (/\bthree-?color\b|\b3-?color\b/.test(lower)) return "three";
  return undefined;
}

export function parseMaxPriceFromQuery(
  q: string,
  explicit?: number,
): number | undefined {
  if (explicit != null && explicit > 0) return explicit;
  const patterns = [
    /\bunder\s+\$?\s*(\d+(?:\.\d{2})?)\s*\$?/i,
    /\bbelow\s+\$?\s*(\d+(?:\.\d{2})?)\s*\$?/i,
    /\bfor\s+under\s+\$?\s*(\d+(?:\.\d{2})?)\s*\$?/i,
    /\b(?:budget|max)\s+\$?\s*(\d+(?:\.\d{2})?)\s*\$?/i,
  ];
  for (const pattern of patterns) {
    const match = q.match(pattern);
    if (match?.[1]) return Number.parseFloat(match[1]);
  }
  return undefined;
}

function parseCmcFilters(q: string): {
  semantic: StoreInventorySemanticFilter;
  stripped: string;
} {
  let stripped = q;
  let cmcMin: number | undefined;
  let cmcMax: number | undefined;

  const rules: Array<{
    pattern: RegExp;
    apply: (value: number) => void;
  }> = [
    {
      pattern:
        /\b(?:a\s+)?(?:cmc|mana\s+value|mv|converted\s+mana\s+cost)\s+(?:that\s+is\s+)?(?:higher|greater|over|above)\s+than\s+(\d+)\b/gi,
      apply: (n) => {
        cmcMin = Math.max(cmcMin ?? 0, n + 1);
      },
    },
    {
      pattern:
        /\bwith\s+(?:a\s+)?(?:cmc|mana\s+value|mv)\s+(?:higher|greater|over|above)\s+than\s+(\d+)\b/gi,
      apply: (n) => {
        cmcMin = Math.max(cmcMin ?? 0, n + 1);
      },
    },
    {
      pattern:
        /\b(?:cmc|mana\s+value|mv|converted\s+mana\s+cost)\s+(?:that\s+is\s+)?(?:higher|greater|over|above)\s+than\s+(\d+)\b/gi,
      apply: (n) => {
        cmcMin = Math.max(cmcMin ?? 0, n + 1);
      },
    },
    {
      pattern:
        /\b(?:higher|greater|over|above)\s+than\s+(\d+)\s+(?:cmc|mana\s+value|mv)\b/gi,
      apply: (n) => {
        cmcMin = Math.max(cmcMin ?? 0, n + 1);
      },
    },
    {
      pattern: /\b(?:cmc|mana\s+value|mv)\s*(?:>=|≥|at\s+least|minimum\s+of)\s*(\d+)\b/gi,
      apply: (n) => {
        cmcMin = Math.max(cmcMin ?? 0, n);
      },
    },
    {
      pattern: /\b(?:cmc|mana\s+value|mv)\s+of\s+(\d+)\s+or\s+(?:more|higher)\b/gi,
      apply: (n) => {
        cmcMin = Math.max(cmcMin ?? 0, n);
      },
    },
    {
      pattern:
        /\b(?:cmc|mana\s+value|mv)\s+(?:under|below|less\s+than)\s+(\d+)\b/gi,
      apply: (n) => {
        cmcMax = cmcMax == null ? n - 1 : Math.min(cmcMax, n - 1);
      },
    },
    {
      pattern:
        /\b(?:under|below|less\s+than)\s+(\d+)\s+(?:cmc|mana\s+value|mv)\b/gi,
      apply: (n) => {
        cmcMax = cmcMax == null ? n - 1 : Math.min(cmcMax, n - 1);
      },
    },
    {
      pattern: /\b(?:cmc|mana\s+value|mv)\s*(?:<=|≤|at\s+most|maximum\s+of)\s*(\d+)\b/gi,
      apply: (n) => {
        cmcMax = cmcMax == null ? n : Math.min(cmcMax, n);
      },
    },
    {
      pattern: /\b(?:cmc|mana\s+value|mv)\s+of\s+(\d+)\s+or\s+less\b/gi,
      apply: (n) => {
        cmcMax = cmcMax == null ? n : Math.min(cmcMax, n);
      },
    },
    {
      pattern: /\b(?:cmc|mana\s+value|mv)\s*(?:=|equals?|is)\s*(\d+)\b/gi,
      apply: (n) => {
        cmcMin = Math.max(cmcMin ?? 0, n);
        cmcMax = cmcMax == null ? n : Math.min(cmcMax, n);
      },
    },
  ];

  for (const rule of rules) {
    for (const match of q.matchAll(rule.pattern)) {
      const value = Number.parseInt(match[1], 10);
      if (Number.isNaN(value)) continue;
      rule.apply(value);
      stripped = stripped.replace(match[0], " ");
    }
  }

  return {
    semantic: { cmcMin, cmcMax },
    stripped,
  };
}

function parseTypeFilters(q: string): {
  semantic: StoreInventorySemanticFilter;
  stripped: string;
} {
  let stripped = q;
  const typeIncludes: string[] = [];

  for (const entry of TYPE_PHRASES) {
    if (entry.pattern.test(q)) {
      typeIncludes.push(...entry.types);
      stripped = stripped.replace(entry.pattern, " ");
    }
  }

  return {
    semantic: { typeIncludes: uniq(typeIncludes) },
    stripped,
  };
}

function parseKeywordFilters(q: string): {
  semantic: StoreInventorySemanticFilter;
  stripped: string;
} {
  let stripped = q;
  const keywordsAny: string[] = [];

  for (const entry of KEYWORD_PHRASES) {
    if (entry.pattern.test(q)) {
      keywordsAny.push(...entry.keywords);
      stripped = stripped.replace(entry.pattern, " ");
    }
  }

  return {
    semantic: { keywordsAny: uniq(keywordsAny) },
    stripped,
  };
}

function parseOracleTagFilters(q: string): {
  semantic: StoreInventorySemanticFilter;
  stripped: string;
} {
  let stripped = q;
  let semantic: StoreInventorySemanticFilter = {};

  for (const entry of ORACLE_TAG_PHRASES) {
    if (entry.pattern.test(q)) {
      semantic = mergeSemantic(semantic, {
        oracleTagsAny: entry.tags,
        oracleTextAny: entry.oracleTextAny,
        keywordsAny: entry.keywordsAny,
      });
      stripped = stripped.replace(entry.pattern, " ");
    }
  }

  const explicitTag = q.match(/\boracle[-\s]?tag[s]?\s+([a-z0-9-]+(?:\s+[a-z0-9-]+)*)/i);
  if (explicitTag?.[1]) {
    semantic = mergeSemantic(semantic, {
      oracleTagsAny: [normalizeTagSlug(explicitTag[1])],
    });
    stripped = stripped.replace(explicitTag[0], " ");
  }

  return { semantic, stripped };
}

function stripClerkBoilerplate(q: string): string {
  return q
    .replace(/\b(i'm|i am|we're|we are|im)\s+(looking\s+for|searching\s+for|trying\s+to\s+find|need(?:ing)?)\b/gi, " ")
    .replace(/\b(what are|what is|what's|whats)\s+(?:some|any|the)\s+/gi, " ")
    .replace(/\bany\s+type\s+(?:of\s+)?(?:cards?|card)\b/gi, " ")
    .replace(/\b(?:ones?|those|these|them)\s+(?:from|in)\b/gi, " ")
    .replace(/\b(do you have|got any|show me|find me|any|looking for|need|want)\b/gi, " ")
    .replace(/\b(?:you|we|they)\s+have\b/gi, " ")
    .replace(/\bcards?\s+with\b/gi, " ")
    .replace(/\bthat\s+(?:have|are|contain)\b/gi, " ")
    .replace(/\bin\s+stock\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Residual text after semantic stripping that is not a card-name search. */
function isConversationalInventoryRemainder(q: string): boolean {
  const normalized = q.replace(/[?.!]/g, "").trim().toLowerCase();
  if (!normalized) return true;
  if (/^(cards?|spells?|commanders?|options?)$/i.test(normalized)) return true;
  return /^(?:what(?:'s| is| are)?(?:\s+(?:some|any|the))?|(?:some|any)\s+)?(?:cards?|spells?|commanders?|options?)(?:\s+(?:you|we|they)\s+have)?$/.test(
    normalized,
  );
}

/** Parse a customer question into browse/clerk search params. */
export function parseClerkInventoryQuery(input: {
  userQuestion: string;
  conversationSummary?: string;
  cardNames?: string[];
  commander?: string;
  maxPrice?: number;
}): ParsedClerkInventoryQuery {
  const priceSort = parsePriceSortFromQuery(input.userQuestion);

  const enrichedQuestion = enrichQuestionWithConversationContext({
    userQuestion: input.userQuestion,
    conversationSummary: input.conversationSummary,
  });
  const cleanedQuestion = stripPriceSortBoilerplate(enrichedQuestion);

  const raw =
    input.cardNames?.[0]?.trim() ||
    input.commander?.trim() ||
    cleanedQuestion.trim();

  let working = raw;
  let semantic: StoreInventorySemanticFilter = {};
  let colorIdentityLabel: string | undefined;

  const namedColor = parseNamedColorIdentityFromText(enrichedQuestion);
  if (namedColor) {
    semantic = mergeSemantic(semantic, {
      colorIdentityExact: namedColor.colors,
    });
    colorIdentityLabel = namedColor.label;
    working = stripNamedColorIdentityTokens(working);
  }

  const colorIdentityParsed = parseColorIdentitySemanticsFromQuery(working);
  semantic = mergeSemantic(semantic, colorIdentityParsed.semantic);
  working = colorIdentityParsed.stripped;

  const cmc = parseCmcFilters(working);
  semantic = mergeSemantic(semantic, cmc.semantic);
  working = cmc.stripped;

  const tags = parseOracleTagFilters(working);
  semantic = mergeSemantic(semantic, tags.semantic);
  working = tags.stripped;

  const types = parseTypeFilters(working);
  semantic = mergeSemantic(semantic, types.semantic);
  working = types.stripped;

  const keywords = parseKeywordFilters(working);
  semantic = mergeSemantic(semantic, keywords.semantic);
  working = keywords.stripped;

  const color =
    colorIdentityParsed.countFilter ??
    (hasColorIdentitySemanticFilter(semantic)
      ? undefined
      : parseColorFromQuery(input.userQuestion));
  const maxPrice = parseMaxPriceFromQuery(cleanedQuestion, input.maxPrice);

  if (color) {
    working = working.replace(/\b(mono-?)?(white|blue|black|red|green|colorless|multicolor|multi-?color)\b/gi, " ");
  }
  working = working.replace(/\bunder\s+\$?\s*\d+(?:\.\d{2})?\s*\$?/gi, " ");

  let q = normalizeInventoryTextQuery(stripClerkBoilerplate(working));
  const setProduct = parseSetProductQuery(cleanedQuestion);
  if (setProduct.q) {
    q = setProduct.q;
  }
  if (setProduct.theme === "ff7") {
    semantic = mergeSemantic(semantic, { nameIncludesAny: FF7_NAME_FRAGMENTS });
  }

  if (semantic.colorIdentityExact?.length) {
    q = stripNamedColorIdentityTokens(q);
  }

  const hasColorSemantic = hasColorIdentitySemanticFilter(semantic);

  const hasNonColorSemantic =
    semantic.cmcMin != null ||
    semantic.cmcMax != null ||
    Boolean(semantic.typeIncludes?.length) ||
    Boolean(semantic.oracleTagsAny?.length) ||
    Boolean(semantic.keywordsAny?.length) ||
    Boolean(semantic.oracleTextAny?.length) ||
    Boolean(semantic.nameIncludesAny?.length);

  let semanticOnly =
    isSemanticFilterActive(semantic) &&
    (q.length < 3 ||
      /^(cards?|spells?|commanders?|options?)$/i.test(q) ||
      isConversationalInventoryRemainder(q));

  if (hasColorSemantic && !input.cardNames?.length && !hasNonColorSemantic) {
    q = "";
    semanticOnly = true;
  } else if (hasColorSemantic) {
    const remainder = q.trim().toLowerCase();
    if (
      !remainder ||
      isConversationalInventoryRemainder(remainder) ||
      remainder === colorIdentityLabel?.toLowerCase()
    ) {
      q = "";
      semanticOnly = true;
    }
  }

  if (semanticOnly) q = "";

  if (q.length > 80) {
    q = input.cardNames?.[0]?.trim() ?? q.slice(0, 60);
  }

  if (
    priceSort &&
    !setProduct.q &&
    !input.cardNames?.length &&
    (isConversationalInventoryRemainder(q) ||
      /^(?:what(?:'s| is| are| was)\s+)?(?:the\s+)?(?:most expensive|highest|cheapest|lowest|priciest)/i.test(
        q.trim(),
      ))
  ) {
    q = "";
  }

  const searchLimit =
    setProduct.q ||
    hasColorSemantic ||
    priceSort ||
    (q && q.includes(" ") && q.length >= 4)
      ? 96
      : undefined;

  return {
    q: q || undefined,
    color,
    maxPrice,
    semantic,
    semanticOnly,
    browseGame: setProduct.browseGame,
    setProductTheme: setProduct.theme,
    colorIdentityLabel,
    searchLimit,
    priceSort,
  };
}
