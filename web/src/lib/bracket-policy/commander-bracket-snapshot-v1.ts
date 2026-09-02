/**
 * Commander bracket snapshot — client-safe metadata (no Node/Firebase deps).
 */
export const COMMANDER_BRACKET_SNAPSHOT_V1_VERSION = "commander-bracket-snapshot-v1";

export type CommanderBracket = 1 | 2 | 3 | 4 | 5;

export type CommanderBracketMetaV1 = {
  name: string;
  intentPhilosophy: string;
};

export const COMMANDER_BRACKET_META_V1: Record<CommanderBracket, CommanderBracketMetaV1> = {
  1: {
    name: "Exhibition",
    intentPhilosophy: "Ultra-casual, low-powered, no Game Changers, minimal fast combos or extra turns.",
  },
  2: {
    name: "Core",
    intentPhilosophy: "Precon-plus casual — no Game Changers, limited high-speed combo.",
  },
  3: {
    name: "Upgraded",
    intentPhilosophy: "Strong upgraded decks — up to three Game Changers, faster plans acceptable.",
  },
  4: {
    name: "Optimized",
    intentPhilosophy: "High-power optimized — unlimited Game Changers, fast combos possible.",
  },
  5: {
    name: "cEDH",
    intentPhilosophy: "Competitive EDH — unlimited Game Changers, no bracket power cap.",
  },
};
