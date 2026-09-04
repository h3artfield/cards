/**
 * Deterministic mana quality for a land, relative to a commander's color identity.
 *
 * The land pool previously judged lands only on legality. A colorless land has
 * an empty color identity, so it passes any identity check, which is how a
 * mono-black Mikaeus deck ended up with Bant Panorama — a land whose only
 * ability fetches a basic Forest, Plains, or Island, none of which that deck
 * can contain. Legality is not usefulness, and this module supplies the
 * missing half: can this land actually cast the deck's spells?
 *
 * Everything here is derived from Oracle text with no model in the loop, so it
 * is testable and stable across builds.
 */

export const PROFESSOR_SOL_DIRECTED_LAND_MANA_QUALITY_V1_VERSION =
  "professor-sol-directed-land-mana-quality-v1";

export type LandManaRoleV1 =
  /** Taps for an identity color with no extra cost, and enters untapped. */
  | "IDENTITY_SOURCE_UNTAPPED"
  /** Taps for an identity color with no extra cost, but enters tapped. */
  | "IDENTITY_SOURCE_TAPPED"
  /** Makes every land an identity type — an enabler rather than a source. */
  | "IDENTITY_ENABLER"
  /** Can fetch a land that produces an identity color. */
  | "IDENTITY_FETCH"
  /** Produces an identity color only behind an extra cost or a board condition. */
  | "IDENTITY_SOURCE_CONDITIONAL"
  /** Produces colorless mana only, but has some other use. */
  | "COLORLESS_ONLY"
  /** Produces no identity mana, and its only search targets are off-identity. */
  | "DEAD_IN_IDENTITY";

export type LandManaProfileV1 = {
  name: string;
  role: LandManaRoleV1;
  /** Identity colors this land can produce for a plain tap. */
  untappedIdentityColors: string[];
  /** Identity colors reachable only behind an added cost or condition. */
  conditionalIdentityColors: string[];
  entersTapped: boolean;
  /** "enters tapped unless ..." — tapped in the worst case only. */
  entersTappedConditionally: boolean;
  /** Costs something to enter, e.g. Lotus Vale sacrificing two lands. */
  hasEntryCost: boolean;
  /** Has a library search that can produce an identity source. */
  fetchesIdentitySource: boolean;
  /** Has searches, none of which can produce an identity source. */
  hasOnlyOffIdentityFetch: boolean;
  /** Counts toward the architect's colored-source target. */
  countsAsIdentitySource: boolean;
};

const BASIC_TYPE_COLORS: Record<string, string> = {
  plains: "W",
  island: "U",
  swamp: "B",
  mountain: "R",
  forest: "G",
};

const BASIC_LAND_NAMES = new Set(["plains", "island", "swamp", "mountain", "forest", "wastes"]);

type ManaAbilityV1 = { cost: string; effect: string };

/**
 * Reminder text is parenthesised, and on a basic land the entire ability is —
 * "({T}: Add {B}.)" — so the brackets are dropped rather than the contents.
 */
function normalizeOracleText(oracleText: string): string {
  return oracleText.replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=\.)\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * An ability's effect can run past a sentence break — Nykthos reads
 * "{2}, {T}: Choose a color. Add an amount of mana of that color ..." and
 * Interplanar Beacon puts its "Spend this mana only ..." restriction in a
 * following sentence. Sentences after a cost are folded into its effect until
 * the next cost appears, so neither is lost.
 */
function parseManaAbilities(sentences: string[]): ManaAbilityV1[] {
  const abilities: ManaAbilityV1[] = [];
  let current: ManaAbilityV1 | null = null;

  for (const sentence of sentences) {
    const colon = sentence.indexOf(":");
    if (colon > 0) {
      current = { cost: sentence.slice(0, colon).trim(), effect: sentence.slice(colon + 1).trim() };
      abilities.push(current);
    } else if (current) {
      current.effect = `${current.effect} ${sentence}`.trim();
    }
  }

  return abilities.filter((ability) => /\badd\b/i.test(ability.effect));
}

/** A plain tap and nothing else. Anything more is a condition. */
function isPlainTapCost(cost: string): boolean {
  return /^\{t\}$/i.test(cost.replace(/\s+/g, ""));
}

function colorsFromEffect(effect: string, identity: readonly string[]): string[] {
  const lower = effect.toLowerCase();

  // Mana locked to a narrow purpose is not a general source.
  if (/spend this mana only/.test(lower)) return [];

  if (/any color in your commander'?s color identity/.test(lower)) return [...identity];
  if (/mana of any (?:one )?color|mana of different colors/.test(lower)) return [...identity];
  // "Choose a color. Add ... mana of that color" — colour is the player's pick.
  if (/choose a color|mana of that color/.test(lower)) return [...identity];

  const explicit = new Set<string>();
  for (const match of effect.matchAll(/\{([WUBRG])\}/gi)) {
    explicit.add(match[1]!.toUpperCase());
  }
  return [...explicit].filter((c) => identity.includes(c));
}

/** Basic land types this search can put onto the battlefield. */
function fetchableColors(sentence: string, identity: readonly string[]): string[] | "ANY_BASIC" {
  const lower = sentence.toLowerCase();
  const clause = lower.match(/search your library for [^:]*/)?.[0] ?? lower;

  if (/\bbasic land card\b|\ba land card\b/.test(clause)) return "ANY_BASIC";

  const colors = new Set<string>();
  for (const [type, color] of Object.entries(BASIC_TYPE_COLORS)) {
    if (new RegExp(`\\b${type}\\b`).test(clause)) colors.add(color);
  }
  return [...colors].filter((c) => identity.includes(c));
}

export function classifyLandManaQualityV1(args: {
  name: string;
  oracleText: string;
  commanderColorIdentity: readonly string[];
}): LandManaProfileV1 {
  const identity = args.commanderColorIdentity.map((c) => c.toUpperCase());
  const text = normalizeOracleText(args.oracleText);
  const sentences = splitSentences(text);
  const lower = text.toLowerCase();

  const basicName = args.name.trim().toLowerCase();
  if (BASIC_LAND_NAMES.has(basicName)) {
    const color = BASIC_TYPE_COLORS[basicName];
    const inIdentity = color != null && identity.includes(color);
    return {
      name: args.name,
      role: inIdentity ? "IDENTITY_SOURCE_UNTAPPED" : color == null ? "COLORLESS_ONLY" : "DEAD_IN_IDENTITY",
      untappedIdentityColors: inIdentity ? [color!] : [],
      conditionalIdentityColors: [],
      entersTapped: false,
      entersTappedConditionally: false,
      hasEntryCost: false,
      fetchesIdentitySource: false,
      hasOnlyOffIdentityFetch: false,
      countsAsIdentitySource: inIdentity,
    };
  }

  const untapped = new Set<string>();
  const conditional = new Set<string>();
  for (const ability of parseManaAbilities(sentences)) {
    const colors = colorsFromEffect(ability.effect, identity);
    if (colors.length === 0) continue;
    const target = isPlainTapCost(ability.cost) ? untapped : conditional;
    for (const color of colors) target.add(color);
  }

  const searchSentences = sentences.filter((s) => /search your library for/i.test(s));
  let fetchesIdentitySource = false;
  let searchTargetsSeen = false;
  for (const sentence of searchSentences) {
    searchTargetsSeen = true;
    const fetchable = fetchableColors(sentence, identity);
    if (fetchable === "ANY_BASIC" ? identity.length > 0 : fetchable.length > 0) {
      fetchesIdentitySource = true;
    }
  }

  // "Each land is a Swamp" produces no mana itself but turns the whole board
  // into identity sources, which is why Urborg belongs in a mono-black deck.
  let enablesIdentity = false;
  const enablerMatch = lower.match(/each land is a (\w+)/);
  if (enablerMatch) {
    const color = BASIC_TYPE_COLORS[enablerMatch[1]!];
    if (color && identity.includes(color)) enablesIdentity = true;
  }

  const entersTapped = /\benters tapped\b/.test(lower);
  const entersTappedConditionally = /\benters tapped unless\b/.test(lower);
  const hasEntryCost = /if this land would enter, sacrifice/.test(lower);

  const hasOnlyOffIdentityFetch = searchTargetsSeen && !fetchesIdentitySource;

  let role: LandManaRoleV1;
  if (untapped.size > 0) {
    role = entersTapped && !entersTappedConditionally ? "IDENTITY_SOURCE_TAPPED" : "IDENTITY_SOURCE_UNTAPPED";
  } else if (enablesIdentity) {
    role = "IDENTITY_ENABLER";
  } else if (fetchesIdentitySource) {
    role = "IDENTITY_FETCH";
  } else if (conditional.size > 0) {
    role = "IDENTITY_SOURCE_CONDITIONAL";
  } else if (hasOnlyOffIdentityFetch) {
    role = "DEAD_IN_IDENTITY";
  } else {
    role = "COLORLESS_ONLY";
  }

  return {
    name: args.name,
    role,
    untappedIdentityColors: [...untapped],
    conditionalIdentityColors: [...conditional],
    entersTapped,
    entersTappedConditionally,
    hasEntryCost,
    fetchesIdentitySource,
    hasOnlyOffIdentityFetch,
    countsAsIdentitySource:
      untapped.size > 0 || conditional.size > 0 || fetchesIdentitySource || enablesIdentity,
  };
}

/**
 * Preference order when filling out a land pool. Higher is better.
 *
 * Untapped colored sources come first because castability is what the Head
 * Professor grades the mana base on; a pile of colorless utility lands is what
 * dragged the Mikaeus build to a C-.
 */
export function landManaQualityRankV1(profile: LandManaProfileV1): number {
  const base: Record<LandManaRoleV1, number> = {
    IDENTITY_SOURCE_UNTAPPED: 100,
    IDENTITY_ENABLER: 92,
    IDENTITY_FETCH: 88,
    IDENTITY_SOURCE_TAPPED: 74,
    IDENTITY_SOURCE_CONDITIONAL: 48,
    COLORLESS_ONLY: 20,
    DEAD_IN_IDENTITY: 0,
  };
  let rank = base[profile.role];
  if (profile.hasEntryCost) rank -= 30;
  if (profile.hasOnlyOffIdentityFetch) rank -= 10;
  return Math.max(0, rank);
}

/** A land that cannot help cast this deck's spells and has no identity use. */
export function isLandUnusableInIdentityV1(profile: LandManaProfileV1): boolean {
  return profile.role === "DEAD_IN_IDENTITY";
}

export type LandBaseManaSummaryV1 = {
  totalLands: number;
  /** Copies that count toward the architect's colored-source target. */
  identitySources: number;
  /** Copies that tap for an identity color untapped, with no added cost. */
  untappedUnconditionalSources: number;
  colorlessOnly: number;
  unusable: string[];
};

export function summarizeLandBaseManaV1(
  lands: ReadonlyArray<{ profile: LandManaProfileV1; copies: number }>,
): LandBaseManaSummaryV1 {
  const summary: LandBaseManaSummaryV1 = {
    totalLands: 0,
    identitySources: 0,
    untappedUnconditionalSources: 0,
    colorlessOnly: 0,
    unusable: [],
  };

  for (const { profile, copies } of lands) {
    summary.totalLands += copies;
    if (profile.countsAsIdentitySource) summary.identitySources += copies;
    if (profile.role === "IDENTITY_SOURCE_UNTAPPED") summary.untappedUnconditionalSources += copies;
    if (profile.role === "COLORLESS_ONLY") summary.colorlessOnly += copies;
    if (isLandUnusableInIdentityV1(profile)) summary.unusable.push(profile.name);
  }

  return summary;
}
