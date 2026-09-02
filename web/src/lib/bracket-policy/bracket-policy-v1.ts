/**
 * Commander Bracket Policy Engine v1 — separately versioned constraints.
 * bracketRulesSatisfied ≠ bracketIntentFit. Do not infer bracket from GC count alone.
 */
import { commanderLegalInIdentity } from "@/lib/semantic-visualization/filters-v1";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { isCurrentlyCommanderLegal } from "../../../scripts/lib/load-deck-resolution-catalog";
import {
  COMMANDER_GAME_CHANGER_SNAPSHOT_VERSION,
  type CommanderGameChangerSnapshot,
  gameChangerOracleIdSet,
} from "../commander-strategy/model-c/game-changer-snapshot-v1";
import { buildCardFeatureBundle } from "@/lib/semantic-visualization/feature-vector-v1";
import type { ShadowSemanticIndex } from "../commander-strategy/shadow-semantic-index";
import type { NormalizedDeckInstance } from "../commander-strategy/types";
import { commanderColorIdentity, isBasicLand } from "../deck-evaluation/normalize-deck-input-v1";

export const COMMANDER_BRACKET_POLICY_SNAPSHOT_VERSION = "commander-bracket-policy-snapshot-v1";

export type { CommanderBracket } from "./commander-bracket-snapshot-v1";
import {
  COMMANDER_BRACKET_META_V1,
  type CommanderBracket,
} from "./commander-bracket-snapshot-v1";

export type BracketBarometerHeuristic = {
  id: string;
  label: string;
  kind: "HEURISTIC";
  note: string;
};

export type CommanderBracketPolicySnapshot = {
  version: typeof COMMANDER_BRACKET_POLICY_SNAPSHOT_VERSION;
  gameChangerSnapshotVersion: typeof COMMANDER_GAME_CHANGER_SNAPSHOT_VERSION;
  authoritativeSourceUrl: string;
  brackets: Record<
    CommanderBracket,
    {
      name: string;
      intentPhilosophy: string;
      hardRules: {
        gameChangerMax: number | null;
        gameChangerMin: number;
      };
      heuristicBarometers: BracketBarometerHeuristic[];
    }
  >;
};

export const COMMANDER_BRACKET_POLICY_SNAPSHOT: CommanderBracketPolicySnapshot = {
  version: COMMANDER_BRACKET_POLICY_SNAPSHOT_VERSION,
  gameChangerSnapshotVersion: COMMANDER_GAME_CHANGER_SNAPSHOT_VERSION,
  authoritativeSourceUrl:
    "https://magic.wizards.com/en/news/announcements/commander-brackets-beta-update-february-9-2026",
  brackets: {
    1: {
      name: COMMANDER_BRACKET_META_V1[1].name,
      intentPhilosophy: COMMANDER_BRACKET_META_V1[1].intentPhilosophy,
      hardRules: { gameChangerMax: 0, gameChangerMin: 0 },
      heuristicBarometers: [
        { id: "extra_turn_density", label: "Extra turn density", kind: "HEURISTIC", note: "Soft barometer — not hard ban" },
        { id: "mass_land_denial", label: "Mass land denial", kind: "HEURISTIC", note: "Soft barometer — not hard ban" },
      ],
    },
    2: {
      name: COMMANDER_BRACKET_META_V1[2].name,
      intentPhilosophy: COMMANDER_BRACKET_META_V1[2].intentPhilosophy,
      hardRules: { gameChangerMax: 0, gameChangerMin: 0 },
      heuristicBarometers: [
        { id: "extra_turn_density", label: "Extra turn density", kind: "HEURISTIC", note: "Soft barometer" },
        { id: "two_card_combo_density", label: "Two-card combo density", kind: "HEURISTIC", note: "Soft barometer" },
      ],
    },
    3: {
      name: COMMANDER_BRACKET_META_V1[3].name,
      intentPhilosophy: COMMANDER_BRACKET_META_V1[3].intentPhilosophy,
      hardRules: { gameChangerMax: 3, gameChangerMin: 0 },
      heuristicBarometers: [
        { id: "extra_turn_density", label: "Extra turn density", kind: "HEURISTIC", note: "Soft barometer" },
        { id: "mass_land_denial", label: "Mass land denial", kind: "HEURISTIC", note: "Soft barometer" },
      ],
    },
    4: {
      name: COMMANDER_BRACKET_META_V1[4].name,
      intentPhilosophy: COMMANDER_BRACKET_META_V1[4].intentPhilosophy,
      hardRules: { gameChangerMax: null, gameChangerMin: 0 },
      heuristicBarometers: [],
    },
    5: {
      name: COMMANDER_BRACKET_META_V1[5].name,
      intentPhilosophy: COMMANDER_BRACKET_META_V1[5].intentPhilosophy,
      hardRules: { gameChangerMax: null, gameChangerMin: 0 },
      heuristicBarometers: [],
    },
  },
};

export function getBracketPolicy(bracket: CommanderBracket): CommanderBracketPolicySnapshot["brackets"][CommanderBracket] {
  return COMMANDER_BRACKET_POLICY_SNAPSHOT.brackets[bracket];
}

export type BracketViolation = {
  code: string;
  message: string;
  oracleId?: string;
  cardName?: string;
};

export type BracketValidationReport = {
  bracket: CommanderBracket;
  bracketRulesSatisfied: boolean;
  violations: BracketViolation[];
  gameChangerCount: number;
  policyVersion: string;
};

function countGameChangers(deck: NormalizedDeckInstance, gcSet: Set<string>): number {
  let n = 0;
  for (const id of deck.commanderOracleIds) if (gcSet.has(id)) n += 1;
  for (const row of deck.mainboard) {
    if (row.oracleId && gcSet.has(row.oracleId)) n += row.quantity;
  }
  return n;
}


export function validateBracketHardRules(input: {
  deck: NormalizedDeckInstance;
  bracket: CommanderBracket;
  catalog: DeckResolutionCatalog;
  gameChangerSnapshot: CommanderGameChangerSnapshot;
}): BracketValidationReport {
  const policy = getBracketPolicy(input.bracket);
  const violations: BracketViolation[] = [];
  const gcSet = gameChangerOracleIdSet(input.gameChangerSnapshot);
  const gcCount = countGameChangers(input.deck, gcSet);
  const cmdColors = commanderColorIdentity(input.deck.commanderOracleIds, input.catalog);

  if (input.deck.commanderOracleIds.length === 0) {
    violations.push({ code: "MISSING_COMMANDER", message: "Deck has no resolved commander." });
  }

  for (const cmdId of input.deck.commanderOracleIds) {
    const card = input.catalog.byOracleId.get(cmdId);
    if (!card) {
      violations.push({ code: "UNRESOLVED_COMMANDER", message: `Unresolved commander: ${cmdId}`, oracleId: cmdId });
      continue;
    }
    if (!isCurrentlyCommanderLegal(card)) {
      violations.push({
        code: "ILLEGAL_COMMANDER",
        message: `${card.canonicalName ?? cmdId} is not legal as commander.`,
        oracleId: cmdId,
        cardName: card.canonicalName,
      });
    }
  }

  const nonBasicCounts = new Map<string, number>();
  let totalMainboard = 0;
  for (const row of input.deck.mainboard) {
    if (!row.oracleId) continue;
    const card = input.catalog.byOracleId.get(row.oracleId);
    if (!card) {
      violations.push({ code: "UNRESOLVED_CARD", message: `Unresolved card: ${row.sourceName}`, oracleId: row.oracleId });
      continue;
    }
    totalMainboard += row.quantity;

    if (card.legalities?.commander === "banned") {
      violations.push({
        code: "BANNED_CARD",
        message: `${card.canonicalName ?? row.oracleId} is banned in Commander.`,
        oracleId: row.oracleId,
        cardName: card.canonicalName,
      });
    }
    if (!isCurrentlyCommanderLegal(card) && card.legalities?.commander !== "legal") {
      if (card.legalities?.commander === "banned") {
        // already reported
      } else {
        violations.push({
          code: "NOT_COMMANDER_LEGAL",
          message: `${card.canonicalName ?? row.oracleId} is not legal in Commander.`,
          oracleId: row.oracleId,
          cardName: card.canonicalName,
        });
      }
    }

    const cardColors = card.colorIdentity ?? [];
    if (!commanderLegalInIdentity(cardColors, cmdColors)) {
      violations.push({
        code: "COLOR_IDENTITY_VIOLATION",
        message: `${card.canonicalName ?? row.oracleId} is outside commander color identity.`,
        oracleId: row.oracleId,
        cardName: card.canonicalName,
      });
    }

    if (!isBasicLand(card)) {
      const prev = nonBasicCounts.get(row.oracleId) ?? 0;
      if (prev + row.quantity > 1) {
        violations.push({
          code: "SINGLETON_VIOLATION",
          message: `${card.canonicalName ?? row.oracleId} appears ${prev + row.quantity} times (non-basic singleton).`,
          oracleId: row.oracleId,
          cardName: card.canonicalName,
        });
      }
      nonBasicCounts.set(row.oracleId, prev + row.quantity);
    }
  }

  const expectedMainboard = 99;
  if (totalMainboard !== expectedMainboard) {
    violations.push({
      code: "DECK_SIZE",
      message: `Mainboard has ${totalMainboard} cards; expected ${expectedMainboard} (commander separate).`,
    });
  }

  const maxGc = policy.hardRules.gameChangerMax;
  if (maxGc !== null && gcCount > maxGc) {
    violations.push({
      code: "GAME_CHANGER_LIMIT",
      message: `Bracket ${input.bracket} allows at most ${maxGc} Game Changer(s); deck has ${gcCount}.`,
    });
  }
  if (gcCount < policy.hardRules.gameChangerMin) {
    violations.push({
      code: "GAME_CHANGER_MIN",
      message: `Bracket ${input.bracket} requires at least ${policy.hardRules.gameChangerMin} Game Changer(s).`,
    });
  }

  return {
    bracket: input.bracket,
    bracketRulesSatisfied: violations.length === 0,
    violations,
    gameChangerCount: gcCount,
    policyVersion: COMMANDER_BRACKET_POLICY_SNAPSHOT_VERSION,
  };
}

export type BracketIntentFitExplanation = {
  bracket: CommanderBracket;
  bracketIntentFit: number;
  note: "HEURISTIC — not official bracket determination";
  reasons: string[];
  barometerSignals: Array<{ id: string; value: number; threshold: number; label: string }>;
};

export function explainBracketFit(input: {
  deck: NormalizedDeckInstance;
  bracket: CommanderBracket;
  catalog: DeckResolutionCatalog;
  shadowIndex: ShadowSemanticIndex;
}): BracketIntentFitExplanation {
  const policy = getBracketPolicy(input.bracket);
  let extraTurnSignals = 0;
  let mldSignals = 0;
  let comboSignals = 0;
  const cmdSet = new Set(input.deck.commanderOracleIds);

  for (const row of input.deck.mainboard) {
    if (!row.oracleId || cmdSet.has(row.oracleId)) continue;
    const shadow = input.shadowIndex.byOracleId.get(row.oracleId);
    const card = input.catalog.byOracleId.get(row.oracleId);
    if (!shadow?.semantic || !card) continue;
    const bundle = buildCardFeatureBundle({ shadow, card });
    const roles = new Set(bundle.derivedRoles);
    if (roles.has("extra_turn") || roles.has("take_extra_turn")) extraTurnSignals += row.quantity;
    if (roles.has("land_destruction") || roles.has("mass_land_denial")) mldSignals += row.quantity;
    if (roles.has("combo_piece") || roles.has("win_condition")) comboSignals += row.quantity;
  }

  const barometerSignals = [
    { id: "extra_turn_density", value: extraTurnSignals, threshold: input.bracket <= 2 ? 1 : 3, label: "Extra turn signals" },
    { id: "mass_land_denial", value: mldSignals, threshold: input.bracket <= 3 ? 2 : 5, label: "Mass land denial signals" },
    { id: "combo_density", value: comboSignals, threshold: input.bracket <= 2 ? 3 : 8, label: "Combo/win-con signals" },
  ];

  let fit = 100;
  const reasons: string[] = [];
  for (const sig of barometerSignals) {
    if (sig.value > sig.threshold) {
      fit -= Math.min(30, (sig.value - sig.threshold) * 5);
      reasons.push(`${sig.label} (${sig.value}) exceeds bracket ${input.bracket} heuristic threshold (${sig.threshold}).`);
    }
  }
  if (reasons.length === 0) {
    reasons.push(`No heuristic barometer exceeded for Bracket ${input.bracket} (${policy.name}).`);
  }

  return {
    bracket: input.bracket,
    bracketIntentFit: Math.max(0, Math.min(100, fit)),
    note: "HEURISTIC — not official bracket determination",
    reasons,
    barometerSignals,
  };
}

export function validateCandidateForOptimization(
  input: Parameters<typeof validateBracketHardRules>[0],
): BracketValidationReport {
  return validateBracketHardRules(input);
}
