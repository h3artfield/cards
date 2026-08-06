import type { SpecialistResponse } from "../clerk-types";
import type { ClerkVerifierOutput } from "./types";

/** Option B: deterministic fixes the verifier may apply without re-running the specialist. */
export function applyVerifierMinorFixes(
  specialist: SpecialistResponse,
  verification: ClerkVerifierOutput,
): SpecialistResponse {
  if (verification.hard_failures.length === 0) {
    return specialist;
  }

  let next = { ...specialist };

  const illegalNames = new Set<string>();
  for (const failure of verification.hard_failures) {
    const match = failure.match(/^"([^"]+)"/);
    if (
      match &&
      (failure.includes("cannot legally be used as a commander") ||
        failure.includes("does not match the requested color identity") ||
        failure.includes("exceeds the requested price"))
    ) {
      illegalNames.add(match[1].toLowerCase());
    }
  }

  if (illegalNames.size > 0 && next.recommendations.length > 0) {
    const filtered = next.recommendations.filter(
      (r) => !illegalNames.has(r.card_name.toLowerCase()),
    );
    if (filtered.length !== next.recommendations.length) {
      next = {
        ...next,
        recommendations: filtered,
        warnings: [
          ...next.warnings,
          `Removed ${next.recommendations.length - filtered.length} result(s) that failed verification.`,
        ],
      };
      if (filtered.length === 0) {
        next = {
          ...next,
          direct_answer:
            "I couldn't find verified in-stock commanders matching your criteria. Try widening your budget or color filter.",
          confidence: 0.4,
        };
      } else if (filtered.length === 1) {
        next = {
          ...next,
          direct_answer: `${next.direct_answer}\n\nNote: only one verified in-stock commander matched — I can't call this a ranked list of the best options.`,
        };
      }
    }
  }

  return next;
}
