/**
 * Research Professor v4 — offline mechanical interrogation, semantic discovery, pass-3 gate.
 */
import type { ProfessorPlanningContextV3 } from "../../src/lib/deck-synthesis/professor-planning-contracts-v3";
import type { CreativeProfessorPass1V4 } from "../../src/lib/deck-synthesis/professor-creative-pass1-contracts-v4";
import {
  PROFESSOR_RESEARCH_CONTRACTS_V4_VERSION,
  type ResearchChallengeMenuItemV4,
  type ResearchProblemV4,
  type ResearchProfessorOutputV4,
  type ResearchSemanticDiscoveryV4,
} from "../../src/lib/deck-synthesis/professor-research-contracts-v4";
import { decomposeCreativePass1ClaimsV4 } from "../../src/lib/deck-synthesis/professor-v4-critic-v1";
import { applyPass3GateToResearchOutputV4 } from "../../src/lib/deck-synthesis/professor-v4-pass3-gate-v1";
import {
  runAllSemanticResearchPrimitivesV4,
  type SemanticResearchPrimitiveResultV4,
} from "../../src/lib/deck-synthesis/professor-semantic-research-primitives-v4";
import type { ProfessorV4CostTelemetryV1 } from "../../src/lib/deck-synthesis/professor-v4-cost-telemetry-v1";

export const PROFESSOR_V4_RESEARCH_PROFESSOR_V1_VERSION = "phase6a1-professor-v4-research-professor-v1";

function planTextBlob(pass1: CreativeProfessorPass1V4): string {
  return JSON.stringify(pass1).toLowerCase();
}

function estimateNovelty(args: {
  pass1: CreativeProfessorPass1V4;
  primitive: SemanticResearchPrimitiveResultV4;
}): ResearchSemanticDiscoveryV4["noveltyEstimate"] {
  const blob = planTextBlob(args.pass1);
  if (args.primitive.primitive === "TOKEN_CREATION_CROSS_RESOURCE") {
    const mentionsCross = ["treasure", "clue", "food", "artifact token", "noncreature"].some((k) => blob.includes(k));
    return mentionsCross ? "MODERATE" : "HIGH";
  }
  if (args.primitive.primitive === "DEATH_ETB_RESET_LOOPS") {
    return blob.includes("recur") || blob.includes("experience") ? "CONVENTIONAL" : "MODERATE";
  }
  if (args.primitive.primitive === "QUANTITY_SCALING_NONLINEAR_PAYOFFS") {
    return blob.includes("sacrifice") && blob.includes("scale") ? "CONVENTIONAL" : "MODERATE";
  }
  return "MODERATE";
}

function primitiveToDiscovery(args: {
  pass1: CreativeProfessorPass1V4;
  primitive: SemanticResearchPrimitiveResultV4;
  index: number;
}): ResearchSemanticDiscoveryV4 {
  const noveltyEstimate = estimateNovelty({ pass1: args.pass1, primitive: args.primitive });
  const whyItMatters =
    args.primitive.primitive === "TOKEN_CREATION_CROSS_RESOURCE"
      ? "One token creation event can produce two resource classes (original token type plus added creature tokens), intersecting artifact/value engines with sacrifice engines."
      : args.primitive.mechanicalBasis;
  return {
    discoveryId: `discovery-${args.index + 1}`,
    mechanicalPattern: `${args.primitive.primitive}:${args.primitive.producerStateOrEvent}`,
    candidates: args.primitive.candidates,
    whyItMatters,
    evidenceRefs: args.primitive.evidenceRefs,
    noveltyEstimate,
  };
}

function buildChallengeMenu(discoveries: ResearchSemanticDiscoveryV4[]): ResearchChallengeMenuItemV4[] {
  return discoveries
    .filter((d) => d.noveltyEstimate !== "CONVENTIONAL")
    .slice(0, 3)
    .map((d) => ({
      direction: d.mechanicalPattern.split(":")[1] ?? d.mechanicalPattern,
      mechanicalBasis: d.whyItMatters,
      whyItMayImprovePlan: `Explore ${d.candidates[0] ?? "candidate engines"} for a less conventional deck identity.`,
    }));
}

function buildProblems(args: {
  pass1: CreativeProfessorPass1V4;
  claimDecomposition: ResearchProfessorOutputV4["claimDecomposition"];
}): ResearchProblemV4[] {
  const problems: ResearchProblemV4[] = [];
  for (const claim of args.claimDecomposition) {
    if (claim.annotation === "INCORRECT") {
      problems.push({
        severity: "HIGH",
        type: "MECHANICAL_INVALIDITY",
        description: claim.claim,
        affectedPlanElements: [claim.sourcePlanElement],
      });
    }
    if (claim.annotation === "NEEDS_ORACLE_VERIFICATION") {
      problems.push({
        severity: "LOW",
        type: "NEEDS_ORACLE",
        description: claim.claim,
        affectedPlanElements: [claim.sourcePlanElement],
      });
    }
  }
  if (args.pass1.openQuestions.some((q) => q.toLowerCase().includes("noncreature"))) {
    problems.push({
      severity: "LOW",
      type: "OPEN_RESEARCH_QUESTION",
      description: "Creative plan already asks about noncreature token cross — research should answer without forcing another expensive call unless novel.",
      affectedPlanElements: ["openQuestions"],
    });
  }
  return problems;
}

export type ResearchProfessorRunResultV1 = {
  output: ResearchProfessorOutputV4;
  semanticPrimitiveResults: SemanticResearchPrimitiveResultV4[];
  telemetryDelta: Partial<Omit<ProfessorV4CostTelemetryV1, "version">>;
};

export function runResearchProfessorOfflineV1(args: {
  ctx: ProfessorPlanningContextV3;
  pass1: CreativeProfessorPass1V4;
}): ResearchProfessorRunResultV1 {
  const claimDecomposition = decomposeCreativePass1ClaimsV4({ ctx: args.ctx, pass1: args.pass1 });
  const semanticPrimitiveResults = runAllSemanticResearchPrimitivesV4(args.ctx);
  const semanticDiscoveries = semanticPrimitiveResults.map((primitive, index) =>
    primitiveToDiscovery({ pass1: args.pass1, primitive, index }),
  );
  const challengeMenu = buildChallengeMenu(semanticDiscoveries);
  const problems = buildProblems({ pass1: args.pass1, claimDecomposition });

  const partial = {
    version: PROFESSOR_RESEARCH_CONTRACTS_V4_VERSION,
    claimDecomposition,
    semanticDiscoveries,
    problems,
    challengeMenu,
    pass1: args.pass1,
  };
  const output = applyPass3GateToResearchOutputV4(partial);

  return {
    output,
    semanticPrimitiveResults,
    telemetryDelta: {
      researchModelCalls: 0,
      semanticSearchCalls: semanticPrimitiveResults.length,
      oracleLookups: claimDecomposition.filter((c) => c.annotation === "NEEDS_ORACLE_VERIFICATION").length,
      ragSearches: 0,
    },
  };
}
