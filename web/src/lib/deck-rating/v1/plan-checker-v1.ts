/**
 * Deterministic plan checker 1.0.0 — goldfish plan-pilot mode.
 * Plays the declared primary plan across canonical-100-v1.
 * Speed / win turns are the deck's own turns (see goldfish-engine-v1).
 * Consistency is named-line success rate. `synergy` is plan connectivity
 * (Plan check evidence), not EDHREC Synergy.
 */
import { planCheckEvidenceFromParts, type PlanCheckEvidenceV1 } from "./goldfish-engine-v1";
import { bottomMulliganV2, isManaSourceV2, keepMulliganV2, type MullCard } from "./goldfish-mulligan-v2";
import {
  grantsDeathtouch,
  isCreatureTutor,
  isInfectCreature,
  isLandRamp,
  keywordDeathtouch,
  POISON_REDUNDANCY_SATURATION,
  poisonYield,
  toxicCount,
  tutorFetchLimit,
} from "./plan-poison-v1";
import {
  outletAcceptsProduct,
  PLAN_CHECKER_VERSION,
  PLAN_COMMANDER_DAMAGE,
  PLAN_OPPONENT_LIFE,
  PLAN_PILOT_VERSION,
  PLAN_POISON_LETHAL,
  PLAN_SCHEMA_VERSION,
  PLAN_SEED_COUNT,
  PLAN_SEED_SET,
  PLAN_SPEED_MIN_SUCCESSES,
  PLAN_TURN_CAP,
  type PlanCardV1,
  type WinPlanLineV1,
  type WinPlanType,
  type WinPlanV1,
} from "./plan-schema-v1";

export type ComboMatches = (requiredOracleIds: string[]) => boolean;

export type PlanTrialV1 = {
  seed: number;
  mulligans: number;
  mulliganDecisions: string[];
  winTurn: number | null;
  failureReason: string | null;
  winningPlan: "primary" | null;
  assembled: boolean;
  poison: number;
  combatDamage: number;
  commanderDamage: number;
  log: string[];
};

export type SynergyPartsV1 = {
  direct: number;
  access: number;
  enablers: number;
  redundancy: number;
  verifiedCombo: number | null;
  score: number;
  reason: string | null;
};

export type PlanCheckResultV1 = {
  checker: typeof PLAN_CHECKER_VERSION;
  pilot: typeof PLAN_PILOT_VERSION;
  planSchema: typeof PLAN_SCHEMA_VERSION;
  seedSet: typeof PLAN_SEED_SET;
  comboDb: string;
  speed: number | null;
  speedReason: string | null;
  consistency: number;
  successes: number;
  trials: number;
  /** Legacy clock: failures count as turn 15. The 1.5-turn validation bar still uses this, not Speed. */
  legacyRmst15: number;
  /** Plan connectivity — prefer `planCheck` for new UI. */
  synergy: SynergyPartsV1;
  /** Named-line evidence: validity, rate, own-turn speed, connectivity. */
  planCheck: PlanCheckEvidenceV1;
  trialsDetail: PlanTrialV1[];
};

type Inst = PlanCardV1 & { uid: string; sick: boolean };

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}

function isLand(card: PlanCardV1): boolean {
  return /\bland\b/i.test(card.typeLine) && !/\bcreature\b/i.test(card.typeLine);
}

function isCreature(card: PlanCardV1): boolean {
  return /\bcreature\b/i.test(card.typeLine);
}

function isSpell(card: PlanCardV1): boolean {
  return /\b(instant|sorcery)\b/i.test(card.typeLine);
}

function hasHaste(card: PlanCardV1): boolean {
  return /\bhaste\b/i.test(`${card.typeLine} ${card.text}`);
}

function manaProduction(card: PlanCardV1): number {
  if (isLand(card)) return /add \{2\}|adds two mana/i.test(card.text) ? 2 : 1;
  if (/sol ring/i.test(card.name) || /add \{2\}/i.test(card.text)) return 2;
  if (/add \{[WUBRGC]\}|add one mana|\{T\}: Add/i.test(card.text)) return 1;
  if (/llanowar elves|elvish mystic|fyndhorn elves|birds of paradise|arbor elf/i.test(card.name)) return 1;
  return 0;
}

export function canonicalizeLibrary(cards: PlanCardV1[], commanders: PlanCardV1[]): Inst[] {
  const commanderIds = new Set(commanders.map((c) => c.oracleId));
  const rows: Inst[] = [];
  const sorted = cards
    .filter((c) => !commanderIds.has(c.oracleId) && !c.typeLine.startsWith("Commander"))
    .slice()
    .sort((a, b) => a.oracleId.localeCompare(b.oracleId) || a.name.localeCompare(b.name));
  for (const card of sorted) {
    const n = Math.max(1, card.quantity);
    for (let i = 0; i < n; i += 1) rows.push({ ...card, quantity: 1, uid: `${card.oracleId}#${i}`, sick: false });
  }
  return rows;
}

function counts(cards: PlanCardV1[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const card of cards) map.set(card.oracleId, (map.get(card.oracleId) ?? 0) + Math.max(1, card.quantity));
  return map;
}

function tutorCanFind(tutor: PlanCardV1, required: PlanCardV1[]): boolean {
  const text = tutor.text.toLowerCase();
  if (/search your library for (?:a |an )?(?:card|permanent)/i.test(tutor.text) || /\btutor\b/i.test(tutor.name)) {
    const type = text.match(/search your library for an? (creature|land|instant|sorcery|artifact|enchantment)/i)?.[1];
    if (!type) return required.length > 0;
    return required.some((card) => card.typeLine.toLowerCase().includes(type));
  }
  return false;
}

export function scoreSynergy(args: {
  cards: PlanCardV1[];
  commanders: PlanCardV1[];
  plan: WinPlanV1;
  comboMatches: ComboMatches;
}): SynergyPartsV1 {
  const line = args.plan.primary;
  const owned = counts([...args.cards, ...args.commanders]);
  const byId = new Map([...args.cards, ...args.commanders].map((c) => [c.oracleId, c]));
  const present = (id: string) => owned.has(id);
  const directHits = line.requiredCards.filter(present).length;
  const direct = line.requiredCards.length ? directHits / line.requiredCards.length : 0;
  if (direct < 1) {
    return { direct, access: 0, enablers: 0, redundancy: 0, verifiedCombo: null, score: 0, reason: "missing-required" };
  }
  if (line.type === "loop-plus-outlet") {
    if (!line.produces || !line.converts || !outletAcceptsProduct(line.produces, line.converts)) {
      return { direct, access: 0, enablers: 0, redundancy: 0, verifiedCombo: 0, score: 0, reason: "outlet-mismatch" };
    }
    if (line.outletCards.some((id) => !present(id))) {
      return { direct, access: 0, enablers: 0, redundancy: 0, verifiedCombo: 0, score: 0, reason: "missing-outlet" };
    }
  }
  const access =
    line.tutors.length === 0
      ? 1
      : line.tutors.filter((id) => {
          const card = byId.get(id);
          if (card == null) return false;
          if (line.type === "poison-combat") return isCreatureTutor(card);
          return tutorCanFind(card, line.requiredCards.map((rid) => byId.get(rid)!).filter(Boolean));
        }).length / line.tutors.length;
  const enablers = line.enablers.length === 0 ? 1 : line.enablers.filter(present).length / line.enablers.length;
  const copyRedundancy =
    line.requiredCards.length === 0
      ? 1
      : line.requiredCards.filter((id) => (owned.get(id) ?? 0) >= 2).length / line.requiredCards.length;
  const poisonBodies =
    line.type === "poison-combat"
      ? args.cards.filter((card) => poisonYield(card) > 0).length
      : 0;
  const backupRedundancy =
    poisonBodies <= 1 ? 0 : Math.min(1, (poisonBodies - 1) / POISON_REDUNDANCY_SATURATION);
  const redundancy = Math.max(copyRedundancy, backupRedundancy);
  const needsCombo = line.type === "hasty-creatures" || line.type === "loop-plus-outlet";
  const verifiedCombo = needsCombo ? (args.comboMatches(line.requiredCards) ? 1 : 0) : null;
  const parts = [direct, access, enablers, redundancy, ...(verifiedCombo == null ? [] : [verifiedCombo])];
  const score = parts.reduce((s, n) => s + n, 0) / parts.length;
  return { direct, access, enablers, redundancy, verifiedCombo, score, reason: null };
}

function planIds(line: WinPlanLineV1, commanders: PlanCardV1[]): Set<string> {
  return new Set([...line.requiredCards, ...line.tutors, ...line.enablers, ...line.outletCards, ...line.hasteSources, ...commanders.map((c) => c.oracleId)]);
}

function toMull(card: Inst, ids: Set<string>, line: WinPlanLineV1): MullCard {
  return {
    name: card.name,
    oracleId: card.oracleId,
    cmc: card.cmc,
    countsAsLand: isLand(card),
    isManaSource: isManaSourceV2({
      countsAsLand: isLand(card),
      cmc: card.cmc,
      isLand: isLand(card),
      name: card.name,
      rampMana: manaProduction(card),
      text: card.text,
    }),
    isPlanCard: ids.has(card.oracleId) || (line.type === "poison-combat" && poisonYield(card) > 0),
    castableByT2: card.cmc <= 2,
  };
}

function poisonOnHit(attacker: Inst, board: Inst[]): number {
  if (attacker.power <= 0) return 0;
  const fynn = board.some(
    (c) => /^Fynn, the Fangbearer/i.test(c.name) || /deathtouch deals combat damage to a player, that player gets two poison/i.test(c.text),
  );
  if (isInfectCreature(attacker)) return Math.max(0, attacker.power);
  const deathtouch = keywordDeathtouch(attacker) || board.some(grantsDeathtouch);
  let total = 0;
  if (fynn && deathtouch) total += 2;
  total += toxicCount(attacker);
  return total;
}

function hasteAvailable(board: Inst[], line: WinPlanLineV1): boolean {
  if (board.some((c) => line.hasteSources.includes(c.oracleId) || /creatures you control have haste/i.test(c.text))) return true;
  return false;
}

function idsIn(zone: Inst[], ids: string[]): boolean {
  const have = new Set(zone.map((c) => c.oracleId));
  return ids.every((id) => have.has(id));
}

type Play = {
  library: Inst[];
  hand: Inst[];
  board: Inst[];
  command: Inst[];
  commanderCasts: number;
  poison: number;
  combatDamage: number;
  commanderDamage: number;
  assembled: boolean;
  log: string[];
  mulligans: number;
  mulliganDecisions: string[];
};

function pushLog(play: Play, line: string) {
  if (play.log.length < 48) play.log.push(line);
}

function openHand(library: Inst[], rng: () => number, ids: Set<string>, line: WinPlanLineV1, hasTerminal: boolean): Pick<Play, "library" | "hand" | "mulligans" | "mulliganDecisions"> {
  const hand: Inst[] = [];
  const decisions: string[] = [];
  let mulligans = 0;
  for (let mull = 0; mull <= 3; mull += 1) {
    while (hand.length) library.push(hand.pop()!);
    shuffle(library, rng);
    for (let i = 0; i < 7 && library.length; i += 1) hand.push(library.pop()!);
    const decision = keepMulliganV2({ hand: hand.map((c) => toMull(c, ids, line)), mull, hasTerminalLine: hasTerminal });
    decisions.push(decision.reason);
    if (decision.keep || mull === 3) {
      mulligans = mull;
      const putBack = Math.max(0, mull - 1);
      const bottoms = bottomMulliganV2(hand.map((c) => toMull(c, ids, line)), putBack);
      for (const bottom of bottoms) {
        const idx = hand.findIndex((c) => c.oracleId === bottom.oracleId);
        if (idx >= 0) library.unshift(hand.splice(idx, 1)[0]!);
      }
      break;
    }
  }
  return { library, hand, mulligans, mulliganDecisions: decisions };
}

function manaAvailable(board: Inst[]): number {
  return board.reduce((sum, card) => {
    if (isCreature(card) && card.sick) return sum;
    return sum + manaProduction(card);
  }, 0);
}

function missingRequired(play: Play, ids: string[]): Inst | null {
  const held = new Set([...play.hand, ...play.board, ...play.command].map((c) => c.oracleId));
  const options = play.library.filter((c) => ids.includes(c.oracleId) && !held.has(c.oracleId));
  options.sort((a, b) => a.oracleId.localeCompare(b.oracleId));
  return options[0] ?? null;
}

function priority(card: Inst, line: WinPlanLineV1, play: Play): number {
  if (line.tutors.includes(card.oracleId) && missingRequired(play, line.requiredCards)) return 0;
  if (line.requiredCards.includes(card.oracleId) && !play.board.some((c) => c.oracleId === card.oracleId)) return 1;
  if (line.enablers.includes(card.oracleId)) return 2;
  if (line.hasteSources.includes(card.oracleId)) return 3;
  if (line.outletCards.includes(card.oracleId)) return 4;
  if (manaProduction(card) > 0 && !isLand(card)) return 5;
  return 9;
}

function bestPoison(cards: Inst[], line: WinPlanLineV1, limit = 99): Inst | undefined {
  const named = new Set(line.requiredCards);
  return cards
    .filter((card) => named.has(card.oracleId) && poisonYield(card) > 0 && card.cmc <= limit && !card.uid.startsWith("cmd-"))
    .sort((a, b) => poisonYield(b) - poisonYield(a) || a.cmc - b.cmc || a.oracleId.localeCompare(b.oracleId))[0];
}

function castPoison(play: Play, line: WinPlanLineV1, turn: number) {
  let spent = 0;
  const mana = () => manaAvailable(play.board) - spent;
  const commander = () => play.command[0];
  const commanderCost = () => {
    const cmd = commander();
    return cmd ? cmd.cmc + play.commanderCasts * 2 : 0;
  };
  const isBody = (card: Inst) => poisonYield(card) > 0 && !card.uid.startsWith("cmd-");

  const land = play.hand.filter(isLand).sort((a, b) => a.oracleId.localeCompare(b.oracleId))[0];
  if (land) {
    play.hand.splice(play.hand.indexOf(land), 1);
    land.sick = false;
    play.board.push(land);
    pushLog(play, `T${turn} play ${land.name}`);
  }

  for (let guard = 0; guard < 8; guard += 1) {
    const next = play.hand
      .filter((card) => line.enablers.includes(card.oracleId) && !isLand(card) && manaProduction(card) > 0 && poisonYield(card) === 0 && card.cmc <= mana())
      .sort((a, b) => a.cmc - b.cmc || a.oracleId.localeCompare(b.oracleId))[0];
    if (!next) break;
    spent += next.cmc;
    play.hand.splice(play.hand.indexOf(next), 1);
    next.sick = isCreature(next);
    play.board.push(next);
    pushLog(play, `T${turn} cast ${next.name}`);
  }

  const haveBody = [...play.hand, ...play.board].some(isBody);
  if (!haveBody) {
    const tutor = play.hand
      .filter((card) => line.tutors.includes(card.oracleId) && isCreatureTutor(card) && card.cmc <= mana())
      .sort((a, b) => a.cmc - b.cmc || a.oracleId.localeCompare(b.oracleId))[0];
    if (tutor) {
      const xSpell = /\{x\}/i.test(tutor.text);
      const spend = xSpell ? mana() : tutor.cmc;
      const found = bestPoison(play.library, line, tutorFetchLimit(tutor, spend));
      if (found && spend <= mana()) {
        spent += spend;
        play.hand.splice(play.hand.indexOf(tutor), 1);
        play.library.splice(play.library.indexOf(found), 1);
        play.hand.push(found);
        pushLog(play, `T${turn} cast ${tutor.name}`);
        pushLog(play, `T${turn} tutor ${found.name}`);
      }
    }
  }

  const cmd = commander();
  if (cmd && commanderCost() <= mana()) {
    spent += commanderCost();
    play.commanderCasts += 1;
    cmd.sick = isCreature(cmd);
    play.board.push(cmd);
    play.command = [];
    pushLog(play, `T${turn} cast ${cmd.name}`);
  }

  if (!play.board.some(isBody)) {
    const attacker = bestPoison(play.hand, line, mana());
    if (attacker) {
      spent += attacker.cmc;
      play.hand.splice(play.hand.indexOf(attacker), 1);
      attacker.sick = true;
      play.board.push(attacker);
      pushLog(play, `T${turn} cast ${attacker.name}`);
    }
  }

  const ramp = play.hand
    .filter((card) => line.enablers.includes(card.oracleId) && isLandRamp(card) && card.cmc <= mana())
    .sort((a, b) => a.cmc - b.cmc || a.oracleId.localeCompare(b.oracleId))[0];
  if (ramp) {
    const basicIndex = play.library.findIndex((card) => /\bbasic\b/i.test(card.typeLine) && isLand(card));
    if (basicIndex >= 0) {
      spent += ramp.cmc;
      play.hand.splice(play.hand.indexOf(ramp), 1);
      const basic = play.library.splice(basicIndex, 1)[0]!;
      basic.sick = false;
      play.board.push(basic);
      pushLog(play, `T${turn} cast ${ramp.name}`);
      pushLog(play, `T${turn} ramp ${basic.name}`);
    }
  }

  for (let guard = 0; guard < 6; guard += 1) {
    const extra = bestPoison(play.hand, line, mana());
    if (!extra || !play.board.some(isBody)) break;
    spent += extra.cmc;
    play.hand.splice(play.hand.indexOf(extra), 1);
    extra.sick = true;
    play.board.push(extra);
    pushLog(play, `T${turn} cast ${extra.name}`);
  }
}

function castFromHand(play: Play, line: WinPlanLineV1, turn: number) {
  if (line.type === "poison-combat") {
    castPoison(play, line, turn);
    return;
  }
  let spent = 0;
  const refresh = () => manaAvailable(play.board) - spent;
  const land = play.hand.filter(isLand).sort((a, b) => a.oracleId.localeCompare(b.oracleId))[0];
  if (land) {
    play.hand.splice(play.hand.indexOf(land), 1);
    land.sick = false;
    play.board.push(land);
    pushLog(play, `T${turn} play ${land.name}`);
  }
  for (let guard = 0; guard < 12; guard += 1) {
    const choices = play.hand
      .filter((c) => !isLand(c) && c.cmc <= refresh())
      .sort((a, b) => priority(a, line, play) - priority(b, line, play) || a.cmc - b.cmc || a.oracleId.localeCompare(b.oracleId));
    const next = choices[0];
    if (!next || priority(next, line, play) >= 9) break;
    spent += next.cmc;
    play.hand.splice(play.hand.indexOf(next), 1);
    if (line.tutors.includes(next.oracleId) && isSpell(next)) {
      const found = missingRequired(play, line.requiredCards);
      pushLog(play, `T${turn} cast ${next.name}`);
      if (found) {
        play.library.splice(play.library.indexOf(found), 1);
        play.hand.push(found);
        pushLog(play, `T${turn} tutor ${found.name}`);
      }
      continue;
    }
    next.sick = isCreature(next);
    play.board.push(next);
    pushLog(play, `T${turn} cast ${next.name}`);
  }
  const commander = play.command[0];
  const commanderCost = commander ? commander.cmc + play.commanderCasts * 2 : 0;
  if (commander && commanderCost <= refresh()) {
    spent += commanderCost;
    play.commanderCasts += 1;
    commander.sick = isCreature(commander);
    play.board.push(commander);
    play.command = [];
    pushLog(play, `T${turn} cast ${commander.name}`);
  }
}

function attackers(board: Inst[], line: WinPlanLineV1): Inst[] {
  const granted = hasteAvailable(board, line);
  return board.filter((c) => isCreature(c) && (!c.sick || hasHaste(c) || granted));
}

function checkWin(play: Play, line: WinPlanLineV1, comboMatches: ComboMatches): boolean {
  if (line.type === "poison-combat") return play.poison >= PLAN_POISON_LETHAL;
  if (line.type === "combat-damage") return play.combatDamage >= PLAN_OPPONENT_LIFE || play.commanderDamage >= PLAN_COMMANDER_DAMAGE;
  const piecesReady = idsIn(play.board, line.requiredCards);
  if (!piecesReady) return false;
  play.assembled = true;
  if (!comboMatches(line.requiredCards)) return false;
  if (line.type === "hasty-creatures") {
    const bodies = play.board.filter((c) => line.requiredCards.includes(c.oracleId) && isCreature(c));
    const hasty = bodies.length > 0 && (bodies.every((c) => hasHaste(c) || !c.sick) || hasteAvailable(play.board, line));
    return hasty;
  }
  if (line.type === "loop-plus-outlet") return idsIn(play.board, line.outletCards);
  return false;
}

function oneTrial(seed: number, librarySource: Inst[], commanders: Inst[], plan: WinPlanV1, comboMatches: ComboMatches): PlanTrialV1 {
  const rng = mulberry32(seed);
  const ids = planIds(plan.primary, commanders);
  const hasTerminal = plan.primary.type === "hasty-creatures" || plan.primary.type === "loop-plus-outlet";
  const opened = openHand(librarySource.map((c) => ({ ...c })), rng, ids, plan.primary, hasTerminal);
  const play: Play = {
    library: opened.library,
    hand: opened.hand,
    board: [],
    command: commanders.map((c) => ({ ...c, sick: false })),
    commanderCasts: 0,
    poison: 0,
    combatDamage: 0,
    commanderDamage: 0,
    assembled: false,
    log: [],
    mulligans: opened.mulligans,
    mulliganDecisions: opened.mulliganDecisions,
  };
  pushLog(play, `mulligans ${play.mulligans} (${play.mulliganDecisions.join(", ")})`);
  let winTurn: number | null = null;
  for (let turn = 1; turn <= PLAN_TURN_CAP; turn += 1) {
    for (const card of play.board) card.sick = false;
    if (turn > 1 && play.library.length) {
      play.hand.push(play.library.pop()!);
    }
    castFromHand(play, plan.primary, turn);
    const swinging = attackers(play.board, plan.primary);
    if (plan.primary.type === "poison-combat") {
      const gained = swinging.reduce((sum, card) => sum + poisonOnHit(card, play.board), 0);
      play.poison += gained;
      if (gained) pushLog(play, `T${turn} poison +${gained} (total ${play.poison})`);
    }
    if (plan.primary.type === "combat-damage") {
      const dmg = swinging.reduce((sum, card) => sum + Math.max(0, card.power), 0);
      const cmd = swinging.filter((c) => commanders.some((cmdCard) => cmdCard.oracleId === c.oracleId)).reduce((sum, card) => sum + Math.max(0, card.power), 0);
      play.combatDamage += dmg;
      play.commanderDamage += cmd;
      if (dmg) pushLog(play, `T${turn} combat ${dmg} (commander ${play.commanderDamage})`);
    }
    if (checkWin(play, plan.primary, comboMatches)) {
      winTurn = turn;
      pushLog(play, `T${turn} win ${plan.primary.type}`);
      break;
    }
  }
  let failureReason: string | null = null;
  if (winTurn == null) {
    failureReason = play.assembled && (plan.primary.type === "hasty-creatures" || plan.primary.type === "loop-plus-outlet") ? "unverified-loop" : "cap";
  }
  return {
    seed,
    mulligans: play.mulligans,
    mulliganDecisions: play.mulliganDecisions,
    winTurn,
    failureReason,
    winningPlan: winTurn == null ? null : "primary",
    assembled: play.assembled,
    poison: play.poison,
    combatDamage: play.combatDamage,
    commanderDamage: play.commanderDamage,
    log: play.log,
  };
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function rmst15(trials: PlanTrialV1[]): number {
  const total = trials.reduce((sum, trial) => sum + (trial.winTurn ?? PLAN_TURN_CAP), 0);
  return Math.round((total / Math.max(1, trials.length)) * 1000) / 1000;
}

export function runPlanChecker(args: {
  cards: PlanCardV1[];
  commanders: PlanCardV1[];
  plan: WinPlanV1;
  comboMatches?: ComboMatches;
  comboDb?: string;
}): PlanCheckResultV1 {
  const comboMatches = args.comboMatches ?? (() => false);
  const synergy = scoreSynergy({ cards: args.cards, commanders: args.commanders, plan: args.plan, comboMatches });
  const library = canonicalizeLibrary(args.cards, args.commanders);
  const commanders: Inst[] = args.commanders.map((c, i) => ({ ...c, quantity: 1, uid: `cmd-${c.oracleId}#${i}`, sick: false }));
  const dead = synergy.reason === "missing-required" || synergy.reason === "outlet-mismatch" || synergy.reason === "missing-outlet";
  const trialsDetail: PlanTrialV1[] = [];
  for (let seed = 0; seed < PLAN_SEED_COUNT; seed += 1) {
    if (dead) {
      trialsDetail.push({
        seed,
        mulligans: 0,
        mulliganDecisions: [],
        winTurn: null,
        failureReason: synergy.reason,
        winningPlan: null,
        assembled: false,
        poison: 0,
        combatDamage: 0,
        commanderDamage: 0,
        log: [synergy.reason ?? "dead-plan"],
      });
      continue;
    }
    trialsDetail.push(oneTrial(seed, library, commanders, args.plan, comboMatches));
  }
  const wins = trialsDetail.map((trial) => trial.winTurn).filter((turn): turn is number => turn != null);
  const speedReason = wins.length < PLAN_SPEED_MIN_SUCCESSES ? `fewer than ${PLAN_SPEED_MIN_SUCCESSES} wins in ${PLAN_SEED_COUNT}` : null;
  const speed = speedReason ? null : median(wins);
  const consistency = wins.length / PLAN_SEED_COUNT;
  return {
    checker: PLAN_CHECKER_VERSION,
    pilot: PLAN_PILOT_VERSION,
    planSchema: PLAN_SCHEMA_VERSION,
    seedSet: PLAN_SEED_SET,
    comboDb: args.comboDb ?? "none",
    speed,
    speedReason,
    consistency,
    successes: wins.length,
    trials: PLAN_SEED_COUNT,
    legacyRmst15: rmst15(trialsDetail),
    synergy,
    planCheck: planCheckEvidenceFromParts({
      connectivity: synergy,
      namedLineRate: consistency,
      namedLineSpeed: speed,
    }),
    trialsDetail,
  };
}

export function planTypeLabel(type: WinPlanType): string {
  if (type === "poison-combat") return "Poison combat";
  if (type === "hasty-creatures") return "Hasty creatures";
  if (type === "loop-plus-outlet") return "Loop plus outlet";
  return "Combat damage";
}
