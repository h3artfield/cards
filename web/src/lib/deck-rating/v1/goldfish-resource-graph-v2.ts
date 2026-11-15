/**
 * F1 win resolver: resource graph to a fixed point every priority window.
 * Finite mana is spent in deterministic card-id order. No SAT solver.
 */
import {
  featureNameToTokens,
  isLethalToken,
  type ResourceToken,
  type TokenKind,
} from "./goldfish-feature-tokens-v2";

export const DR_RESOURCE_GRAPH_V2 = "deck-rating-goldfish-resource-graph-v2";

export type WinZone = "H" | "B" | "G" | "L" | "E" | "C";

export type GraphCard = {
  instanceId: string;
  oracleId: string;
  name: string;
  cmc: number;
  zone: WinZone;
  isCommander?: boolean;
  typeLine?: string;
  text?: string;
  power?: number;
  producedMana?: number;
  manaCost?: string;
  colors?: string;
};

export type ManaPool = {
  total: number;
  W: number;
  U: number;
  B: number;
  R: number;
  G: number;
  C: number;
  any: number;
};

export type SpellbookUse = {
  oracleId: string;
  name: string;
  zones: WinZone[];
  mustBeCommander?: boolean;
};

export type CompiledVariant = {
  id: string;
  uses: SpellbookUse[];
  templateIds: number[];
  tokens: ResourceToken[];
  manaNeeded: string;
  manaValueNeeded: number;
  notablePrerequisites: string;
  terminal: boolean;
};

export type AuthoredConverter = {
  id: string;
  name: string;
  needsTokens: TokenKind[];
  needsNames?: string[];
  needsAnyName?: string[];
  produces: TokenKind[];
  produceColors?: string;
  manaCost?: number;
  requiresCastable?: boolean;
  needsRockMana?: number;
  /** needsAnyName cards must be present but are cast by a later converter, not this one. */
  anyNameIsPrecondition?: boolean;
};

export const AUTHORED_CONVERTERS: AuthoredConverter[] = [
  {
    id: "thrasios-inf-mana-draw",
    name: "Thrasios + INF_MANA → DRAW_LIBRARY",
    needsTokens: ["INF_MANA"],
    needsNames: ["Thrasios, Triton Hero"],
    produces: ["DRAW_LIBRARY"],
  },
  {
    id: "ballista-inf-mana",
    name: "Walking Ballista + INF_MANA → INF_DAMAGE_EACH_OPP",
    needsTokens: ["INF_MANA"],
    needsAnyName: ["Walking Ballista", "Hangarback Walker", "Triskelion"],
    produces: ["INF_DAMAGE_EACH_OPP"],
    requiresCastable: true,
  },
  {
    id: "isochron-dramatic",
    name: "Isochron Scepter + Dramatic Reversal + rocks≥3 → INF_MANA + INF_STORM",
    needsTokens: [],
    needsNames: ["Isochron Scepter", "Dramatic Reversal"],
    produces: ["INF_MANA", "INF_STORM"],
    produceColors: "WUBRG",
    needsRockMana: 3,
  },
  {
    id: "breach-led-bf",
    name: "Underworld Breach + LED + Brain Freeze → INF_STORM",
    needsTokens: [],
    needsNames: ["Underworld Breach", "Lion's Eye Diamond", "Brain Freeze"],
    produces: ["INF_STORM", "INF_MANA"],
    produceColors: "WUBRG",
  },
  {
    id: "oracle-empty",
    name: "Thassa's Oracle + LIBRARY_EMPTY → WIN",
    needsTokens: ["LIBRARY_EMPTY"],
    needsNames: ["Thassa's Oracle"],
    produces: ["WIN"],
    manaCost: 2,
    requiresCastable: true,
  },
  {
    id: "labman-empty",
    name: "Laboratory Maniac + LIBRARY_EMPTY → WIN",
    needsTokens: ["LIBRARY_EMPTY"],
    needsNames: ["Laboratory Maniac"],
    produces: ["WIN"],
    manaCost: 3,
    requiresCastable: true,
  },
  {
    id: "jace-wom-empty",
    name: "Jace, Wielder of Mysteries + LIBRARY_EMPTY → WIN",
    needsTokens: ["LIBRARY_EMPTY"],
    needsNames: ["Jace, Wielder of Mysteries"],
    produces: ["WIN"],
    manaCost: 4,
    requiresCastable: true,
  },
  {
    id: "consult-empty",
    name: "Demonic Consultation → LIBRARY_EMPTY",
    needsTokens: [],
    needsNames: ["Demonic Consultation"],
    needsAnyName: ["Thassa's Oracle", "Laboratory Maniac", "Jace, Wielder of Mysteries"],
    produces: ["LIBRARY_EMPTY"],
    manaCost: 1,
    requiresCastable: true,
    anyNameIsPrecondition: true,
  },
  {
    id: "pact-empty",
    name: "Tainted Pact → LIBRARY_EMPTY",
    needsTokens: [],
    needsNames: ["Tainted Pact"],
    needsAnyName: ["Thassa's Oracle", "Laboratory Maniac", "Jace, Wielder of Mysteries"],
    produces: ["LIBRARY_EMPTY"],
    manaCost: 2,
    requiresCastable: true,
    anyNameIsPrecondition: true,
  },
  {
    id: "draw-to-empty",
    name: "DRAW_LIBRARY → LIBRARY_EMPTY",
    needsTokens: ["DRAW_LIBRARY"],
    produces: ["LIBRARY_EMPTY"],
  },
  {
    id: "aetherflux-storm",
    name: "Aetherflux Reservoir + INF_STORM/INF_CAST → INF_DAMAGE_EACH_OPP",
    needsTokens: ["INF_STORM"],
    needsNames: ["Aetherflux Reservoir"],
    produces: ["INF_DAMAGE_EACH_OPP"],
  },
  {
    id: "aetherflux-cast",
    name: "Aetherflux Reservoir + INF_CAST → INF_DAMAGE_EACH_OPP",
    needsTokens: ["INF_CAST"],
    needsNames: ["Aetherflux Reservoir"],
    produces: ["INF_DAMAGE_EACH_OPP"],
  },
  {
    id: "brain-freeze-storm",
    name: "Brain Freeze + INF_STORM → INF_MILL_EACH_OPP",
    needsTokens: ["INF_STORM"],
    needsNames: ["Brain Freeze"],
    produces: ["INF_MILL_EACH_OPP"],
    manaCost: 2,
    requiresCastable: true,
  },
  {
    id: "grapeshot-storm",
    name: "Grapeshot + INF_STORM → INF_DAMAGE_EACH_OPP",
    needsTokens: ["INF_STORM"],
    needsNames: ["Grapeshot"],
    produces: ["INF_DAMAGE_EACH_OPP"],
    manaCost: 2,
    requiresCastable: true,
  },
  {
    id: "tendrils-storm",
    name: "Tendrils of Agony + INF_STORM → INF_LIFELOSS_EACH_OPP",
    needsTokens: ["INF_STORM"],
    needsNames: ["Tendrils of Agony"],
    produces: ["INF_LIFELOSS_EACH_OPP"],
    manaCost: 4,
    requiresCastable: true,
  },
  {
    id: "kinnan-basalt",
    name: "Kinnan + Basalt Monolith → INF_MANA(C)",
    needsTokens: [],
    needsNames: ["Kinnan, Bonder Prodigy", "Basalt Monolith"],
    produces: ["INF_MANA"],
    produceColors: "C",
  },
  {
    id: "finale-inf-mana",
    name: "Finale of Devastation + INF_MANA → WIN",
    needsTokens: ["INF_MANA"],
    needsNames: ["Finale of Devastation"],
    produces: ["WIN"],
  },
  {
    id: "food-chain-exile",
    name: "Food Chain + exile creature → INF_MANA",
    needsTokens: [],
    needsNames: ["Food Chain"],
    needsAnyName: ["Eternal Scourge", "Misthollow Griffin", "Squee, the Immortal", "Squee, Goblin Nabob"],
    produces: ["INF_MANA"],
    produceColors: "WUBRG",
  },
  {
    id: "heliod-ballista",
    name: "Heliod + Walking Ballista → INF_DAMAGE",
    needsTokens: [],
    needsNames: ["Heliod, Sun-Crowned", "Walking Ballista"],
    produces: ["INF_DAMAGE_EACH_OPP"],
  },
  {
    id: "sisay-najeela",
    name: "Sisay + Najeela → INF_DAMAGE via extra combats",
    needsTokens: [],
    needsNames: ["Sisay, Weatherlight Captain", "Najeela, the Blade-Blossom"],
    produces: ["INF_DAMAGE_EACH_OPP"],
  },
  {
    id: "etali-thoracle",
    name: "Etali impulse into Oracle + Consult/Pact → WIN",
    needsTokens: [],
    needsNames: ["Etali, Primal Conqueror", "Thassa's Oracle"],
    needsAnyName: ["Demonic Consultation", "Tainted Pact"],
    produces: ["WIN"],
    manaCost: 7,
    requiresCastable: true,
  },
];

export const CONVERTERS_ADDED_V21 = [
  "finale-inf-mana",
  "food-chain-exile",
  "heliod-ballista",
  "sisay-najeela",
  "etali-thoracle",
];

export const CARD_ENGINE_NAMES = new Set([
  "Tymna the Weaver",
  "Thrasios, Triton Hero",
  "Kinnan, Bonder Prodigy",
  "Sisay, Weatherlight Captain",
  "Etali, Primal Conqueror",
]);

export const X_DAMAGE_SINKS = new Set(["Walking Ballista", "Hangarback Walker", "Triskelion"]);

export type ResolveWinTiming = "any" | "instant";

export type ResolveWinInput = {
  cards: GraphCard[];
  mana: ManaPool;
  libraryCount: number;
  variants: CompiledVariant[];
  templateSatisfied: (templateId: number, names: Set<string>, oracleIds: Set<string>) => boolean;
  extraConverters?: AuthoredConverter[];
  timing?: ResolveWinTiming;
};

export type WinStep = {
  name: string;
  oracleId: string;
  speed: "instant" | "sorcery";
  manaCost: string;
  cmc: number;
  from: string;
};

export type WinPlan = {
  terminal: TokenKind;
  line: string;
  variantIds: string[];
  converterIds: string[];
  manaSpent: number;
  provenance: Array<{ token: TokenKind; from: string }>;
  steps: WinStep[];
};

export type MissedWinReason = "timing" | "colors" | "sequencing" | "other";

export function emptyMana(): ManaPool {
  return { total: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, any: 0 };
}

export function addMana(pool: ManaPool, amount: number, color = "C"): void {
  pool.total += amount;
  const c = color.toUpperCase();
  if (c === "W" || c === "U" || c === "B" || c === "R" || c === "G" || c === "C") pool[c] += amount;
  else pool.any += amount;
}

export function parseManaNeeded(cost: string): { generic: number; pips: string[] } {
  if (!cost) return { generic: 0, pips: [] };
  const pips: string[] = [];
  let generic = 0;
  for (const m of cost.matchAll(/\{([^}]+)\}/g)) {
    const v = (m[1] ?? "").toUpperCase();
    if (/^\d+$/.test(v)) generic += Number(v);
    else if (v === "C") generic += 1;
    else if ("WUBRG".includes(v)) pips.push(v);
  }
  return { generic, pips };
}

export function canPay(pool: ManaPool, cost: string, fallbackGeneric = 0): boolean {
  const { generic, pips } = parseManaNeeded(cost);
  const need = generic + pips.length || fallbackGeneric;
  if (pool.total < need) return false;
  const avail = { ...pool };
  for (const p of pips) {
    const k = p as keyof ManaPool;
    if (typeof avail[k] === "number" && (avail[k] as number) > 0) {
      (avail[k] as number) -= 1;
      continue;
    }
    if (avail.any > 0) {
      avail.any -= 1;
      continue;
    }
    return false;
  }
  return true;
}

export function spendMana(pool: ManaPool, amount: number): boolean {
  if (pool.total < amount) return false;
  pool.total -= amount;
  let left = amount;
  const order: Array<keyof ManaPool> = ["any", "C", "W", "U", "B", "R", "G"];
  for (const k of order) {
    if (left <= 0) break;
    const have = pool[k] as number;
    const use = Math.min(have, left);
    (pool[k] as number) -= use;
    left -= use;
  }
  return left === 0;
}

export function spendCost(pool: ManaPool, cost: string, fallbackGeneric = 0): boolean {
  if (!canPay(pool, cost, fallbackGeneric)) return false;
  const { generic, pips } = parseManaNeeded(cost);
  const needGeneric = generic + (pips.length ? 0 : 0) || (pips.length ? generic : fallbackGeneric);
  for (const p of pips) {
    const k = p as keyof ManaPool;
    if (typeof pool[k] === "number" && (pool[k] as number) > 0) (pool[k] as number) -= 1;
    else pool.any -= 1;
    pool.total -= 1;
  }
  return spendMana(pool, needGeneric);
}

export function isInstantOrFlash(card: GraphCard): boolean {
  const tl = card.typeLine ?? "";
  const text = card.text ?? "";
  return /\binstant\b/i.test(tl) || /\bflash\b/i.test(tl) || /\bflash\b/i.test(text);
}

export function namedManaCost(card: GraphCard): string {
  if (card.manaCost) return card.manaCost;
  if (card.name === "Thassa's Oracle") return "{U}{U}";
  if (card.name === "Demonic Consultation") return "{B}";
  if (card.name === "Tainted Pact") return "{1}{B}";
  if (card.name === "Laboratory Maniac") return "{2}{U}";
  if (card.name === "Jace, Wielder of Mysteries") return "{1}{U}{U}{U}";
  if (card.name === "Brain Freeze") return "{1}{U}";
  if (card.name === "Grapeshot") return "{1}{R}";
  if (card.name === "Tendrils of Agony") return "{2}{B}{B}";
  if (card.name === "Dramatic Reversal") return "{1}{U}";
  if (card.name === "Isochron Scepter") return "{2}";
  return card.cmc ? `{${card.cmc}}` : "";
}

export function planStepsAreInstant(steps: WinStep[]): boolean {
  return steps.every((s) => s.speed === "instant");
}

export function nameMatches(cardName: string, want: string): boolean {
  if (cardName === want) return true;
  if (cardName.startsWith(`${want} //`)) return true;
  if (want.startsWith(`${cardName} //`)) return true;
  const cardFront = cardName.split(" // ")[0] ?? cardName;
  const wantFront = want.split(" // ")[0] ?? want;
  return cardFront === wantFront;
}

type CardIndex = {
  cards: GraphCard[];
  byId: Map<string, GraphCard[]>;
  byName: Map<string, GraphCard[]>;
  byFront: Map<string, GraphCard[]>;
};

function frontName(name: string): string {
  return name.split(" // ")[0] ?? name;
}

function indexCards(cards: GraphCard[]): CardIndex {
  const byId = new Map<string, GraphCard[]>();
  const byName = new Map<string, GraphCard[]>();
  const byFront = new Map<string, GraphCard[]>();
  const put = (m: Map<string, GraphCard[]>, k: string, c: GraphCard) => {
    if (!k) return;
    const list = m.get(k);
    if (list) list.push(c);
    else m.set(k, [c]);
  };
  for (const c of cards) {
    put(byId, c.oracleId, c);
    put(byName, c.name, c);
    put(byFront, frontName(c.name), c);
  }
  return { cards, byId, byName, byFront };
}

/** Same matching as nameMatches (front-face equality), via the index. */
function named(ix: CardIndex, want: string): GraphCard[] {
  return ix.byFront.get(frontName(want)) ?? [];
}

function hasNameIn(ix: CardIndex, name: string, zones: WinZone[]): boolean {
  return named(ix, name).some((c) => zones.includes(c.zone));
}

function availableZones(ix: CardIndex, tokens: Set<TokenKind>): WinZone[] {
  const z: WinZone[] = ["H", "B", "C"];
  if (hasNameIn(ix, "Underworld Breach", ["H", "B"]) || tokens.has("INF_CAST")) z.push("G");
  if (tokens.has("DRAW_LIBRARY") || tokens.has("INF_DRAW")) z.push("L");
  return z;
}

function rockMana(cards: GraphCard[], zones: WinZone[]): number {
  let n = 0;
  for (const c of cards) {
    if (!zones.includes(c.zone)) continue;
    if (c.producedMana) n += c.producedMana;
    else if (c.name === "Sol Ring") n += 2;
    else if (c.name === "Mana Vault" || c.name === "Grim Monolith" || c.name === "Basalt Monolith") n += 3;
    else if (c.name === "Mana Crypt") n += 2;
  }
  return n;
}

/** Cards matching a use by oracle id or exact name, in input order. */
function useCandidates(ix: CardIndex, u: SpellbookUse, commanderOnly = true): GraphCard[] {
  const byId = (u.oracleId ? ix.byId.get(u.oracleId) : undefined) ?? [];
  const byName = (u.name ? ix.byName.get(u.name) : undefined) ?? [];
  let out = byId;
  if (byName.length) {
    const seen = new Set(byId);
    out = [...byId, ...byName.filter((c) => !seen.has(c))];
  }
  return commanderOnly && u.mustBeCommander ? out.filter((c) => c.isCommander) : out;
}

function useSatisfied(u: SpellbookUse, cands: GraphCard[], zones: WinZone[], timing: ResolveWinTiming): boolean {
  const allowed = u.zones.length ? u.zones.filter((z) => zones.includes(z) || (z === "B" && zones.includes("H"))) : zones;
  return cands.some((c) => {
    if (timing === "instant" && c.zone !== "B" && !isInstantOrFlash(c) && (u.zones.includes("B") || c.zone === "H" || c.zone === "C")) {
      return false;
    }
    if (c.zone === "C") return timing !== "instant" || isInstantOrFlash(c);
    return allowed.includes(c.zone) || (c.zone === "H" && allowed.includes("B"));
  });
}

const ROCK_PREREQ = /nonland permanents you control can tap to produce at least \{3\}/i;

function variantReady(
  v: CompiledVariant,
  ix: CardIndex,
  zones: WinZone[],
  present: { names: Set<string>; ids: Set<string> },
  templateSatisfied: ResolveWinInput["templateSatisfied"],
  timing: ResolveWinTiming,
  rock: number,
): boolean {
  for (const u of v.uses) {
    if (!useSatisfied(u, useCandidates(ix, u), zones, timing)) return false;
  }
  for (const tid of v.templateIds) {
    if (!templateSatisfied(tid, present.names, present.ids)) return false;
  }
  if (ROCK_PREREQ.test(v.notablePrerequisites) && rock < 3) return false;
  return true;
}

/** Variant pieces that must be cast from hand/command zone onto the battlefield (each once). */
function variantCastPieces(v: CompiledVariant, ix: CardIndex, alreadyCast?: Set<GraphCard>): GraphCard[] {
  const out: GraphCard[] = [];
  for (const u of v.uses) {
    const cands = useCandidates(ix, u, false);
    if (cands.some((c) => c.zone === "B")) continue;
    const inHand = cands.find((c) => c.zone === "H" || c.zone === "C");
    if (inHand && u.zones.includes("B") && !alreadyCast?.has(inHand) && !out.includes(inHand)) out.push(inHand);
  }
  return out;
}

function variantCastCost(v: CompiledVariant, ix: CardIndex, alreadyCast?: Set<GraphCard>): number {
  const extra = variantCastPieces(v, ix, alreadyCast).reduce((s, c) => s + c.cmc, 0);
  return Math.max(v.manaValueNeeded, extra);
}

function converterNeedsSorceryCast(conv: AuthoredConverter, ix: CardIndex): boolean {
  if (!conv.requiresCastable) return false;
  const wanted = [...(conv.needsNames ?? []), ...(conv.needsAnyName ?? [])];
  return wanted.some((n) => {
    const piece = named(ix, n)[0];
    if (!piece) return false;
    if (piece.zone === "B") return false;
    return !isInstantOrFlash(piece);
  });
}

/**
 * Names this converter casts. needsNames always; for needsAnyName only one
 * card, and none if one is already on the battlefield or the names are a
 * precondition for a later converter.
 */
function converterCastNames(conv: AuthoredConverter, ix: CardIndex): string[] {
  const out = [...(conv.needsNames ?? [])];
  const any = conv.needsAnyName ?? [];
  if (any.length && !conv.anyNameIsPrecondition && !any.some((n) => named(ix, n).some((c) => c.zone === "B"))) {
    const first = any.find((n) => named(ix, n).some((c) => c.zone === "H" || c.zone === "C")) ?? any[0]!;
    out.push(first);
  }
  return out;
}

/**
 * The single casting price used by both the resolver and the plan executor:
 * each card leaving hand/command zone is paid once. An authored manaCost is
 * the whole converter's price, charged on its first uncast piece.
 */
function converterCasts(conv: AuthoredConverter, ix: CardIndex, alreadyCast: Set<GraphCard>): Array<{ card: GraphCard; price: number; payStr: string }> {
  const pieces: GraphCard[] = [];
  for (const n of converterCastNames(conv, ix)) {
    const piece = named(ix, n).find((c) => c.zone === "H" || c.zone === "C");
    if (piece && !alreadyCast.has(piece) && !pieces.includes(piece)) pieces.push(piece);
  }
  if (conv.manaCost != null) {
    return pieces.map((card, i) => ({
      card,
      price: i === 0 ? conv.manaCost! : 0,
      payStr: i === 0 && pieces.length === 1 ? namedManaCost(card) : "",
    }));
  }
  return pieces.map((card) => ({ card, price: card.cmc, payStr: namedManaCost(card) }));
}

/** Pays casts from `pool` all-or-nothing; returns mana spent or null. */
function payCasts(pool: ManaPool, casts: Array<{ price: number; payStr: string }>): number | null {
  const trial = { ...pool };
  for (const c of casts) {
    if (c.price <= 0) continue;
    const parsed = parseManaNeeded(c.payStr);
    if (c.payStr && parsed.generic + parsed.pips.length === c.price) {
      if (!spendCost(trial, c.payStr, c.price)) return null;
    } else if (!spendMana(trial, c.price)) return null;
  }
  const paid = pool.total - trial.total;
  Object.assign(pool, trial);
  return paid;
}

function stepFor(card: GraphCard, from: string): WinStep {
  return {
    name: card.name,
    oracleId: card.oracleId,
    speed: isInstantOrFlash(card) ? "instant" : "sorcery",
    manaCost: namedManaCost(card),
    cmc: card.cmc,
    from,
  };
}

function makePlan(
  terminal: TokenKind,
  usedVariants: string[],
  usedConverters: string[],
  spent: number,
  provenance: Array<{ token: TokenKind; from: string }>,
  steps: WinStep[],
  fallbackLine?: string,
): WinPlan {
  return {
    terminal,
    line: [...usedVariants, ...usedConverters].join("+") || fallbackLine || "",
    variantIds: usedVariants,
    converterIds: usedConverters,
    manaSpent: spent,
    provenance,
    steps,
  };
}

type FixedPoint = {
  plan: WinPlan | null;
  tokens: Map<TokenKind, ResourceToken>;
  zones: WinZone[];
  ix: CardIndex;
  rock: number;
  converters: AuthoredConverter[];
  variants: CompiledVariant[];
  /** Mana each fired element paid, keyed by token source ("variant:<id>" or converter id). */
  sourceCost: Map<string, number>;
};

function sortedConverters(input: ResolveWinInput): AuthoredConverter[] {
  return [...AUTHORED_CONVERTERS, ...(input.extraConverters ?? [])].sort((a, b) => a.id.localeCompare(b.id));
}

function presentIn(ix: CardIndex, zones: WinZone[]): { names: Set<string>; ids: Set<string> } {
  const names = new Set<string>();
  const ids = new Set<string>();
  for (const c of ix.cards) {
    if (!zones.includes(c.zone)) continue;
    names.add(c.name);
    ids.add(c.oracleId);
  }
  return { names, ids };
}

/**
 * Greedy fixed point over converters and variants. `only` restricts the
 * elements allowed to fire (used to re-check one closest line in isolation so
 * mana spent on unrelated elements cannot block it).
 */
function runFixedPoint(
  input: ResolveWinInput,
  only?: { variants: Set<string>; converters: Set<string> },
): FixedPoint {
  const ix = indexCards(input.cards);
  const rock = rockMana(input.cards, ["B", "H"]);
  const tokens = new Map<TokenKind, ResourceToken>();
  const provenance: Array<{ token: TokenKind; from: string }> = [];
  const usedVariants: string[] = [];
  const usedConverters: string[] = [];
  const steps: WinStep[] = [];
  const castSet = new Set<GraphCard>();
  const sourceCost = new Map<string, number>();
  const mana = { ...input.mana };
  let spent = 0;
  const timing = input.timing ?? "any";

  if (input.libraryCount <= 0) {
    tokens.set("LIBRARY_EMPTY", { kind: "LIBRARY_EMPTY", source: "library-empty" });
    provenance.push({ token: "LIBRARY_EMPTY", from: "library-empty" });
  }

  const allConverters = sortedConverters(input);
  const allVariants = input.variants.slice().sort((a, b) => a.id.localeCompare(b.id));
  const converters = only ? allConverters.filter((c) => only.converters.has(c.id)) : allConverters;
  const variants = only ? allVariants.filter((v) => only.variants.has(v.id)) : allVariants;

  const addToken = (t: ResourceToken) => {
    if (tokens.has(t.kind)) return false;
    tokens.set(t.kind, t);
    provenance.push({ token: t.kind, from: t.source });
    return true;
  };
  const lethal = () => [...tokens.keys()].find(isLethalToken) ?? null;
  const done = (plan: WinPlan | null): FixedPoint => ({
    plan,
    tokens,
    zones: availableZones(ix, new Set(tokens.keys())),
    ix,
    rock,
    converters: allConverters,
    variants: allVariants,
    sourceCost,
  });

  let changed = true;
  let guard = 0;
  let zones = availableZones(ix, new Set(tokens.keys()));

  const tryConverter = (conv: AuthoredConverter): boolean => {
    if (usedConverters.includes(conv.id)) return false;
    if (conv.needsTokens.some((t) => !tokens.has(t))) return false;
    if (conv.needsNames && !conv.needsNames.every((n) => hasNameIn(ix, n, zones))) return false;
    if (conv.needsAnyName && !conv.needsAnyName.some((n) => hasNameIn(ix, n, zones))) return false;
    if (conv.needsRockMana != null && rock < conv.needsRockMana) return false;
    if (timing === "instant" && converterNeedsSorceryCast(conv, ix) && !tokens.has("INF_MANA") && !tokens.has("INF_CAST")) return false;
    if (conv.requiresCastable) {
      const wanted = [...(conv.needsNames ?? []), ...(conv.needsAnyName ?? [])];
      const piece = ix.cards.find((c) => wanted.some((n) => nameMatches(c.name, n)) && zones.includes(c.zone));
      if (!piece) return false;
      if (piece.zone === "L" && !tokens.has("DRAW_LIBRARY") && !tokens.has("INF_DRAW")) return false;
    }
    const casts = converterCasts(conv, ix, castSet);
    if (!tokens.has("INF_MANA")) {
      const paid = payCasts(mana, casts);
      if (paid == null) return false;
      spent += paid;
      sourceCost.set(conv.id, paid);
    }
    for (const c of casts) {
      castSet.add(c.card);
      steps.push(stepFor(c.card, conv.id));
    }
    usedConverters.push(conv.id);
    for (const kind of conv.produces) {
      if (addToken({ kind, colors: conv.produceColors, source: conv.id })) changed = true;
    }
    return true;
  };

  while (changed && guard < 32) {
    changed = false;
    guard += 1;
    zones = availableZones(ix, new Set(tokens.keys()));
    const present = presentIn(ix, zones);

    for (const conv of converters) {
      if (!tryConverter(conv)) continue;
      const terminal = lethal();
      if (terminal) return done(makePlan(terminal, usedVariants, usedConverters, spent, provenance, steps));
    }

    for (const v of variants) {
      if (usedVariants.includes(v.id)) continue;
      if (!variantReady(v, ix, zones, present, input.templateSatisfied, timing, rock)) continue;
      const pieces = variantCastPieces(v, ix, castSet);
      const cost = tokens.has("INF_MANA") ? 0 : variantCastCost(v, ix, castSet);
      const payStr = v.manaNeeded;
      if (cost > 0) {
        if (payStr && !canPay(mana, payStr, cost)) continue;
        if (!payStr && mana.total < cost) continue;
        if (!spendMana(mana, cost)) continue;
        spent += cost;
        sourceCost.set(`variant:${v.id}`, cost);
      }
      for (const c of pieces) {
        castSet.add(c);
        steps.push(stepFor(c, `variant:${v.id}`));
      }
      usedVariants.push(v.id);
      for (const t of v.tokens) {
        if (addToken({ ...t, source: `variant:${v.id}` })) changed = true;
      }
      if (!v.tokens.length) {
        for (const t of featureNameToTokens("Win the game", `variant:${v.id}`)) {
          if (v.terminal && addToken(t)) changed = true;
        }
      }
      const terminal = lethal();
      if (terminal) return done(makePlan(terminal, usedVariants, usedConverters, spent, provenance, steps, v.id));
    }

    for (const conv of converters) {
      if (!tryConverter(conv)) continue;
      const terminal = lethal();
      if (terminal) return done(makePlan(terminal, usedVariants, usedConverters, spent, provenance, steps));
    }
  }
  return done(null);
}

export type WinGapPiece = {
  oracleId: string;
  name: string;
  cmc: number;
  /** Zones the line needs this piece in. */
  zones: WinZone[];
  /** Where the nearest copy is now; "template"/"prereq" are non-card requirements. */
  where: WinZone | "template" | "prereq";
};

/** Closest line when there is no win, read off the same fixed point resolveWin ran. */
export type WinGap = {
  line: string;
  terminal: TokenKind;
  variantIds: string[];
  converterIds: string[];
  missingPieces: WinGapPiece[];
  manaNeeded: number;
  /** Generic shortfall, or ≥1 when the total suffices but colors do not. */
  manaShort: number;
  colorShort: boolean;
  timingBlocked: boolean;
  lineCards: string[];
};

export type WinEvaluation = {
  plan: WinPlan | null;
  closest: WinGap | null;
  /** Closest line reports nothing missing but the resolver still found no plan. */
  resolverRejected: boolean;
};

type Chain = {
  pieces: Map<string, WinGapPiece>;
  /** Non-cast mana (variant activation); card casts are in `casts`, priced once per name. */
  cost: number;
  casts: Map<string, number>;
  infMana: boolean;
  timingBlocked: boolean;
  colorShort: boolean;
  variantIds: string[];
  converterIds: string[];
  lineCards: Set<string>;
};

const LETHAL_KINDS: TokenKind[] = ["WIN", "INF_DAMAGE_EACH_OPP", "INF_LIFELOSS_EACH_OPP", "INF_MILL_EACH_OPP"];
const WHERE_ORDER: WinZone[] = ["L", "H", "C", "B", "G", "E"];
const GAP_DEPTH = 4;

function emptyChain(): Chain {
  return {
    pieces: new Map(),
    cost: 0,
    casts: new Map(),
    infMana: false,
    timingBlocked: false,
    colorShort: false,
    variantIds: [],
    converterIds: [],
    lineCards: new Set(),
  };
}

function mergeChain(into: Chain, from: Chain): void {
  for (const [k, p] of from.pieces) if (!into.pieces.has(k)) into.pieces.set(k, p);
  into.cost += from.cost;
  for (const [n, p] of from.casts) if (!into.casts.has(n)) into.casts.set(n, p);
  into.infMana ||= from.infMana;
  into.timingBlocked ||= from.timingBlocked;
  into.colorShort ||= from.colorShort;
  for (const id of from.variantIds) if (!into.variantIds.includes(id)) into.variantIds.push(id);
  for (const id of from.converterIds) if (!into.converterIds.includes(id)) into.converterIds.push(id);
  for (const n of from.lineCards) into.lineCards.add(n);
}

function setCast(ch: Chain, name: string, price: number): void {
  if (!ch.casts.has(name)) ch.casts.set(name, price);
}

function total(ch: Chain): number {
  let n = ch.cost;
  for (const p of ch.casts.values()) n += p;
  return n;
}

function locate(cands: GraphCard[]): GraphCard | null {
  for (const z of WHERE_ORDER) {
    const c = cands.find((x) => x.zone === z);
    if (c) return c;
  }
  return null;
}

function closestGap(input: ResolveWinInput, fp: FixedPoint): WinGap | null {
  const { ix, zones, tokens, rock } = fp;
  const timing = input.timing ?? "any";
  const pool = input.mana;
  const present = presentIn(ix, zones);
  const short = (c: Chain) => Math.max(0, total(c) - pool.total, c.colorShort ? 1 : 0);
  const key = (c: Chain) => [...c.variantIds, ...c.converterIds].join("+");
  const better = (a: Chain, b: Chain) =>
    a.pieces.size - b.pieces.size ||
    short(a) - short(b) ||
    Number(a.timingBlocked) - Number(b.timingBlocked) ||
    key(a).localeCompare(key(b));

  const presentChain = (t: TokenKind, seen: Set<TokenKind>): Chain => {
    const ch = emptyChain();
    if (t === "INF_MANA") ch.infMana = true;
    const src = tokens.get(t)?.source ?? "";
    if (seen.has(t)) return ch;
    seen.add(t);
    ch.casts.set(`src:${src}`, fp.sourceCost.get(src) ?? 0);
    if (src.startsWith("variant:")) {
      const id = src.slice("variant:".length);
      ch.variantIds.push(id);
      const v = fp.variants.find((x) => x.id === id);
      for (const u of v?.uses ?? []) ch.lineCards.add(u.name);
    } else {
      const conv = fp.converters.find((c) => c.id === src);
      if (conv) {
        ch.converterIds.push(conv.id);
        for (const n of [...(conv.needsNames ?? []), ...(conv.needsAnyName ?? [])]) ch.lineCards.add(n);
        for (const need of conv.needsTokens) if (tokens.has(need)) mergeChain(ch, presentChain(need, seen));
      }
    }
    return ch;
  };

  const variantChain = (v: CompiledVariant): Chain | null => {
    const ch = emptyChain();
    ch.variantIds.push(v.id);
    for (const u of v.uses) {
      ch.lineCards.add(u.name);
      const cands = useCandidates(ix, u);
      if (useSatisfied(u, cands, zones, timing)) continue;
      if (timing === "instant" && useSatisfied(u, cands, zones, "any")) {
        ch.timingBlocked = true;
        continue;
      }
      const at = locate(cands);
      if (!at) return null;
      ch.pieces.set(u.oracleId || u.name, { oracleId: u.oracleId || at.oracleId, name: u.name || at.name, cmc: at.cmc, zones: u.zones, where: at.zone });
    }
    for (const tid of v.templateIds) {
      if (input.templateSatisfied(tid, present.names, present.ids)) continue;
      ch.pieces.set(`template:${tid}`, { oracleId: "", name: `template:${tid}`, cmc: 0, zones: [], where: "template" });
    }
    if (ROCK_PREREQ.test(v.notablePrerequisites) && rock < 3) {
      ch.pieces.set("prereq:rock3", { oracleId: "", name: "prereq:rock3", cmc: 0, zones: [], where: "prereq" });
    }
    if (!tokens.has("INF_MANA")) {
      let fetchedCmc = 0;
      for (const p of ch.pieces.values()) {
        if (p.where !== "template" && p.where !== "prereq" && p.zones.includes("B")) fetchedCmc += p.cmc;
      }
      const base = variantCastCost(v, ix);
      ch.cost = Math.max(v.manaValueNeeded, base + fetchedCmc);
      if (!ch.pieces.size && ch.cost > 0 && v.manaNeeded && pool.total >= ch.cost && !canPay(pool, v.manaNeeded, ch.cost)) {
        ch.colorShort = true;
      }
    }
    ch.infMana = v.tokens.some((t) => t.kind === "INF_MANA");
    return ch;
  };

  const memo = new Map<string, Chain | null>();

  const convChain = (conv: AuthoredConverter, depth: number, stack: Set<TokenKind>): Chain | null => {
    const ch = emptyChain();
    ch.converterIds.push(conv.id);
    const wanted = [...(conv.needsNames ?? []), ...(conv.needsAnyName ?? [])];
    for (const n of wanted) ch.lineCards.add(n);
    for (const n of conv.needsNames ?? []) {
      if (hasNameIn(ix, n, zones)) continue;
      const at = locate(named(ix, n));
      if (!at) return null;
      ch.pieces.set(at.oracleId || n, { oracleId: at.oracleId, name: at.name, cmc: at.cmc, zones: ["H", "B"], where: at.zone });
    }
    if (conv.needsAnyName?.length && !conv.needsAnyName.some((n) => hasNameIn(ix, n, zones))) {
      const at = locate(conv.needsAnyName.flatMap((n) => named(ix, n)));
      if (!at) return null;
      ch.pieces.set(at.oracleId || at.name, { oracleId: at.oracleId, name: at.name, cmc: at.cmc, zones: ["H", "B"], where: at.zone });
    }
    if (conv.needsRockMana != null && rock < conv.needsRockMana) {
      ch.pieces.set(`prereq:rock${conv.needsRockMana}`, { oracleId: "", name: `prereq:rock${conv.needsRockMana}`, cmc: 0, zones: [], where: "prereq" });
    }
    const ownMissing = [...ch.pieces.values()].filter((p) => p.where !== "prereq");
    for (const t of conv.needsTokens) {
      if (tokens.has(t)) {
        mergeChain(ch, presentChain(t, new Set()));
        continue;
      }
      const sub = tokenGap(t, depth + 1, stack);
      if (!sub) return null;
      mergeChain(ch, sub);
    }
    const infinite = tokens.has("INF_MANA") || ch.infMana;
    if (timing === "instant" && !infinite && !tokens.has("INF_CAST") && converterNeedsSorceryCast(conv, ix)) ch.timingBlocked = true;
    if (!infinite) {
      const casts = converterCasts(conv, ix, new Set());
      const castNames = converterCastNames(conv, ix);
      const fetched = ownMissing.filter((p) => castNames.some((n) => nameMatches(p.name, n)));
      if (conv.manaCost != null) {
        const first = casts[0]?.card.name ?? fetched[0]?.name;
        if (first) setCast(ch, first, conv.manaCost);
      } else {
        for (const c of casts) setCast(ch, c.card.name, c.price);
        for (const p of fetched) setCast(ch, p.name, p.cmc);
      }
      const only = casts.length === 1 ? casts[0]! : null;
      if (only && only.price > 0 && !ch.pieces.size && only.payStr && pool.total >= total(ch) && !canPay(pool, only.payStr, only.price)) {
        ch.colorShort = true;
      }
    }
    if (conv.produces.includes("INF_MANA")) ch.infMana = true;
    return ch;
  };

  const tokenGap = (t: TokenKind, depth: number, stack: Set<TokenKind>): Chain | null => {
    if (tokens.has(t)) return presentChain(t, new Set());
    if (depth > GAP_DEPTH || stack.has(t)) return null;
    const memoKey = `${t}|${[...stack].sort().join(",")}`;
    if (memo.has(memoKey)) return memo.get(memoKey) ?? null;
    const next = new Set(stack).add(t);
    let best: Chain | null = null;
    for (const conv of fp.converters) {
      if (!conv.produces.includes(t)) continue;
      const c = convChain(conv, depth, next);
      if (c && (!best || better(c, best) < 0)) best = c;
    }
    for (const v of fp.variants) {
      const produces = v.tokens.length ? v.tokens.some((x) => x.kind === t) : v.terminal && t === "WIN";
      if (!produces) continue;
      const c = variantChain(v);
      if (c && (!best || better(c, best) < 0)) best = c;
    }
    memo.set(memoKey, best);
    return best;
  };

  let best: { chain: Chain; terminal: TokenKind } | null = null;
  for (const t of LETHAL_KINDS) {
    const c = tokenGap(t, 0, new Set());
    if (c && (!best || better(c, best.chain) < 0)) best = { chain: c, terminal: t };
  }
  if (!best) return null;
  const c = best.chain;
  return {
    line: key(c),
    terminal: best.terminal,
    variantIds: c.variantIds,
    converterIds: c.converterIds,
    missingPieces: [...c.pieces.values()],
    manaNeeded: total(c),
    manaShort: short(c),
    colorShort: c.colorShort,
    timingBlocked: c.timingBlocked,
    lineCards: [...c.lineCards],
  };
}

/**
 * Single source of truth for win/no-win. When there is no plan, `closest` is
 * the nearest line on the same graph: missing pieces, mana short, timing.
 */
export function evaluateWin(input: ResolveWinInput): WinEvaluation {
  const fp = runFixedPoint(input);
  if (fp.plan) return { plan: fp.plan, closest: null, resolverRejected: false };
  const gap = closestGap(input, fp);
  if (!gap) return { plan: null, closest: null, resolverRejected: false };
  if (!gap.missingPieces.length && gap.manaShort === 0 && !gap.timingBlocked) {
    const only = { variants: new Set(gap.variantIds), converters: new Set(gap.converterIds) };
    const focused = runFixedPoint(input, only);
    if (focused.plan) return { plan: focused.plan, closest: null, resolverRejected: false };
    const colorBlind: ManaPool = { total: input.mana.total, any: input.mana.total, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    if (runFixedPoint({ ...input, mana: colorBlind }, only).plan) {
      return { plan: null, closest: { ...gap, colorShort: true, manaShort: 1 }, resolverRejected: false };
    }
    return { plan: null, closest: gap, resolverRejected: true };
  }
  return { plan: null, closest: gap, resolverRejected: false };
}

export function resolveWin(input: ResolveWinInput): WinPlan | null {
  return evaluateWin(input).plan;
}

export function diagnoseMissedWin(input: ResolveWinInput): MissedWinReason | null {
  const any = resolveWin({ ...input, timing: "any" });
  if (!any) return null;
  const colorBlindMana: ManaPool = {
    total: input.mana.total,
    any: input.mana.total,
    W: 0,
    U: 0,
    B: 0,
    R: 0,
    G: 0,
    C: 0,
  };
  const colored = resolveWin(input);
  const relaxed = resolveWin({ ...input, mana: colorBlindMana, timing: "any" });
  if (!colored && relaxed) return "colors";
  const instant = resolveWin({ ...input, timing: "instant" });
  if (!instant && any) return "timing";
  if (colored) return "sequencing";
  return "other";
}

export function tokensFromFeatures(
  features: Array<{ name: string }>,
  source: string,
): ResourceToken[] {
  const out: ResourceToken[] = [];
  const seen = new Set<string>();
  for (const f of features) {
    for (const t of featureNameToTokens(f.name, source)) {
      const k = `${t.kind}:${t.colors ?? ""}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(t);
    }
  }
  return out;
}

export function isTerminalFeatureSet(tokens: ResourceToken[]): boolean {
  return tokens.some((t) => isLethalToken(t.kind));
}
