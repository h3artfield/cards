/**
 * Pinned rules evidence catalog for Professor v3 grounding resolution.
 */
export const PROFESSOR_V3_RULES_CATALOG_V1_VERSION = "professor-v3-rules-catalog-v1";

export type ProfessorV3RuleEntry = {
  ruleId: string;
  title: string;
  text: string;
};

export const PROFESSOR_V3_RULES_CATALOG_V1: Record<string, ProfessorV3RuleEntry> = {
  "cr-305-1-land-play-limit": {
    ruleId: "cr-305-1-land-play-limit",
    title: "CR 305.1 — Play a land",
    text: "A player may play a land card from their hand during either of their main phases if the stack is empty and they have priority.",
  },
  "cr-614-13a-replacement-effect": {
    ruleId: "cr-614-13a-replacement-effect",
    title: "CR 614.13a — Replacement effects",
    text: "If an event would occur and a replacement effect would modify how it occurs, the original event does not occur.",
  },
};

export function resolveProfessorV3Rule(ruleId: string): ProfessorV3RuleEntry | null {
  return PROFESSOR_V3_RULES_CATALOG_V1[ruleId] ?? null;
}
