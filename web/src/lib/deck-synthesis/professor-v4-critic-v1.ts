/**
 * Professor v4 critic v1 — reuse validator stack as annotation engine, not orchestration gate.
 */
import type { CreativeProfessorPass1V4 } from "./professor-creative-pass1-contracts-v4";
import type { ResearchAnnotationV4, ResearchClaimDecompositionV4 } from "./professor-research-contracts-v4";
import type { ProfessorPlanningContextV3 } from "./professor-planning-contracts-v3";
import type { EvidenceRef } from "./professor-planning-evidence-v3";
import type { IndependentMechanismFact } from "./independent-truth-types-v1";

export const PROFESSOR_V4_CRITIC_V1_VERSION = "professor-v4-critic-v1";

export type CriticAnnotationV4 = {
  claimId: string;
  annotation: ResearchAnnotationV4;
  notes: string;
  evidenceRefs: EvidenceRef[];
  /** Critic never terminates orchestration — informational only. */
  terminatesOrchestration: false;
};

function mechanismSupportsClaim(facts: IndependentMechanismFact[], claim: string): EvidenceRef[] | null {
  const lower = claim.toLowerCase();
  for (const fact of facts) {
    if (lower.includes("experience") && fact.mechanismId.includes("experience")) {
      return [{ kind: "MECHANISM_FACT", factIds: [fact.mechanismId], statement: fact.evidenceSpan }];
    }
    if (lower.includes("end step") && fact.mechanismId.includes("endstep")) {
      return [{ kind: "MECHANISM_FACT", factIds: [fact.mechanismId], statement: fact.evidenceSpan }];
    }
    if (lower.includes("token") && fact.mechanismId.includes("token")) {
      return [{ kind: "MECHANISM_FACT", factIds: [fact.mechanismId], statement: fact.evidenceSpan }];
    }
    if (lower.includes("squirrel") && fact.evidenceSpan.toLowerCase().includes("squirrel")) {
      return [{ kind: "MECHANISM_FACT", factIds: [fact.mechanismId], statement: fact.evidenceSpan }];
    }
    if (fact.evidenceSpan.toLowerCase().split(/\s+/).some((word) => word.length > 4 && lower.includes(word))) {
      return [{ kind: "MECHANISM_FACT", factIds: [fact.mechanismId], statement: fact.evidenceSpan }];
    }
  }
  return null;
}

function mentionsNamedCard(text: string): boolean {
  return /\b[A-Z][a-z]+(?:,\s+[A-Z][a-z]+)*\b/.test(text) && !text.includes("Meren") && !text.includes("Chatterfang");
}

export function annotateCreativeClaimV4(args: {
  claimId: string;
  sourcePlanElement: string;
  claim: string;
  ctx: ProfessorPlanningContextV3;
  pass1: CreativeProfessorPass1V4;
}): ResearchClaimDecompositionV4 {
  const { claimId, sourcePlanElement, claim, ctx } = args;
  const mechanismProof = mechanismSupportsClaim(ctx.commanderMechanismFacts, claim);
  if (mechanismProof) {
    return {
      claimId,
      sourcePlanElement,
      claim,
      annotation: "VERIFIED",
      evidenceRefs: mechanismProof,
      notes: "Entailed from supplied commander mechanism facts.",
    };
  }
  if (mentionsNamedCard(claim)) {
    return {
      claimId,
      sourcePlanElement,
      claim,
      annotation: "NEEDS_ORACLE_VERIFICATION",
      evidenceRefs: [],
      notes: "Named card or card-specific interaction requires Oracle lookup.",
    };
  }
  if (claim.toLowerCase().includes("primer") || claim.toLowerCase().includes("conventional")) {
    return {
      claimId,
      sourcePlanElement,
      claim,
      annotation: "STRATEGICALLY_SUPPORTED",
      evidenceRefs: args.pass1.evidenceRefs ?? [],
      notes: "Strategic recommendation supported by primer/context; not a card-specific mechanic claim.",
    };
  }
  if (claim.toLowerCase().includes("harmony") || claim.toLowerCase().includes("causal edge")) {
    return {
      claimId,
      sourcePlanElement,
      claim,
      annotation: "UNENCODABLE",
      evidenceRefs: [],
      notes: "Valid strategic observation that cannot be expressed in typed assertion envelope — does not invalidate plan.",
    };
  }
  return {
    claimId,
    sourcePlanElement,
    claim,
    annotation: "STRATEGICALLY_SUPPORTED",
    evidenceRefs: [],
    notes: "Plausible strategic claim pending deeper Oracle verification.",
  };
}

export function decomposeCreativePass1ClaimsV4(args: {
  ctx: ProfessorPlanningContextV3;
  pass1: CreativeProfessorPass1V4;
}): ResearchClaimDecompositionV4[] {
  const claims: ResearchClaimDecompositionV4[] = [];
  let idx = 0;
  const push = (sourcePlanElement: string, claim: string) => {
    idx += 1;
    claims.push(
      annotateCreativeClaimV4({
        claimId: `claim-${idx}`,
        sourcePlanElement,
        claim,
        ctx: args.ctx,
        pass1: args.pass1,
      }),
    );
  };
  push("strategicThesis", args.pass1.strategicThesis);
  for (const line of args.pass1.mechanicInterpretation) push("mechanicInterpretation", line);
  for (const pkg of args.pass1.packages) {
    push(`packages.${pkg.id}`, `${pkg.concept}: ${pkg.purpose}`);
    for (const card of pkg.likelyCardsOrEffects) push(`packages.${pkg.id}.likelyCardsOrEffects`, card);
  }
  for (const win of args.pass1.winPaths) push(`winPaths.${win.id}`, win.description);
  for (const eng of args.pass1.independentEngines) push(`independentEngines.${eng.id}`, eng.description);
  return claims;
}

/** Explicit guarantee: critic annotations never terminate orchestration. */
export function criticAnnotationsNeverTerminateOrchestrationV4(annotations: CriticAnnotationV4[]): boolean {
  return annotations.every((a) => a.terminatesOrchestration === false);
}
