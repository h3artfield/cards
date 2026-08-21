import type { ConcreteInteraction, MechanicalCandidateVerifier, VerificationResult } from "./types";
import type { MechanicalGraph } from "./graph-indexes";

export class DeterministicGraphVerifier implements MechanicalCandidateVerifier {
  constructor(private readonly graph: MechanicalGraph) {}

  verify(candidate: ConcreteInteraction): VerificationResult {
    const reasons: string[] = [];
    const recipe = this.graph.recipes.get(candidate.recipeId);
    if (!recipe) reasons.push(`unknown recipe ${candidate.recipeId}`);

    for (const use of candidate.cards) {
      if (!this.graph.cards.has(use.oracleId)) {
        reasons.push(`card ${use.oracleId} is not in the local graph index`);
      }
    }

    if (candidate.cards.length === 0 && candidate.templates.length === 0) {
      reasons.push("candidate has no cards or templates");
    }

    if (!candidate.proof.length) {
      reasons.push("candidate is missing an explainable proof chain");
    }

    return { ok: reasons.length === 0, reasons };
  }
}
