/**
 * Professor v4.16.4 — explicit acceptance semantics for subsystem evaluation.
 */
export const PROFESSOR_ACCEPTANCE_SEMANTICS_V4_16_4_V1_VERSION = "professor-acceptance-semantics-v4-16-4-v1";

export type AcceptanceVerdictV4164 = "PASS" | "FAIL" | "PARTIAL" | "NOT_EVALUATED";

export type ProspectiveAcceptanceReportV4164 = {
  version: typeof PROFESSOR_ACCEPTANCE_SEMANTICS_V4_16_4_V1_VERSION;
  headProfessor: AcceptanceVerdictV4164;
  refinement: AcceptanceVerdictV4164;
  constructionVsRescue: AcceptanceVerdictV4164;
  accessArchitecture: AcceptanceVerdictV4164;
  opportunityCost: AcceptanceVerdictV4164;
  winArchitecture: AcceptanceVerdictV4164;
  structuralCompletion: AcceptanceVerdictV4164;
  canonicalCardTruth: AcceptanceVerdictV4164;
  legalityStateTruth: AcceptanceVerdictV4164;
  notes: string[];
};

export function assessProspectiveAcceptanceSemanticsV4164(args: {
  headProfessorExecuted: boolean;
  refinementExecuted: boolean;
  buildStalled: boolean;
  accessMechanicallyVerified: boolean;
  opportunityCostLegal: boolean;
  winMechanicallyVerified: boolean;
  structuralResearchTriggered: boolean;
  canonicalTruthResolved: boolean;
  partialDeckLegalSplitCorrect: boolean;
}): ProspectiveAcceptanceReportV4164 {
  const notes: string[] = [];
  const headProfessor: AcceptanceVerdictV4164 = args.headProfessorExecuted ? "PASS" : "NOT_EVALUATED";
  const refinement: AcceptanceVerdictV4164 = args.refinementExecuted ? "PASS" : "NOT_EVALUATED";
  let constructionVsRescue: AcceptanceVerdictV4164 = "NOT_EVALUATED";
  if (args.buildStalled) {
    constructionVsRescue = "NOT_EVALUATED";
    notes.push("CONSTRUCTION_VS_RESCUE: NOT_APPLICABLE_BUILD_STALLED");
  } else if (args.headProfessorExecuted) {
    constructionVsRescue = "PASS";
  }

  if (!args.headProfessorExecuted) notes.push("HEAD_PROFESSOR never executed");
  if (!args.refinementExecuted) notes.push("REFINEMENT never executed");

  return {
    version: PROFESSOR_ACCEPTANCE_SEMANTICS_V4_16_4_V1_VERSION,
    headProfessor,
    refinement,
    constructionVsRescue,
    accessArchitecture: args.accessMechanicallyVerified ? "PASS" : "FAIL",
    opportunityCost: args.opportunityCostLegal ? "PASS" : "FAIL",
    winArchitecture: args.winMechanicallyVerified ? "PASS" : "FAIL",
    structuralCompletion: args.structuralResearchTriggered ? "PASS" : args.buildStalled ? "FAIL" : "NOT_EVALUATED",
    canonicalCardTruth: args.canonicalTruthResolved ? "PASS" : "FAIL",
    legalityStateTruth: args.partialDeckLegalSplitCorrect ? "PASS" : "FAIL",
    notes,
  };
}
