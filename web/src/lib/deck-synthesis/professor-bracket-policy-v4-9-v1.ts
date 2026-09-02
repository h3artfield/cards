/**
 * Commander Bracket Policy v4.9 — client-safe bracket targets for Professor Council.
 * Do NOT import bracket-policy-v1.ts here — it pulls server-only catalog/Firebase deps.
 */
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import { COMMANDER_BRACKET_META_V1 } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";

export const PROFESSOR_V4_9_BRACKET_DECISION_V1 =
  "PROFESSOR_V4_9_BRACKET_TARGETED_DECK_CONSTRUCTION_V1_AUTHORIZED";

export const PROFESSOR_BRACKET_POLICY_V4_9_V1_VERSION = "professor-bracket-policy-v4-9-v1";

/** Mirrors commander-bracket-policy-snapshot-v1 hard rules — keep in sync with bracket-policy-v1.ts */
export const COMMANDER_BRACKET_POLICY_SNAPSHOT_VERSION = "commander-bracket-policy-snapshot-v1";

const AUTHORITATIVE_SOURCE_URL =
  "https://magic.wizards.com/en/news/announcements/commander-brackets-beta-update-february-9-2026";

const HARD_RULES: Record<CommanderBracket, { gameChangerMax: number | null; gameChangerMin: number }> = {
  1: { gameChangerMax: 0, gameChangerMin: 0 },
  2: { gameChangerMax: 0, gameChangerMin: 0 },
  3: { gameChangerMax: 3, gameChangerMin: 0 },
  4: { gameChangerMax: null, gameChangerMin: 0 },
  5: { gameChangerMax: null, gameChangerMin: 0 },
};

const HEURISTIC_BAROMETERS: Record<CommanderBracket, string[]> = {
  1: ["Extra turn density: soft barometer", "Mass land denial: soft barometer"],
  2: ["Extra turn density: soft barometer", "Two-card combo density: soft barometer"],
  3: ["Extra turn density: soft barometer", "Mass land denial: soft barometer"],
  4: [],
  5: [],
};

export type CommanderBracketPolicyV49 = {
  policyVersion: string;
  authoritativeSourceUrl: string;
  bracketNumber: CommanderBracket;
  name: string;
  philosophy: string;
  gameplayExpectation: string;
  expectedTurnWindow: string;
  gameChangerPolicy: string;
  comboPolicy: string;
  extraTurnPolicy: string;
  massLandDenialPolicy: string;
  relevantOfficialNotes: string[];
  gameChangerMax: number | null;
  gameChangerMin: number;
};

const BRACKET_EXPECTATIONS: Record<
  CommanderBracket,
  Pick<CommanderBracketPolicyV49, "gameplayExpectation" | "expectedTurnWindow" | "comboPolicy" | "extraTurnPolicy" | "massLandDenialPolicy">
> = {
  1: {
    gameplayExpectation: "Ultra-casual battlecruiser — novelty and flavor over optimization.",
    expectedTurnWindow: "Games often last 10+ turns; wins are slow and telegraphed.",
    comboPolicy: "Avoid deterministic infinite combos.",
    extraTurnPolicy: "Minimal extra turns.",
    massLandDenialPolicy: "Avoid mass land denial.",
  },
  2: {
    gameplayExpectation: "Precon-plus casual — coherent plans without high-speed combo.",
    expectedTurnWindow: "Games commonly reach turn 8+ before a decisive win.",
    comboPolicy: "Limited combo; no early deterministic wins.",
    extraTurnPolicy: "Extra turns should be rare.",
    massLandDenialPolicy: "Mass land denial discouraged.",
  },
  3: {
    gameplayExpectation: "Strong upgraded decks — high card quality with faster plans acceptable.",
    expectedTurnWindow: "Games often last at least six turns; wins around turns 6–9 are normal.",
    comboPolicy: "Finite combos and strong synergies acceptable; not turn-2 combo.",
    extraTurnPolicy: "Some extra turns ok if not chained.",
    massLandDenialPolicy: "Light land denial only.",
  },
  4: {
    gameplayExpectation:
      "Optimized — lethal, consistent, fast decks with efficient explosive resources, tutors, protection, and compact win conditions.",
    expectedTurnWindow: "Players often get ~4 turns before a win or loss is realistic.",
    comboPolicy: "Fast combos possible but need not be infinite-combo soup if user identity forbids it.",
    extraTurnPolicy: "Extra turns acceptable when bracket-appropriate.",
    massLandDenialPolicy: "Targeted disruption ok; heavy stax only if strategy supports it.",
  },
  5: {
    gameplayExpectation: "Competitive EDH — no bracket power cap; maximum consistency and speed.",
    expectedTurnWindow: "Early wins and highly efficient interaction are expected.",
    comboPolicy: "Full combo density allowed.",
    extraTurnPolicy: "Extra turns and loops expected.",
    massLandDenialPolicy: "Hard stax and denial allowed.",
  },
};

export function loadCommanderBracketPolicyV49(bracket: CommanderBracket): CommanderBracketPolicyV49 {
  const hard = HARD_RULES[bracket];
  const meta = COMMANDER_BRACKET_META_V1[bracket];
  const expectations = BRACKET_EXPECTATIONS[bracket];
  const gcMax = hard.gameChangerMax;
  return {
    policyVersion: COMMANDER_BRACKET_POLICY_SNAPSHOT_VERSION,
    authoritativeSourceUrl: AUTHORITATIVE_SOURCE_URL,
    bracketNumber: bracket,
    name: meta.name,
    philosophy: meta.intentPhilosophy,
    gameplayExpectation: expectations.gameplayExpectation,
    expectedTurnWindow: expectations.expectedTurnWindow,
    gameChangerPolicy:
      gcMax === 0
        ? "No Game Changers"
        : gcMax === 3
          ? "Up to 3 Game Changers"
          : "Unlimited Game Changers",
    comboPolicy: expectations.comboPolicy,
    extraTurnPolicy: expectations.extraTurnPolicy,
    massLandDenialPolicy: expectations.massLandDenialPolicy,
    relevantOfficialNotes: HEURISTIC_BAROMETERS[bracket],
    gameChangerMax: gcMax,
    gameChangerMin: hard.gameChangerMin,
  };
}

export function bracketPowerWeightV49(bracket: CommanderBracket): number {
  return bracket <= 2 ? 0.35 : bracket === 3 ? 0.65 : bracket === 4 ? 1 : 1.15;
}
