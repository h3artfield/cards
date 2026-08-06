import type { AllowedCardRegistry } from "./allowed-card-registry";
import type { SpecialistResponse } from "./clerk-types";

/** Validated answer plan — formatter may not exceed this card surface. */
export interface ClerkAnswerPlan {
  directAnswer: string;
  registry: AllowedCardRegistry;
  commanderOracleId?: string;
  commanderCanonicalName?: string;
  warnings: string[];
}

export function buildAnswerPlan(input: {
  specialist: SpecialistResponse;
  registry: AllowedCardRegistry;
}): ClerkAnswerPlan {
  return {
    directAnswer: input.specialist.direct_answer,
    registry: input.registry,
    commanderOracleId:
      input.specialist.commanderOracleId ??
      input.specialist.deckList?.commanderOracleId,
    commanderCanonicalName:
      input.specialist.deckList?.commanderCanonicalName ??
      input.specialist.deckList?.archetype,
    warnings: input.specialist.warnings ?? [],
  };
}

/** Deterministic customer reply when formatter introduces unapproved cards. */
export function renderDeterministicReply(plan: ClerkAnswerPlan): string {
  const parts = [plan.directAnswer.trim()];
  if (plan.warnings.length > 0) {
    parts.push(
      `\n\nNotes: ${plan.warnings.slice(0, 3).join("; ")}`,
    );
  }
  return parts.join("");
}
