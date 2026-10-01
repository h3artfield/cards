/**
 * The Professor's handoff for one built deck.
 * The readable sections and the executable claim come from the same strategy.
 * The checker owns the lethal numbers and does not treat the claim as proof.
 */
import type { WinPlanType } from "./plan-schema-v1";

export const PROFESSOR_STRATEGY_VERSION = "professor-strategy-1.0" as const;

export type ProfessorStrategyExplanationV1 = {
  mulligans: string;
  earlySetup: string;
  sequencing: string;
  interactions: string;
  recovery: string;
};

export type ProfessorStrategyWinV1 = {
  /** One of the four types the checker can test, or unsupported. */
  type: WinPlanType | "unsupported";
  summary: string;
  howTheyWorkTogether: string;
  howTheyWin: string;
  /** Card names that must be in this deck. The Professor does not set 10, 40, or 21. */
  requiredCards: string[];
  tutors: string[];
  enablers: string[];
};

export type ProfessorStrategyV1 = {
  schema: typeof PROFESSOR_STRATEGY_VERSION;
  explanation: ProfessorStrategyExplanationV1;
  win: ProfessorStrategyWinV1;
};

export const PROFESSOR_STRATEGY_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    mulligans: { type: "string" },
    earlySetup: { type: "string" },
    sequencing: { type: "string" },
    interactions: { type: "string" },
    recovery: { type: "string" },
    winType: { type: "string", enum: ["poison-combat", "combat-damage", "hasty-creatures", "loop-plus-outlet", "unsupported"] },
    summary: { type: "string" },
    howTheyWorkTogether: { type: "string" },
    howTheyWin: { type: "string" },
    requiredCards: { type: "array", items: { type: "string" } },
    tutors: { type: "array", items: { type: "string" } },
    enablers: { type: "array", items: { type: "string" } },
  },
  required: [
    "mulligans",
    "earlySetup",
    "sequencing",
    "interactions",
    "recovery",
    "winType",
    "summary",
    "howTheyWorkTogether",
    "howTheyWin",
    "requiredCards",
    "tutors",
    "enablers",
  ],
} as const;
