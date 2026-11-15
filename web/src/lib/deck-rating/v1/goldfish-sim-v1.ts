/**
 * Goldfish speed sim v1.1 + policy v2 (resource-graph win, planner, stand-in
 * opponents, mulligan v2). Combat goldfish remains the fallback clock.
 */
import { familiesFromCardV1_1 } from "./tag-families-v1.1";
import { FAST_MANA_TABLE, fastManaModel, isAuthoredFastMana } from "./goldfish-fast-mana-v1.1";
import {
  AUTHORED_WIN_LINE_NAMES,
  DEMONIC_CONSULTATION,
  TAINTED_PACT,
  THASSAS_ORACLE,
  oracleLineCost,
} from "./goldfish-win-lines-v1.1";
import { isGoldfishInert } from "./goldfish-inert-v1";
import { DR_GOLDFISH_RMST_CAP, midrankW, onTimeRate, rmst15 } from "./goldfish-metrics-v1.1";
import {
  CARD_ENGINE_NAMES,
  canPay,
  diagnoseMissedWin,
  emptyMana,
  evaluateWin,
  resolveWin,
  spendCost,
  type CompiledVariant,
  type GraphCard,
  type ManaPool,
  type MissedWinReason,
  type ResolveWinInput,
  type ResolveWinTiming,
  type WinGap,
  type WinGapPiece,
  type WinPlan,
} from "./goldfish-resource-graph-v2";
import { buildableVariantsForDeck, templatePredicate, type SpellbookIndex } from "./goldfish-spellbook-index-v2";
import { bottomMulliganV2, isManaSourceV2, keepMulliganV2 } from "./goldfish-mulligan-v2";
import { opponentRoundTriggers, OPPONENT_MODEL_NOTES } from "./goldfish-opponents-v2";
import {
  commanderShouldLead,
  distanceFromGap,
  lookaheadDepth,
  tutorAdvancesPiece,
  tutorDestinationFromText,
  tutorFindsPiece,
  tutorTypeRestriction,
} from "./goldfish-planner-v2";

export type GoldfishInvariantKind = "a" | "b";

/**
 * (a) distance == 0 ⇔ resolveWin returns a plan.
 * (b) never end a turn holding a castable tutor that can legally fetch a
 *     missing piece of the target line.
 */
export type GoldfishInvariantReport = {
  checks: number;
  a: number;
  b: number;
  /** Win-text cards cast without a resolver plan (v2.1 scored these as wins). */
  unbackedWinText: number;
  examples: Array<{ kind: GoldfishInvariantKind; traceId: string; detail: string; state: string }>;
};

export function emptyInvariantReport(): GoldfishInvariantReport {
  return { checks: 0, a: 0, b: 0, unbackedWinText: 0, examples: [] };
}

export function goldfishInvariantsFromEnv(): boolean {
  return typeof process !== "undefined" && process.env?.DR_GOLDFISH_INVARIANTS === "1";
}

type InvariantSink = GoldfishInvariantReport & { traceBase: string; maxExamples: number; fullState: boolean };

const LINE_SENSITIVE = new Set([THASSAS_ORACLE, DEMONIC_CONSULTATION, TAINTED_PACT]);

export const DR_GOLDFISH_SIM_V1 = "deck-rating-goldfish-sim-v1.1";
export const DR_GOLDFISH_POLICY_V2 = "deck-rating-goldfish-policy-v2";
export const DR_GOLDFISH_GAMES = 10_000;
export const DR_GOLDFISH_TURN_CAP = DR_GOLDFISH_RMST_CAP;
export const GOLDFISH_OPPONENT_MODEL = OPPONENT_MODEL_NOTES.opponentModel;

const WIN_WATCH = new Set([
  "Thassa's Oracle",
  "Demonic Consultation",
  "Tainted Pact",
  "Laboratory Maniac",
  "Jace, Wielder of Mysteries",
  "Thrasios, Triton Hero",
  "Walking Ballista",
  "Hangarback Walker",
  "Triskelion",
  "Isochron Scepter",
  "Dramatic Reversal",
  "Underworld Breach",
  "Lion's Eye Diamond",
  "Brain Freeze",
  "Grapeshot",
  "Tendrils of Agony",
  "Aetherflux Reservoir",
  "Kinnan, Bonder Prodigy",
  "Basalt Monolith",
]);

let _spellbook: SpellbookIndex | null = null;
export function setGoldfishSpellbookIndex(index: SpellbookIndex | null): void {
  _spellbook = index;
}
export function getGoldfishSpellbookIndex(): SpellbookIndex | null {
  return _spellbook;
}

export type GoldfishSimCard = {
  oracleId: string;
  name: string;
  cmc: number;
  isLand: boolean;
  isCreature: boolean;
  isCommander: boolean;
  power: number;
  rampMana: number;
  rampLands: number;
  drawCards: number;
  isTutor: boolean;
  isWinText: boolean;
  isPoison: boolean;
  modeledBeyondCast: boolean;
  fidelity: "full" | "partial" | "castOnly" | "goldfishInert";
  isMdfcLand: boolean;
  mdfcTapped: boolean;
  countsAsLand: boolean;
  hasteEquipCost: number | null;
  hasteAnthem: boolean;
  landAura: boolean;
  extraLandDrop: boolean;
  faceDamage: number;
  typeLine: string;
  text: string;
  isInstant: boolean;
  isFlash: boolean;
  isSorcery: boolean;
  isArtifact: boolean;
  isEnchantment: boolean;
  colors: string;
  manaCost: string;
  isManaSource: boolean;
  isCardEngine: boolean;
  tutorDest: "hand" | "top" | "bf" | "grave";
  tutorTypes: string[];
  producedMana: number;
  deathtouch: boolean;
  evasion: boolean;
};

export type GoldfishSimResult = {
  version: typeof DR_GOLDFISH_SIM_V1;
  nGames: number;
  seed: number;
  mean: number;
  p25: number;
  p50: number;
  p75: number;
  pByT4: number;
  pByT6: number;
  pByT8: number;
  coverage: number;
  coverageN: number;
  lowConfidence: boolean;
  iqr: number;
  rmst15: number;
  tWinMean: number | null;
};

export function deckHashSeed(oracleIds: string[]): number {
  let h = 2166136261;
  const s = oracleIds.slice().sort().join("|");
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function extraManaFromText(text: string): number {
  let n = 0;
  for (const m of text.matchAll(/add ((?:\{[^}]+\}|\s)+)/gi)) {
    const chunk = m[1] ?? "";
    n += [...chunk.matchAll(/\{(\d+)\}/g)].reduce((s, x) => s + Number(x[1]), 0);
    n += (chunk.match(/\{[WUBRGC]/gi) ?? []).length;
  }
  if (!n && /\badd (?:two|that much) mana\b/i.test(text)) n = 2;
  if (!n && /\badd (?:one|x) mana\b/i.test(text)) n = 1;
  if (!n && /create (?:a |x )?treasure token/i.test(text)) n = 1;
  return n;
}

function drawCountFromText(text: string): number {
  if (/\bdraw (?:three|four|seven) cards\b/i.test(text)) return 3;
  if (/\bdraw (?:two|x) cards\b/i.test(text) || /\bdraw cards equal to\b/i.test(text)) return 2;
  if (/\bcycling\b/i.test(text) || /\bdraw (?:a card|cards)\b/i.test(text)) return 1;
  return 0;
}

export function classifyGoldfishCard(input: {
  oracleId: string;
  name: string;
  typeLine?: string;
  text?: string;
  cmc?: number;
  power?: number | null;
  isCommander?: boolean;
  manaCost?: string;
  colors?: string[];
}): GoldfishSimCard {
  const typeLine = input.typeLine ?? "";
  const text = input.text ?? "";
  const fam = familiesFromCardV1_1({ typeLine, oracleText: text });
  const isLand = /\bland\b/i.test(typeLine) && !/\bcreature\b/i.test(typeLine);
  const isCreature = /\bcreature\b/i.test(typeLine);
  const authoredFast = isAuthoredFastMana(input.name);
  const authoredLine = AUTHORED_WIN_LINE_NAMES.has(input.name);
  const faces = typeLine.split(/\s\/\/\s/);
  const isMdfcLand = faces.length > 1 && faces.some((f) => /\bland\b/i.test(f));
  const mdfcTapped = isMdfcLand && /enters (?:the battlefield )?tapped/i.test(text);
  const countsAsLand = isLand || isMdfcLand;
  const landAura =
    /enchant land/i.test(text) &&
    (/\badd (?:\{|one mana)/i.test(text) || /enchanted land (?:is|has|gets)/i.test(text) || /whenever enchanted land is tapped/i.test(text));
  const extraLandDrop = /play an additional land/i.test(text) || input.name === "Exploration";
  const hasteEquipCost =
    input.name === "Lightning Greaves" ? 0 : input.name === "Swiftfoot Boots" ? 1 : null;
  const hasteAnthem = input.name === "Rhythm of the Wild" || /creatures you control.*\bhaste\b/i.test(text);
  const faceDamage =
    input.name === "Lightning Bolt" ? 3 : input.name === "Boros Charm" ? 4 : 0;
  const rampLands =
    !authoredFast && fam.has("ramp") && /\bland cards?\b/i.test(text) && /onto the battlefield/i.test(text) ? 1 : 0;
  const rampMana = authoredFast
    ? 0
    : isLand
      ? 0
      : landAura
        ? 1
        : extraManaFromText(text) || (fam.has("ramp") && !rampLands ? 1 : 0);
  const drawCards =
    input.name === "Sylvan Library"
      ? 2
      : fam.has("draw")
        ? Math.max(1, drawCountFromText(text))
        : drawCountFromText(text);
  const isTutor =
    fam.has("tutor") || input.name === "Beseech the Mirror" || input.name === "Entomb";
  const isWinText =
    input.name === THASSAS_ORACLE || /\byou win the game\b/i.test(text) || /\beach opponent (?:loses|gets)\b/i.test(text);
  const isPoison = /\b(infect|toxic|poisonous|poison counter)\b/i.test(text);
  const power = input.power ?? 0;
  const inert = isGoldfishInert({ name: input.name, typeLine, text });
  const clockAuthored =
    authoredFast ||
    authoredLine ||
    hasteEquipCost != null ||
    hasteAnthem ||
    landAura ||
    extraLandDrop ||
    isMdfcLand ||
    faceDamage > 0 ||
    input.name === "Entomb" ||
    input.name === "Reanimate" ||
    input.name === "Animate Dead" ||
    input.name === "Victimize" ||
    input.name === "Walking Ballista" ||
    input.name === "Akroma's Will" ||
    input.name === "Windfall" ||
    input.name === "Wheel of Fortune" ||
    input.name === "Sylvan Library";
  const modeledBeyondCast = Boolean(
    clockAuthored ||
      isLand ||
      rampMana ||
      rampLands ||
      drawCards ||
      isTutor ||
      isWinText ||
      isPoison ||
      (isCreature && power > 0),
  );
  const fidelity: GoldfishSimCard["fidelity"] = inert
    ? "goldfishInert"
    : clockAuthored
      ? "full"
      : modeledBeyondCast
        ? "full"
        : "castOnly";
  return {
    oracleId: input.oracleId,
    name: input.name,
    cmc: input.cmc ?? 0,
    isLand,
    isCreature,
    isCommander: Boolean(input.isCommander),
    power,
    rampMana,
    rampLands,
    drawCards,
    isTutor,
    isWinText,
    isPoison,
    modeledBeyondCast,
    fidelity,
    isMdfcLand,
    mdfcTapped,
    countsAsLand,
    hasteEquipCost,
    hasteAnthem,
    landAura,
    extraLandDrop,
    faceDamage,
    typeLine,
    text,
    isInstant: /\binstant\b/i.test(typeLine),
    isFlash: /\bflash\b/i.test(typeLine) || /\bflash\b/i.test(text),
    isSorcery: /\bsorcery\b/i.test(typeLine),
    isArtifact: /\bartifact\b/i.test(typeLine),
    isEnchantment: /\benchantment\b/i.test(typeLine),
    colors: (input.colors ?? []).join("") || colorsFromType(typeLine, text),
    manaCost: input.manaCost ?? "",
    isManaSource: isManaSourceV2({
      countsAsLand,
      cmc: input.cmc ?? 0,
      isLand,
      name: input.name,
      rampMana,
      text,
      authoredFast,
    }),
    isCardEngine: CARD_ENGINE_NAMES.has(input.name),
    tutorDest: isTutor ? tutorDestinationFromText(text) : "hand",
    tutorTypes: isTutor ? tutorTypeRestriction(text) : [],
    producedMana: authoredFast ? (fastManaModel(input.name)?.tapMana ?? extraManaFromText(text)) : extraManaFromText(text) || rampMana,
    deathtouch: /\bdeathtouch\b/i.test(text) || input.name === "Fynn, the Fangbearer",
    evasion: /\b(flying|shadow|unblockable|can't be blocked|menace|horsemanship)\b/i.test(text),
  };
}

function colorsFromType(typeLine: string, text: string): string {
  let c = "";
  if (/\bplains\b/i.test(typeLine) || /\badd \{W\}/i.test(text)) c += "W";
  if (/\bisland\b/i.test(typeLine) || /\badd \{U\}/i.test(text)) c += "U";
  if (/\bswamp\b/i.test(typeLine) || /\badd \{B\}/i.test(text)) c += "B";
  if (/\bmountain\b/i.test(typeLine) || /\badd \{R\}/i.test(text)) c += "R";
  if (/\bforest\b/i.test(typeLine) || /\badd \{G\}/i.test(text)) c += "G";
  if (/any color|chosen color|one mana of any/i.test(text)) c += "WUBRG";
  return c;
}

export const FAST_MANA_NEEDS_AUTHORING = new Set(Object.keys(FAST_MANA_TABLE));

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return DR_GOLDFISH_TURN_CAP;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.min(sorted.length - 1, lo + 1);
  const t = i - lo;
  return sorted[lo]! * (1 - t) + sorted[hi]! * t;
}

function shuffle<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}

function londonKeep(hand: GoldfishSimCard[], library: GoldfishSimCard[], putBack: number): void {
  const extras = hand
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const landRank = Number(a.c.countsAsLand) - Number(b.c.countsAsLand);
      if (hand.filter((x) => x.countsAsLand).length > 4) return landRank || b.c.cmc - a.c.cmc;
      return b.c.cmc - a.c.cmc || landRank;
    });
  for (let n = 0; n < putBack && extras.length; n += 1) {
    const gone = extras.shift()!;
    const idx = hand.indexOf(gone.c);
    if (idx >= 0) library.push(hand.splice(idx, 1)[0]!);
  }
}

function scoreCard(c: GoldfishSimCard): number {
  const fm = fastManaModel(c.name);
  const fast = fm ? (fm.kind === "ritual" || fm.kind === "oneShot" || fm.kind === "led" ? 30 : 18) + fm.tapMana * 4 : 0;
  const line = AUTHORED_WIN_LINE_NAMES.has(c.name) ? 50 : 0;
  return (
    (c.isWinText ? 80 : 0) +
    line +
    fast +
    (c.isTutor ? 20 : 0) +
    c.rampMana * 8 +
    c.rampLands * 6 +
    c.drawCards * 5 +
    (c.isPoison ? 4 : 0) +
    c.power -
    c.cmc
  );
}

type PlayState = {
  hand: GoldfishSimCard[];
  library: GoldfishSimCard[];
  battlefield: GoldfishSimCard[];
  grave: GoldfishSimCard[];
  landsBf: number;
  tombs: number;
  untapRocks: number;
  artifacts: number;
  legendaryBf: number;
  powerBf: number;
  poisonBf: number;
  cmdOnBf: boolean;
  cmdCasts: number;
  storm: number;
  birgi: boolean;
  libraryExiled: boolean;
  life: number;
  landAuras: number;
  extraLandDrops: number;
  landsPlayed: number;
  greaves: boolean;
  boots: boolean;
  rhythm: boolean;
  sickPower: number;
  cmdSick: boolean;
  breach: boolean;
  face: number;
  terminal: boolean;
  rhystic: number;
  tithe: number;
  remora: number;
  sentinel: number;
  cmdCastsByName: Record<string, number>;
  commanderFirstCast: Record<string, number>;
  lastLine: string;
  missedWin: boolean;
  firstMissedWinTurn: number | null;
  missedReason: MissedWinReason | null;
};

function takeFromHand(hand: GoldfishSimCard[], card: GoldfishSimCard): void {
  const i = hand.indexOf(card);
  if (i >= 0) {
    hand[i] = hand[hand.length - 1]!;
    hand.pop();
  }
}

function asMull(c: GoldfishSimCard, planIds: Set<string>, hasTerminal: boolean): {
  name: string;
  oracleId: string;
  cmc: number;
  countsAsLand: boolean;
  isManaSource: boolean;
  isPlanCard: boolean;
  castableByT2: boolean;
} {
  const plan = planIds.has(c.oracleId) || planIds.has(c.name) || c.isTutor;
  const combatPlan = !hasTerminal && c.isCreature && c.cmc <= 3;
  return {
    name: c.name,
    oracleId: c.oracleId,
    cmc: c.cmc,
    countsAsLand: c.countsAsLand,
    isManaSource: c.isManaSource,
    isPlanCard: plan || combatPlan,
    castableByT2: !c.countsAsLand && c.cmc <= 2 && c.fidelity !== "goldfishInert",
  };
}

function oneGame(
  deck: GoldfishSimCard[],
  commanders: GoldfishSimCard[],
  comboNeed: string[][],
  rng: () => number,
  log?: string[],
  variants: CompiledVariant[] = [],
  templateOk: (id: number, names: Set<string>, ids: Set<string>) => boolean = () => true,
  opening?: {
    hand: GoldfishSimCard[];
    library: GoldfishSimCard[];
    battlefield?: GoldfishSimCard[];
    grave?: GoldfishSimCard[];
  },
  trackMissedWin = false,
  inv?: InvariantSink,
): {
  tFirst: number;
  tWin: number | null;
  missedWin: boolean;
  firstMissedWinTurn: number | null;
  missedReason: MissedWinReason | null;
  commanderFirstCast: Record<string, number>;
  line: string;
} {
  const commander = commanders[0] ?? null;
  const library: GoldfishSimCard[] = [];
  const hand: GoldfishSimCard[] = [];
  const planIds = new Set<string>();
  for (const v of variants) for (const u of v.uses) {
    planIds.add(u.oracleId);
    planIds.add(u.name);
  }
  const hasTerminal = variants.some((v) => v.terminal);
  const linePieceNames = new Set(variants.flatMap((v) => v.uses.map((u) => u.name)));
  if (opening) {
    hand.push(...opening.hand);
    library.push(...opening.library);
  } else {
    for (const c of deck) if (!c.isCommander) library.push(c);
    for (let mull = 0; mull <= 3; mull += 1) {
      while (hand.length) library.push(hand.pop()!);
      shuffle(library, rng);
      for (let i = 0; i < 7 && library.length; i += 1) hand.push(library.pop()!);
      const decision = keepMulliganV2({
        hand: hand.map((c) => asMull(c, planIds, hasTerminal)),
        mull,
        hasTerminalLine: hasTerminal,
      });
      if (decision.keep || mull === 3) {
        const putBack = Math.max(0, mull - 1);
        const bottoms = bottomMulliganV2(hand.map((c) => asMull(c, planIds, hasTerminal)), putBack);
        for (const b of bottoms) {
          const idx = hand.findIndex((c) => c.oracleId === b.oracleId && c.name === b.name);
          if (idx >= 0) library.push(hand.splice(idx, 1)[0]!);
        }
        break;
      }
    }
  }

  const st: PlayState = {
    hand,
    library,
    battlefield: [],
    grave: [],
    landsBf: 0,
    tombs: 0,
    untapRocks: 0,
    artifacts: 0,
    legendaryBf: 0,
    powerBf: 0,
    poisonBf: 0,
    cmdOnBf: false,
    cmdCasts: 0,
    storm: 0,
    birgi: false,
    libraryExiled: false,
    life: 40,
    landAuras: 0,
    extraLandDrops: 0,
    landsPlayed: 0,
    greaves: false,
    boots: false,
    rhythm: false,
    sickPower: 0,
    cmdSick: false,
    breach: false,
    face: 0,
    terminal: false,
    rhystic: 0,
    tithe: 0,
    remora: 0,
    sentinel: 0,
    cmdCastsByName: {},
    commanderFirstCast: {},
    lastLine: "",
    missedWin: false,
    firstMissedWinTurn: null,
    missedReason: null,
  };
  if (opening?.grave) st.grave.push(...opening.grave);
  for (const c of opening?.battlefield ?? []) {
    st.battlefield.push(c);
    if (c.countsAsLand || c.isLand) st.landsBf += 1;
    if (c.name === "Ancient Tomb") st.tombs += 1;
    if (!c.countsAsLand && !c.isLand) st.untapRocks += c.producedMana || c.rampMana;
    if (c.isCreature) st.powerBf += Math.max(c.power, 0);
    if (c.isCommander) {
      st.cmdOnBf = true;
      st.legendaryBf += 1;
    }
    if (c.name === "Rhystic Study") st.rhystic += 1;
    if (c.name === "Smothering Tithe") st.tithe += 1;
    if (c.name === "Mystic Remora") st.remora += 1;
    if (c.name === "Esper Sentinel") st.sentinel += 1;
    if (c.name === "Underworld Breach") st.breach = true;
    if (c.hasteEquipCost === 0) st.greaves = true;
    if (c.hasteEquipCost === 1) st.boots = true;
    if (c.deathtouch || c.isPoison) st.poisonBf += Math.max(c.power, 1);
  }

  const haveId = (id: string) => {
    if (commander && commander.oracleId === id) return true;
    return st.hand.some((c) => c.oracleId === id) || st.battlefield.some((c) => c.oracleId === id);
  };
  const comboReady = () => {
    outer: for (const need of comboNeed) {
      for (const id of need) if (!haveId(id)) continue outer;
      return true;
    }
    return false;
  };

  const tapBase = () => st.landsBf - st.tombs + st.tombs * 2 + st.untapRocks + st.landAuras + st.tithe * 0;
  const manaPoolFrom = (total: number): ManaPool => {
    const pool = emptyMana();
    pool.total = total;
    const sources: string[] = [];
    for (const c of st.battlefield) {
      if (c.countsAsLand || c.isLand) {
        const cols = [...c.colors].filter((ch) => "WUBRG".includes(ch));
        sources.push(cols[0] ?? "C");
      } else if (c.producedMana > 0) {
        const anyColor = /any color|any one color|mana of any/i.test(c.text);
        for (let i = 0; i < c.producedMana; i += 1) {
          if (anyColor) sources.push("any");
          else {
            const cols = [...c.colors].filter((ch) => "WUBRG".includes(ch));
            sources.push(cols[i % Math.max(1, cols.length)] ?? "C");
          }
        }
      }
    }
    let used = 0;
    for (const s of sources) {
      if (used >= total) break;
      if (s === "any") pool.any += 1;
      else if (s === "C") pool.C += 1;
      else (pool[s as "W"] as number) += 1;
      used += 1;
    }
    pool.any += Math.max(0, total - used);
    return pool;
  };
  const graphCards = (): GraphCard[] => {
    const out: GraphCard[] = [];
    const push = (c: GoldfishSimCard, zone: GraphCard["zone"], i: number) => {
      out.push({
        instanceId: `${zone}:${c.oracleId}:${i}`,
        oracleId: c.oracleId,
        name: c.name,
        cmc: c.cmc,
        zone,
        isCommander: c.isCommander,
        typeLine: c.typeLine,
        text: c.text,
        power: c.power,
        producedMana: c.producedMana,
        manaCost: c.manaCost,
        colors: c.colors,
      });
    };
    st.hand.forEach((c, i) => push(c, "H", i));
    st.battlefield.forEach((c, i) => push(c, "B", i));
    st.grave.forEach((c, i) => push(c, "G", i));
    st.library.forEach((c, i) => push(c, "L", i));
    commanders.forEach((c, i) => {
      if (!st.battlefield.includes(c) && !st.hand.includes(c)) push(c, "C", i);
    });
    return out;
  };
  const watchHit = () =>
    variants.length > 0 ||
    st.hand.some((c) => WIN_WATCH.has(c.name)) ||
    st.battlefield.some((c) => WIN_WATCH.has(c.name)) ||
    commanders.some((c) => WIN_WATCH.has(c.name));
  const resolveInput = (mana: number, timing: ResolveWinTiming): ResolveWinInput => ({
    cards: graphCards(),
    mana: manaPoolFrom(mana),
    libraryCount: st.library.length,
    variants,
    timing,
    templateSatisfied: (tid, names, ids) => {
      if (tid === -3) return rockManaOnBoard() >= 3;
      return templateOk(tid, names, ids);
    },
  });
  const runResolve = (mana: number, timing: ResolveWinTiming = "any"): WinPlan | null => {
    if (!watchHit()) return null;
    return resolveWin(resolveInput(mana, timing));
  };
  const rockManaOnBoard = () => {
    let n = 0;
    for (const c of st.battlefield) n += c.producedMana;
    for (const c of st.hand) if (c.producedMana >= 3) n += c.producedMana;
    return n + st.untapRocks;
  };
  type Target = {
    plan: WinPlan | null;
    gap: WinGap | null;
    distance: number;
    missingPieces: number;
    manaTurns: number;
    resolverRejected: boolean;
  };
  const targetDistance = (mana: number): Target | null => {
    if (!watchHit()) return null;
    const ev = evaluateWin(resolveInput(mana, "any"));
    if (ev.plan) return { plan: ev.plan, gap: null, distance: 0, missingPieces: 0, manaTurns: 0, resolverRejected: false };
    if (!ev.closest) return null;
    return { plan: null, gap: ev.closest, ...distanceFromGap(ev.closest, tapBase()), resolverRejected: ev.resolverRejected };
  };
  const tutorFetch = (tutor: GoldfishSimCard, target: Target | null): { piece: WinGapPiece; index: number } | null => {
    if (!tutor.isTutor || !target?.gap) return null;
    for (const p of target.gap.missingPieces) {
      if (p.where !== "L") continue;
      const index = st.library.findIndex((c) => c.oracleId === p.oracleId || c.name === p.name);
      if (index < 0) continue;
      if (tutorAdvancesPiece(tutor, p, st.library[index])) return { piece: p, index };
    }
    return null;
  };
  const stateDump = (mana: number, full = false): string => {
    const names = (xs: GoldfishSimCard[]) => xs.map((c) => c.name).join("|");
    const lib = full ? names(st.library.slice().reverse()) : names(st.library.slice(-5).reverse());
    const cz = commanders.filter((c) => !st.battlefield.includes(c) && !st.hand.includes(c));
    return `mana=${mana} hand=[${names(st.hand)}] bf=[${names(st.battlefield)}] grave=[${names(st.grave)}] cz=[${names(cz)}] lib=${st.library.length} ${full ? "libTopFirst" : "top5"}=[${lib}]`;
  };
  const clockCreature = (c: GoldfishSimCard) =>
    (c.isCreature ? Math.max(c.power, 0) : 0) + (c.isCommander ? 8 : 0) + (c.isWinText ? 20 : 0);
  const bestCreature = (pool: GoldfishSimCard[]) => {
    let best: GoldfishSimCard | null = null;
    let s = -1;
    for (const c of pool) {
      if (!c.isCreature) continue;
      const v = clockCreature(c);
      if (v > s) {
        s = v;
        best = c;
      }
    }
    return best;
  };

  const tryOracleLine = (mana: number): boolean => {
    const oracle = st.hand.find((c) => c.name === THASSAS_ORACLE);
    if (!oracle) return false;
    if (st.libraryExiled || st.library.length === 0) {
      if (mana >= oracle.cmc) {
        takeFromHand(st.hand, oracle);
        return true;
      }
      return false;
    }
    const consult = st.hand.find((c) => c.name === DEMONIC_CONSULTATION);
    const pact = st.hand.find((c) => c.name === TAINTED_PACT);
    const cost = oracleLineCost(Boolean(consult), Boolean(pact));
    if (cost == null || mana < cost) return false;
    takeFromHand(st.hand, consult ?? pact!);
    takeFromHand(st.hand, oracle);
    st.libraryExiled = true;
    st.library.length = 0;
    return true;
  };

  const applyFast = (card: GoldfishSimCard, mana: number): number => {
    const fm = fastManaModel(card.name);
    if (!fm) return mana;
    if (fm.kind === "ritual") {
      let add = fm.tapMana;
      if (card.name === "Cabal Ritual" && st.grave.length >= 7) add = 5;
      return mana + add;
    }
    if (fm.kind === "oneShot") return mana + fm.tapMana;
    if (fm.kind === "led") return mana;
    if (fm.kind === "imprintRock") {
      let idx = -1;
      let worst = 1e9;
      for (let i = 0; i < st.hand.length; i += 1) {
        const c = st.hand[i]!;
        if (c.isLand || AUTHORED_WIN_LINE_NAMES.has(c.name)) continue;
        const s = c.cmc;
        if (s < worst) {
          worst = s;
          idx = i;
        }
      }
      if (idx < 0) return mana;
      st.grave.push(st.hand.splice(idx, 1)[0]!);
      st.untapRocks += fm.tapMana;
      st.artifacts += 1;
      return mana + fm.tapMana;
    }
    if (fm.kind === "discardLandRock") {
      const idx = st.hand.findIndex((c) => c.isLand);
      if (idx < 0) return mana;
      st.grave.push(st.hand.splice(idx, 1)[0]!);
      st.untapRocks += fm.tapMana;
      st.artifacts += 1;
      return mana + fm.tapMana;
    }
    if (fm.kind === "metalcraftRock") {
      st.artifacts += 1;
      if (st.artifacts >= 3) {
        st.untapRocks += fm.tapMana;
        return mana + fm.tapMana;
      }
      return mana;
    }
    if (fm.kind === "legendaryRock") {
      st.artifacts += 1;
      if (st.legendaryBf || st.cmdOnBf || commander) {
        st.untapRocks += fm.tapMana;
        return mana + fm.tapMana;
      }
      return mana;
    }
    if (fm.kind === "commanderLotus") return mana;
    if (fm.kind === "noUntapRock") {
      st.artifacts += 1;
      return mana + fm.tapMana;
    }
    if (fm.kind === "untapRock") {
      st.artifacts += 1;
      st.untapRocks += fm.tapMana;
      return mana + fm.tapMana;
    }
    return mana;
  };

  const cast = (card: GoldfishSimCard, fromHand: boolean, extra = 0, mana: number): number | null => {
    const fm = fastManaModel(card.name);
    if (fm?.kind === "imprintRock" && !st.hand.some((c) => c !== card && !c.isLand && !AUTHORED_WIN_LINE_NAMES.has(c.name))) {
      return null;
    }
    if (fm?.kind === "discardLandRock" && !st.hand.some((c) => c !== card && c.isLand)) return null;
    const cost = card.cmc + extra;
    if (mana < cost) return null;
    mana -= cost;
    if (fromHand) takeFromHand(st.hand, card);
    if (st.birgi) mana += 1;
    st.storm += 1;

    if (fm?.kind === "led") {
      const useful = st.hand.filter(
        (c) =>
          !c.countsAsLand &&
          c.fidelity !== "goldfishInert" &&
          (AUTHORED_WIN_LINE_NAMES.has(c.name) || isAuthoredFastMana(c.name) || c.isTutor || c.drawCards > 0),
      ).length;
      const winLine =
        (st.hand.some((c) => c.name === THASSAS_ORACLE) &&
          st.hand.some((c) => c.name === DEMONIC_CONSULTATION || c.name === TAINTED_PACT)) ||
        (st.breach && st.hand.some((c) => c.name === "Brain Freeze"));
      if (winLine || useful <= 1) {
        while (st.hand.length) st.grave.push(st.hand.pop()!);
        st.grave.push(card);
        return mana + 3;
      }
      st.artifacts += 1;
      st.battlefield.push(card);
      return mana;
    }

    if (card.name === DEMONIC_CONSULTATION || card.name === TAINTED_PACT) {
      st.libraryExiled = true;
      st.library.length = 0;
      st.grave.push(card);
      return mana;
    }
    if (card.name === "Ad Nauseam") {
      while (st.life > 1 && st.library.length) {
        const drawn = st.library.pop()!;
        st.hand.push(drawn);
        st.life -= Math.max(1, drawn.cmc);
        if (drawn.name === THASSAS_ORACLE || drawn.name === DEMONIC_CONSULTATION || drawn.name === TAINTED_PACT) break;
      }
      st.grave.push(card);
      return mana;
    }
    if (card.name === "Necropotence") {
      for (let d = 0; d < 3 && st.library.length && st.life > 1; d += 1) {
        st.hand.push(st.library.pop()!);
        st.life -= 1;
      }
      st.battlefield.push(card);
      return mana;
    }
    if (card.name === "Wheel of Fortune" || card.name === "Windfall") {
      while (st.hand.length) st.grave.push(st.hand.pop()!);
      for (let d = 0; d < 7 && st.library.length; d += 1) st.hand.push(st.library.pop()!);
      st.grave.push(card);
      return mana;
    }
    if (card.name === "Entomb") {
      const pick = bestCreature(st.library);
      if (pick) {
        const i = st.library.indexOf(pick);
        if (i >= 0) st.grave.push(st.library.splice(i, 1)[0]!);
      }
      st.grave.push(card);
      return mana;
    }
    if (card.name === "Reanimate" || card.name === "Animate Dead") {
      const pick = bestCreature(st.grave);
      if (pick) {
        st.life -= Math.max(1, pick.cmc);
        const i = st.grave.indexOf(pick);
        if (i >= 0) st.grave.splice(i, 1);
        st.battlefield.push(pick);
        if (pick.isCreature) {
          st.powerBf += Math.max(pick.power, 0);
          st.sickPower += Math.max(pick.power, 0);
        }
      }
      if (card.name === "Animate Dead") st.battlefield.push(card);
      else st.grave.push(card);
      return mana;
    }
    if (card.name === "Victimize") {
      const sac = st.battlefield.find((c) => c.isCreature);
      if (sac) {
        st.battlefield = st.battlefield.filter((c) => c !== sac);
        st.grave.push(sac);
        st.powerBf -= Math.max(sac.power, 0);
        for (let n = 0; n < 2; n += 1) {
          const pick = bestCreature(st.grave);
          if (!pick) break;
          const i = st.grave.indexOf(pick);
          if (i >= 0) st.grave.splice(i, 1);
          st.battlefield.push(pick);
          st.powerBf += Math.max(pick.power, 0);
          st.sickPower += Math.max(pick.power, 0);
        }
      }
      st.grave.push(card);
      return mana;
    }
    if (card.name === "Akroma's Will") {
      st.face += st.powerBf;
      st.grave.push(card);
      return mana;
    }
    if (card.name === "Walking Ballista") {
      st.battlefield.push(card);
      if (mana >= 8) st.terminal = true;
      return mana;
    }
    if (card.name === "Brain Freeze" && st.breach && st.storm >= 12) {
      st.grave.push(card);
      st.terminal = true;
      return mana;
    }
    if (card.faceDamage) {
      st.face += card.faceDamage;
      st.grave.push(card);
      return mana;
    }
    if (card.landAura) {
      st.landAuras += 1;
      st.battlefield.push(card);
      mana += 1;
      return mana;
    }
    if (card.extraLandDrop) {
      st.extraLandDrops += 1;
      st.battlefield.push(card);
      return mana;
    }
    if (card.hasteEquipCost != null) {
      if (card.hasteEquipCost === 0) st.greaves = true;
      else st.boots = true;
      st.artifacts += 1;
      st.battlefield.push(card);
      return mana;
    }
    if (card.hasteAnthem) {
      st.rhythm = true;
      st.battlefield.push(card);
      return mana;
    }
    if (card.name === "Snap") {
      st.untapRocks += 0;
      st.landsBf += 0;
      mana += Math.min(2, st.landsBf);
      st.grave.push(card);
      return mana;
    }
    if (card.name.startsWith("Birgi, God of Storytelling")) {
      st.birgi = true;
      st.legendaryBf += 1;
      st.battlefield.push(card);
      return mana;
    }
    if (card.name === "Underworld Breach") {
      st.breach = true;
      st.battlefield.push(card);
      return mana;
    }
    if (card.name === "Rhystic Study") {
      st.rhystic += 1;
      st.battlefield.push(card);
      return mana;
    }
    if (card.name === "Smothering Tithe") {
      st.tithe += 1;
      st.battlefield.push(card);
      return mana;
    }
    if (card.name === "Mystic Remora") {
      st.remora += 1;
      st.battlefield.push(card);
      return mana;
    }
    if (card.name === "Esper Sentinel") {
      st.sentinel += 1;
      st.battlefield.push(card);
      if (card.isCreature) {
        st.powerBf += Math.max(card.power, 0);
        st.sickPower += Math.max(card.power, 0);
      }
      return mana;
    }
    if (card.name === "Sevinne's Reclamation") {
      const back = st.grave.findIndex((c) => !c.isLand);
      if (back >= 0) st.hand.push(st.grave.splice(back, 1)[0]!);
      st.grave.push(card);
      return mana;
    }

    if (fm) {
      mana = applyFast(card, mana);
      if (fm.kind !== "ritual" && fm.kind !== "oneShot" && fm.kind !== "land") {
        if (fm.kind !== "commanderLotus") st.battlefield.push(card);
      } else if (fm.kind === "land") {
        st.battlefield.push(card);
        st.landsBf += 1;
        st.tombs += 1;
        mana += fm.tapMana;
      } else {
        st.grave.push(card);
      }
      return mana;
    }

    if (!card.isWinText || (!card.isInstant && !card.isSorcery)) {
      st.battlefield.push(card);
      if (card.isLand) {
        st.landsBf += 1;
        mana += 1;
      }
      st.untapRocks += card.rampMana;
      if (card.isCreature) {
        st.powerBf += Math.max(card.power, 0);
        st.sickPower += Math.max(card.power, 0);
      }
      if (card.isPoison) st.poisonBf += Math.max(card.power, 1);
      if (card.isCommander || commanders.includes(card)) {
        st.cmdOnBf = true;
        st.cmdSick = true;
        st.legendaryBf += 1;
      }
      if (/\bartifact\b/i.test(card.name) || card.rampMana) st.artifacts += 1;
    } else {
      st.grave.push(card);
    }
    for (let d = 0; d < card.drawCards && st.library.length; d += 1) st.hand.push(st.library.pop()!);
    for (let k = 0; k < card.rampLands; k += 1) {
      for (let i = st.library.length - 1; i >= 0; i -= 1) {
        if (st.library[i]!.isLand) {
          const [land] = st.library.splice(i, 1);
          st.battlefield.push(land!);
          st.landsBf += 1;
          mana += 1;
          break;
        }
      }
    }
    mana += card.rampLands;
    if (card.isTutor) {
      const legal = (c: GoldfishSimCard) => tutorFindsPiece(card, c);
      let pick = tutorFetch(card, targetDistance(mana))?.index ?? -1;
      for (const need of comboNeed) {
        if (pick >= 0) break;
        for (const id of need) {
          if (haveId(id)) continue;
          pick = st.library.findIndex((c) => c.oracleId === id && legal(c));
          if (pick >= 0) break;
        }
      }
      if (pick < 0) pick = st.library.findIndex((c) => legal(c) && (c.name === THASSAS_ORACLE || c.name === DEMONIC_CONSULTATION));
      if (pick < 0) pick = st.library.findIndex((c) => legal(c) && (c.rampMana || c.rampLands || c.drawCards || isAuthoredFastMana(c.name)));
      if (pick < 0) pick = st.library.findIndex((c) => legal(c) && !c.isLand);
      if (pick < 0) pick = st.library.findIndex((c) => legal(c));
      if (pick >= 0) {
        const [found] = st.library.splice(pick, 1);
        if (!found) {
          /* skip */
        } else if (card.tutorDest === "top") {
          st.library.push(found);
        } else if (card.tutorDest === "bf") {
          st.battlefield.push(found);
        } else if (card.tutorDest === "grave") {
          st.grave.push(found);
        } else {
          st.hand.push(found);
        }
      }
    }
    return mana;
  };

  const holdForLine = (c: GoldfishSimCard) =>
    (c.isInstant || c.isSorcery) && !c.isTutor && c.drawCards === 0 && (linePieceNames.has(c.name) || WIN_WATCH.has(c.name));
  const pickPlay = (mana: number, target: ReturnType<typeof targetDistance>): GoldfishSimCard | null => {
    const affordable = st.hand.filter((c) => {
      if (c.countsAsLand || c.cmc > mana || c.fidelity === "goldfishInert") return false;
      if (c.name === THASSAS_ORACLE) return st.libraryExiled || st.library.length === 0;
      if (c.name === DEMONIC_CONSULTATION || c.name === TAINTED_PACT) return false;
      if (holdForLine(c)) return false;
      return true;
    });
    if (!affordable.length) return null;
    const depth = Math.min(lookaheadDepth(target?.distance ?? null), affordable.length);
    const pieceNames = new Set(target?.gap?.lineCards ?? []);
    const pieceBound = (target?.missingPieces ?? 0) > (target?.manaTurns ?? 0);
    const manaBound = (target?.manaTurns ?? 0) > (target?.missingPieces ?? 0);
    let best: GoldfishSimCard | null = null;
    let bestS = -1e9;
    for (const first of affordable) {
      let s = scoreCard(first);
      if (pieceNames.has(first.name)) s += 80;
      if (tutorFetch(first, target)) s += 300;
      if (first.isTutor && pieceBound) s += 40;
      if ((first.isTutor || first.drawCards > 0) && (target?.distance ?? 0) > 0) s += 50;
      if ((first.isManaSource || first.rampMana || isAuthoredFastMana(first.name)) && manaBound) s += 35;
      if (first.drawCards > 0 && pieceBound && !affordable.some((c) => c.isTutor)) s += 25;
      let remain = mana - first.cmc + (fastManaModel(first.name)?.tapMana ?? first.rampMana);
      const rest = affordable.filter((c) => c !== first).sort((a, b) => scoreCard(b) - scoreCard(a));
      for (let d = 1; d < depth && rest.length; d += 1) {
        const nxt = rest.find((c) => c.cmc <= remain);
        if (!nxt) break;
        s += scoreCard(nxt) * (1 - 0.15 * d);
        remain -= nxt.cmc;
      }
      if (first.name === THASSAS_ORACLE) s += 200;
      if (s > bestS) {
        bestS = s;
        best = first;
      }
    }
    return best;
  };

  let combat = 0;
  let cmdDmg = 0;
  let poison = 0;
  let extraTurns = 0;

  for (let turn = 1; turn <= DR_GOLDFISH_TURN_CAP; turn += 1) {
    if (!(opening && turn === 1) && st.library.length) st.hand.push(st.library.pop()!);
    st.landsPlayed = 0;
    st.sickPower = 0;
    st.cmdSick = false;
    let mana = tapBase();
    const landDrops = 1 + st.extraLandDrops;
    for (let drop = 0; drop < landDrops; drop += 1) {
      const land = st.hand.find((c) => c.countsAsLand);
      if (!land) break;
      takeFromHand(st.hand, land);
      st.battlefield.push(land);
      st.landsPlayed += 1;
      if (land.name === "Ancient Tomb") {
        st.landsBf += 1;
        st.tombs += 1;
        mana += 2;
      } else if (land.isMdfcLand && land.mdfcTapped) {
        st.landsBf += 1;
      } else {
        st.landsBf += 1;
        mana += 1;
      }
    }
    st.storm = 0;

    const winNow = (label: string, plan?: WinPlan | null) => {
      st.lastLine = plan?.line ?? label;
      log?.push(
        `T${turn} ${label}${plan ? ` ${plan.line} spent=${plan.manaSpent} prov=[${plan.provenance.map((p) => `${p.token}<${p.from}`).join("|")}]` : ""}`,
      );
      return {
        tFirst: turn,
        tWin: turn,
        missedWin: st.missedWin,
        firstMissedWinTurn: st.firstMissedWinTurn,
        missedReason: st.missedReason,
        commanderFirstCast: st.commanderFirstCast,
        line: st.lastLine,
      };
    };

    const noteMiss = (reason: MissedWinReason, detail: string) => {
      if (st.missedWin) return;
      st.missedWin = true;
      st.firstMissedWinTurn = turn;
      st.missedReason = reason;
      log?.push(`T${turn} missed-win ${reason} ${detail}`);
    };

    const executePlan = (plan: WinPlan, available: number): number | null => {
      if (plan.manaSpent > available) return null;
      const moved = new Set<string>();
      for (const step of plan.steps) {
        if (moved.has(step.name)) continue;
        moved.add(step.name);
        const card =
          st.hand.find((c) => c.name === step.name) ??
          commanders.find((c) => c.name === step.name && !st.battlefield.includes(c));
        if (!card) continue;
        if (st.hand.includes(card)) takeFromHand(st.hand, card);
        if (card.name === DEMONIC_CONSULTATION || card.name === TAINTED_PACT) {
          st.libraryExiled = true;
          st.library.length = 0;
          st.grave.push(card);
        } else if (!st.battlefield.includes(card)) {
          st.battlefield.push(card);
        }
      }
      return available - plan.manaSpent;
    };

    const tryWin = (available: number, timing: ResolveWinTiming, label: string) => {
      if (tryOracleLine(available) && timing === "any") return winNow("oracle-line");
      const plan = runResolve(available, timing);
      if (!plan) return null;
      const executed = executePlan(plan, available);
      if (executed == null) {
        const reason =
          diagnoseMissedWin({
            cards: graphCards(),
            mana: manaPoolFrom(available),
            libraryCount: st.library.length,
            variants,
            timing,
            templateSatisfied: (tid, names, ids) => templateOk(tid, names, ids),
          }) ?? "colors";
        noteMiss(reason, plan.line);
        return null;
      }
      mana = executed;
      return winNow(label, plan);
    };

    const spendLeftover = (
      available: number,
      instantOnly: boolean,
    ): { mana: number; win: ReturnType<typeof winNow> | null } => {
      for (let step = 0; step < 10; step += 1) {
        const target = targetDistance(available);
        const fetches = new Map(st.hand.map((c) => [c, tutorFetch(c, target) ? 1 : 0]));
        const reducing = st.hand
          .filter((c) => {
            if (c.countsAsLand || c.cmc > available || c.fidelity === "goldfishInert") return false;
            if (LINE_SENSITIVE.has(c.name) || holdForLine(c)) return false;
            if (instantOnly && !c.isInstant && !c.isFlash) return false;
            return c.isTutor || c.drawCards > 0;
          })
          .sort((a, b) => {
            const aFetch = fetches.get(a) ?? 0;
            const bFetch = fetches.get(b) ?? 0;
            if (aFetch !== bFetch) return bFetch - aFetch;
            const aHit = a.isTutor && (a.tutorDest === "hand" || a.tutorDest === "top") ? 1 : 0;
            const bHit = b.isTutor && (b.tutorDest === "hand" || b.tutorDest === "top") ? 1 : 0;
            if (aHit !== bHit) return bHit - aHit;
            if (a.isTutor !== b.isTutor) return Number(b.isTutor) - Number(a.isTutor);
            return a.cmc - b.cmc;
          });
        const pick = reducing[0] ?? (!instantOnly ? pickPlay(available, target) : null);
        if (!pick) break;
        if (instantOnly && !pick.isInstant && !pick.isFlash) break;
        const next = cast(pick, true, 0, available);
        if (next == null) break;
        available = next;
        log?.push(`T${turn} leftover ${pick.name} mana=${available.toFixed(0)}`);
        const won = tryWin(available, instantOnly ? "instant" : "any", "resolveWin");
        if (won) return { mana: available, win: won };
      }
      return { mana: available, win: null };
    };

    const logTarget = (available: number) => {
      if (!log) return;
      const target = targetDistance(available);
      if (!target) return;
      const g = target.gap;
      log.push(
        `T${turn} target=${g?.line ?? target.plan?.line ?? ""} dist=${target.distance} missing=${g?.missingPieces.length ?? 0}` +
          ` short=${g?.manaShort ?? 0}${g?.timingBlocked ? " timing" : ""}${target.resolverRejected ? " resolver-rejected" : ""}` +
          (g?.missingPieces.length ? ` need=[${g.missingPieces.map((p) => `${p.name}@${p.where}`).join("|")}]` : ""),
      );
    };

    const heldLegalTutor = (available: number, target: Target | null) => {
      for (const c of st.hand) {
        if (!c.isTutor || c.countsAsLand || c.fidelity === "goldfishInert" || c.cmc > available || LINE_SENSITIVE.has(c.name)) continue;
        const f = tutorFetch(c, target);
        if (f) return { tutor: c, piece: f.piece };
      }
      return null;
    };

    const checkInvariants = (where: "start" | "end") => {
      if (!inv) return;
      inv.checks += 1;
      const target = targetDistance(mana);
      const plan = runResolve(mana, "any");
      const record = (kind: GoldfishInvariantKind, detail: string) => {
        inv[kind] += 1;
        log?.push(`T${turn} INVARIANT-${kind} ${detail}`);
        if (inv.examples.filter((e) => e.kind === kind).length >= inv.maxExamples) return;
        inv.examples.push({ kind, traceId: `${inv.traceBase} T${turn}`, detail, state: stateDump(mana, inv.fullState) });
      };
      const dist0 = target != null && target.distance === 0;
      if (dist0 !== Boolean(plan)) {
        record(
          "a",
          `${where} dist=${target?.distance ?? "none"} plan=${plan?.line ?? "none"} gap=${target?.gap?.line ?? ""}` +
            ` rejected=${target?.resolverRejected ?? false}`,
        );
      }
      if (where === "end") {
        const held = heldLegalTutor(mana, target);
        if (held) record("b", `${held.tutor.name} can fetch ${held.piece.name} line=${target?.gap?.line ?? ""} mana=${mana}`);
      }
    };

    checkInvariants("start");
    {
      const early = tryWin(mana, "any", "resolveWin");
      if (early) return early;
    }

    const lotus = st.hand.find((c) => c.name === "Jeweled Lotus");
    const pieceNames = new Set(variants.flatMap((v) => v.uses.map((u) => u.name)));
    const castCommander = (cmd: GoldfishSimCard, force: boolean): boolean => {
      if (st.battlefield.includes(cmd)) return false;
      const tax = 2 * (st.cmdCastsByName[cmd.name] ?? 0);
      const lotusMana = st.hand.some((c) => c.name === "Jeweled Lotus") ? 3 : 0;
      const need = cmd.cmc + tax;
      if (!force && mana + lotusMana < need) return false;
      const next = cast(cmd, false, tax, mana + lotusMana);
      if (next == null) return false;
      if (lotusMana) {
        const lot = st.hand.find((c) => c.name === "Jeweled Lotus");
        if (lot) {
          takeFromHand(st.hand, lot);
          st.grave.push(lot);
        }
      }
      mana = next;
      st.cmdCasts += 1;
      st.cmdCastsByName[cmd.name] = (st.cmdCastsByName[cmd.name] ?? 0) + 1;
      if (st.commanderFirstCast[cmd.name] == null) st.commanderFirstCast[cmd.name] = turn;
      log?.push(`T${turn} cast commander ${cmd.name} mana=${mana.toFixed(0)}`);
      return true;
    };

    for (const cmd of commanders) {
      if (st.battlefield.includes(cmd)) continue;
      const lead = commanderShouldLead({
        commander: cmd,
        castable: mana + (lotus ? 3 : 0) >= cmd.cmc + 2 * (st.cmdCastsByName[cmd.name] ?? 0),
        isPiece: pieceNames.has(cmd.name) || CARD_ENGINE_NAMES.has(cmd.name),
      });
      if (lead) {
        castCommander(cmd, true);
        const afterCmd = tryWin(mana, "any", "resolveWin");
        if (afterCmd) return afterCmd;
      }
    }

    {
      const afterLead = tryWin(mana, "any", "resolveWin");
      if (afterLead) return afterLead;
    }

    const mainLoop = (limit: number, instantOnly: boolean): ReturnType<typeof winNow> | null => {
      for (let step = 0; step < limit; step += 1) {
        if (!instantOnly && tryOracleLine(mana)) return winNow("oracle-line");
        const target = targetDistance(mana);
        const best = pickPlay(mana, target);
        if (!best) break;
        if (instantOnly && !best.isInstant && !best.isFlash) break;
        const next = cast(best, true, 0, mana);
        if (next == null) break;
        mana = next;
        log?.push(`T${turn} cast ${best.name} mana=${mana.toFixed(0)}`);
        if (st.terminal) return winNow(`terminal ${best.name}`);
        if (best.name === "Final Fortune") extraTurns += 1;
        if (best.name === THASSAS_ORACLE && (st.libraryExiled || st.library.length === 0)) return winNow("oracle");
        const mid = tryWin(mana, instantOnly ? "instant" : "any", "resolveWin");
        if (mid) return mid;
        if (best.isWinText && best.name !== THASSAS_ORACLE && inv) inv.unbackedWinText += 1;
      }
      return null;
    };

    {
      const main = mainLoop(12, false);
      if (main) return main;
    }
    for (const cmd of commanders) {
      if (!st.battlefield.includes(cmd)) {
        if (castCommander(cmd, false)) {
          const after = tryWin(mana, "any", "resolveWin");
          if (after) return after;
        }
      }
    }
    if (comboNeed.length && comboReady()) return winNow("combo-ready");
    let haste = st.rhythm || st.greaves;
    if (!haste && st.boots && mana >= 1) {
      mana -= 1;
      haste = true;
    }
    const attacking = haste ? st.powerBf : Math.max(0, st.powerBf - st.sickPower);
    combat += attacking + st.face;
    st.face = 0;
    const attackers = st.battlefield.filter((c) => c.isCreature && (haste || c !== commander || !st.cmdSick));
    const connecting = haste ? attackers.length : attackers.filter((c) => !st.cmdSick || c !== commander).length;
    if (st.cmdOnBf && commander && (!st.cmdSick || haste)) cmdDmg += Math.max(commander.power, 1);
    const fynn = st.battlefield.some((c) => c.name === "Fynn, the Fangbearer");
    if (fynn) {
      const dt = st.battlefield.filter((c) => c.deathtouch && c.isCreature).length;
      poison += dt * 2;
    } else {
      poison += st.poisonBf;
    }
    const tymna = st.battlefield.find((c) => c.name === "Tymna the Weaver");
    if (tymna) {
      const others = attackers.filter((c) => c.name !== "Tymna the Weaver").length;
      const x = Math.min(3, others || connecting);
      if (x > 0 && st.life > x) {
        st.life -= x;
        for (let d = 0; d < x && st.library.length; d += 1) {
          st.hand.push(st.library.pop()!);
          const afterDraw = tryWin(mana, "any", "resolveWin");
          if (afterDraw) return afterDraw;
        }
        log?.push(`T${turn} tymna-draw ${x}`);
      }
    }
    {
      const post = tryWin(mana, "any", "resolveWin");
      if (post) return post;
      const postMain = mainLoop(8, false);
      if (postMain) return postMain;
      const left = spendLeftover(mana, false);
      if (left.win) return left.win;
      mana = left.mana;
    }
    checkInvariants("end");
    if (trackMissedWin && !st.missedWin) {
      const could = runResolve(mana, "any");
      if (could) {
        const reason =
          diagnoseMissedWin({
            cards: graphCards(),
            mana: manaPoolFrom(mana),
            libraryCount: st.library.length,
            variants,
            timing: "any",
            templateSatisfied: (tid, names, ids) => templateOk(tid, names, ids),
          }) ?? "sequencing";
        noteMiss(reason, could.line);
      }
    }
    if (combat >= 40 || cmdDmg >= 21 || poison >= 10) {
      log?.push(`T${turn} combat clock combat=${combat} cmd=${cmdDmg} poison=${poison}`);
      return {
        tFirst: turn,
        tWin: null,
        missedWin: st.missedWin,
        firstMissedWinTurn: st.firstMissedWinTurn,
        missedReason: st.missedReason,
        commanderFirstCast: st.commanderFirstCast,
        line: "combat",
      };
    }

    const taxes = opponentRoundTriggers({
      rhystic: st.rhystic,
      tithe: st.tithe,
      remora: st.remora,
      sentinel: st.sentinel,
    });
    for (let d = 0; d < taxes.extraCards && st.library.length; d += 1) {
      st.hand.push(st.library.pop()!);
      const opp = tryWin(mana, "instant", "resolveWin");
      if (opp) return opp;
    }
    st.untapRocks += taxes.treasures;
    if (taxes.treasures) {
      const afterTax = tryWin(mana + taxes.treasures, "instant", "resolveWin");
      if (afterTax) return afterTax;
    }
    if (taxes.extraCards || taxes.treasures) {
      log?.push(`T${turn} opponents +${taxes.extraCards} cards +${taxes.treasures} treasures`);
    }
    {
      const eot = tryWin(mana, "instant", "resolveWin");
      if (eot) return eot;
    }
    logTarget(mana);

    if (extraTurns > 0) {
      extraTurns -= 1;
      turn -= 1;
    }
  }
  return {
    tFirst: DR_GOLDFISH_TURN_CAP,
    tWin: null,
    missedWin: st.missedWin,
    firstMissedWinTurn: st.firstMissedWinTurn,
    missedReason: st.missedReason,
    commanderFirstCast: st.commanderFirstCast,
    line: "cap",
  };
}

export function simulateGoldfish(args: {
  cards: GoldfishSimCard[];
  combos?: string[][];
  games?: number;
  seed?: number;
  fieldMedianRmst?: number;
  traces?: number;
  spellbook?: SpellbookIndex | null;
  diagnostics?: boolean;
  /** Check invariants (a)/(b) every turn; defaults to DR_GOLDFISH_INVARIANTS=1. */
  invariants?: boolean;
  deckId?: string;
  invariantExamples?: number;
  invariantFullState?: boolean;
}): GoldfishSimResult & {
  onTime?: number;
  traces?: Array<{ seed: number; tFirst: number; log: string[]; line?: string }>;
  missedWinRate?: number;
  missedWinReasons?: Record<MissedWinReason, number>;
  firstMissedWinTurns?: number[];
  commanderFirstCastTurns?: Record<string, number[]>;
  invariants?: GoldfishInvariantReport;
} {
  const games = args.games ?? DR_GOLDFISH_GAMES;
  const commanders = args.cards.filter((c) => c.isCommander);
  const seed = args.seed ?? deckHashSeed(args.cards.map((c) => c.oracleId));
  const rng = mulberry32(seed);
  const turns: number[] = [];
  const tWins: number[] = [];
  const traces: Array<{ seed: number; tFirst: number; log: string[]; line?: string }> = [];
  const index = args.spellbook === undefined ? _spellbook : args.spellbook;
  const deckIds = new Set(args.cards.map((c) => c.oracleId));
  const useful = new Set(["WIN", "INF_MANA", "INF_STORM", "DRAW_LIBRARY", "LIBRARY_EMPTY", "INF_CAST", "INF_DRAW", "INF_DAMAGE_EACH_OPP", "INF_LIFELOSS_EACH_OPP", "INF_MILL_EACH_OPP"]);
  const variants = index
    ? buildableVariantsForDeck(index, deckIds)
        .filter((v) => v.uses.length <= 4 && v.tokens.some((t) => useful.has(t.kind)))
        .sort((a, b) => Number(b.terminal) - Number(a.terminal) || a.uses.length - b.uses.length)
        .slice(0, 48)
    : [];
  const templateOk = index ? templatePredicate(index) : () => true;
  let missed = 0;
  const firstMissed: number[] = [];
  const missedReasons: Record<MissedWinReason, number> = { timing: 0, colors: 0, sequencing: 0, other: 0 };
  const cmdCasts: Record<string, number[]> = {};
  const inv: InvariantSink | undefined =
    (args.invariants ?? goldfishInvariantsFromEnv())
      ? {
          ...emptyInvariantReport(),
          traceBase: "",
          maxExamples: args.invariantExamples ?? 3,
          fullState: Boolean(args.invariantFullState),
        }
      : undefined;
  for (let i = 0; i < games; i += 1) {
    const log = args.traces && i < args.traces ? ([] as string[]) : undefined;
    if (inv) inv.traceBase = `deck=${args.deckId ?? "?"} seed=${seed} game=${i}`;
    const g = oneGame(args.cards, commanders, args.combos ?? [], rng, log, variants, templateOk, undefined, Boolean(args.diagnostics), inv);
    turns.push(g.tFirst);
    if (g.tWin != null) tWins.push(g.tWin);
    if (g.missedWin) {
      missed += 1;
      if (g.firstMissedWinTurn != null) firstMissed.push(g.firstMissedWinTurn);
      missedReasons[g.missedReason ?? "other"] += 1;
    }
    for (const [name, turn] of Object.entries(g.commanderFirstCast)) {
      (cmdCasts[name] ??= []).push(turn);
    }
    if (log) traces.push({ seed: seed + i, tFirst: g.tFirst, log, line: g.line });
  }
  turns.sort((a, b) => a - b);
  const clock = args.cards.filter(
    (c) =>
      !c.isCommander &&
      c.fidelity !== "goldfishInert" &&
      !/^(Plains|Island|Swamp|Mountain|Forest|Wastes)$/i.test(c.name),
  );
  const modeled = clock.filter((c) => c.fidelity !== "castOnly").length;
  const coverage = clock.length ? modeled / clock.length : 0;
  const p25 = quantile(turns, 0.25);
  const p50 = quantile(turns, 0.5);
  const p75 = quantile(turns, 0.75);
  const mean = turns.reduce((s, t) => s + t, 0) / games;
  const rmst = rmst15(turns);
  return {
    version: DR_GOLDFISH_SIM_V1,
    nGames: games,
    seed,
    mean,
    p25,
    p50,
    p75,
    pByT4: turns.filter((t) => t <= 4).length / games,
    pByT6: turns.filter((t) => t <= 6).length / games,
    pByT8: turns.filter((t) => t <= 8).length / games,
    coverage,
    coverageN: clock.length,
    lowConfidence: coverage < 0.35,
    iqr: p75 - p25,
    rmst15: rmst,
    tWinMean: tWins.length ? tWins.reduce((s, t) => s + t, 0) / tWins.length : null,
    ...(args.fieldMedianRmst != null ? { onTime: onTimeRate(turns, args.fieldMedianRmst) } : {}),
    ...(traces.length ? { traces } : {}),
    missedWinRate: missed / games,
    missedWinReasons: missedReasons,
    firstMissedWinTurns: firstMissed,
    commanderFirstCastTurns: cmdCasts,
    ...(inv
      ? { invariants: { checks: inv.checks, a: inv.a, b: inv.b, unbackedWinText: inv.unbackedWinText, examples: inv.examples } }
      : {}),
  };
}

export function runGoldfishScenario(args: {
  hand: GoldfishSimCard[];
  battlefield?: GoldfishSimCard[];
  library?: GoldfishSimCard[];
  grave?: GoldfishSimCard[];
  commanders?: GoldfishSimCard[];
  mana?: number;
  turn?: number;
  variants?: CompiledVariant[];
}): {
  tFirst: number | null;
  plan: WinPlan | null;
  line: string;
  extraCards?: number;
  treasures?: number;
  tymnaDraws?: number;
} {
  const battlefield = args.battlefield ?? [];
  const commanders = args.commanders ?? [];
  const cards: GraphCard[] = [];
  const push = (c: GoldfishSimCard, zone: GraphCard["zone"], i: number) => {
    cards.push({
      instanceId: `${zone}:${i}:${c.oracleId}`,
      oracleId: c.oracleId,
      name: c.name,
      cmc: c.cmc,
      zone,
      isCommander: c.isCommander,
      typeLine: c.typeLine,
      text: c.text,
      power: c.power,
      producedMana: c.producedMana,
      manaCost: c.manaCost,
      colors: c.colors,
    });
  };
  args.hand.forEach((c, i) => push(c, "H", i));
  battlefield.forEach((c, i) => push(c, "B", i));
  (args.grave ?? []).forEach((c, i) => push(c, "G", i));
  (args.library ?? []).forEach((c, i) => push(c, "L", i));
  commanders.forEach((c, i) => {
    if (!battlefield.includes(c) && !args.hand.includes(c)) push(c, "C", i);
  });
  const mana = emptyMana();
  mana.total = args.mana ?? 0;
  mana.any = args.mana ?? 0;
  const plan = resolveWin({
    cards,
    mana,
    libraryCount: (args.library ?? []).length,
    variants: args.variants ?? [],
    templateSatisfied: () => false,
  });
  const rhystic = battlefield.filter((c) => c.name === "Rhystic Study").length;
  const tithe = battlefield.filter((c) => c.name === "Smothering Tithe").length;
  const remora = battlefield.filter((c) => c.name === "Mystic Remora").length;
  const sentinel = battlefield.filter((c) => c.name === "Esper Sentinel").length;
  const taxes = opponentRoundTriggers({ rhystic, tithe, remora, sentinel });
  const tymna = battlefield.some((c) => c.name === "Tymna the Weaver");
  const attackers = battlefield.filter((c) => c.isCreature && c.name !== "Tymna the Weaver").length;
  return {
    tFirst: plan ? (args.turn ?? 1) : null,
    plan,
    line: plan?.line ?? "",
    extraCards: taxes.extraCards,
    treasures: taxes.treasures,
    tymnaDraws: tymna ? Math.min(3, attackers || battlefield.filter((c) => c.isCreature).length) : 0,
  };
}

export function combatClockTurn(args: {
  creatures: Array<{ power: number; haste?: boolean }>;
  commanderPower?: number;
  greaves?: boolean;
  boots?: boolean;
  startTurn?: number;
}): number {
  let combat = 0;
  let cmd = 0;
  const start = args.startTurn ?? 1;
  for (let t = start; t <= DR_GOLDFISH_TURN_CAP; t += 1) {
    const haste = Boolean(args.greaves || args.boots);
    const power = args.creatures.reduce((s, c) => s + (t > start || c.haste || haste ? c.power : 0), 0);
    combat += power;
    if (args.commanderPower != null) cmd += haste || t > start ? args.commanderPower : 0;
    if (combat >= 40 || cmd >= 21) return t;
  }
  return DR_GOLDFISH_TURN_CAP;
}

export function playGoldfishFromOpening(args: {
  hand: GoldfishSimCard[];
  library?: GoldfishSimCard[];
  battlefield?: GoldfishSimCard[];
  grave?: GoldfishSimCard[];
  commanders?: GoldfishSimCard[];
  variants?: CompiledVariant[];
  templateSatisfied?: (id: number, names: Set<string>, ids: Set<string>) => boolean;
  traceId?: string;
}): {
  tFirst: number;
  tWin: number | null;
  line: string;
  log: string[];
  commanderFirstCast: Record<string, number>;
  missedWin: boolean;
  invariants: GoldfishInvariantReport;
} {
  const commanders = args.commanders ?? [];
  const log: string[] = [];
  const inv: InvariantSink = { ...emptyInvariantReport(), traceBase: args.traceId ?? "scenario", maxExamples: 5, fullState: false };
  const g = oneGame(
    [...commanders, ...args.hand, ...(args.battlefield ?? []), ...(args.library ?? [])],
    commanders,
    [],
    () => 0.5,
    log,
    args.variants ?? [],
    args.templateSatisfied ?? (() => false),
    {
      hand: args.hand,
      library: args.library ?? [],
      battlefield: args.battlefield,
      grave: args.grave,
    },
    true,
    inv,
  );
  return {
    tFirst: g.tFirst,
    tWin: g.tWin,
    line: g.line,
    log,
    commanderFirstCast: g.commanderFirstCast,
    missedWin: g.missedWin,
    invariants: { checks: inv.checks, a: inv.a, b: inv.b, unbackedWinText: inv.unbackedWinText, examples: inv.examples },
  };
}

export { resolveWin };
export type { WinPlan, CompiledVariant };

export function speedConsistencyW(
  deck: GoldfishSimResult,
  field: GoldfishSimResult[],
): {
  W: number;
  speedPct: number;
  consistencyPct: number;
  label: (band: number) => string;
} {
  const speedW = midrankW(deck.rmst15, field.map((r) => r.rmst15), true);
  const consW = midrankW(deck.iqr, field.map((r) => r.iqr), true);
  const W = Math.max(0, Math.min(999, Math.round(0.6 * speedW + 0.4 * consW)));
  return {
    W,
    speedPct: speedW / 1000,
    consistencyPct: consW / 1000,
    label: (band) => `Speed & consistency vs. typical Bracket ${band} decks.`,
  };
}

export { onTimeRate, rmst15 };
