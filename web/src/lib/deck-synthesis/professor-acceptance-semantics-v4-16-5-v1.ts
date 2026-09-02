/**
 * Professor v4.16.5 — explicit acceptance semantics for structural search planner.
 */
export const PROFESSOR_ACCEPTANCE_SEMANTICS_V4_16_5_V1_VERSION = "professor-acceptance-semantics-v4-16-5-v1";

export type AcceptanceVerdictV4165 = "PASS" | "FAIL" | "PARTIAL" | "NOT_EVALUATED" | "PASS_CORRECT_BLOCK";

export type ProspectiveAcceptanceReportV4165 = {
  version: typeof PROFESSOR_ACCEPTANCE_SEMANTICS_V4_16_5_V1_VERSION;
  canonicalCardTruth: AcceptanceVerdictV4165;
  accessMechanics: AcceptanceVerdictV4165;
  accessQuality: AcceptanceVerdictV4165;
  winMechanics: AcceptanceVerdictV4165;
  opportunityCostLegality: AcceptanceVerdictV4165;
  structuralCompletion: AcceptanceVerdictV4165;
  searchEscalation: AcceptanceVerdictV4165;
  noOpTermination: AcceptanceVerdictV4165;
  manaGating: AcceptanceVerdictV4165;
  realizedPowerTruth: AcceptanceVerdictV4165;
  preFinalCritic: AcceptanceVerdictV4165;
  headProfessor: AcceptanceVerdictV4165;
  refinement: AcceptanceVerdictV4165;
  product: AcceptanceVerdictV4165;
  b4Target: AcceptanceVerdictV4165;
  notes: string[];
};

export function assessProspectiveAcceptanceSemanticsV4165(args: {
  headProfessorExecuted: boolean;
  refinementExecuted: boolean;
  preFinalCriticExecuted?: boolean;
  buildStalled: boolean;
  canonicalTruthResolved: boolean;
  accessMechanicallyVerified: boolean;
  accessReadinessReady: boolean;
  accessTheoryUnrealized: boolean;
  winMechanicallyVerified: boolean;
  winCorrectlyBlocked: boolean;
  opportunityCostLegal: boolean;
  structuralComplete: boolean;
  searchEscalationGenuine: boolean;
  noOpTerminationEnforced: boolean;
  manaGatingEnforced: boolean;
  realizedPowerTruthPass: boolean;
  productComplete: boolean;
}): ProspectiveAcceptanceReportV4165 {
  const notes: string[] = [];
  let accessQuality: AcceptanceVerdictV4165 = "NOT_EVALUATED";
  if (args.accessTheoryUnrealized) {
    accessQuality = "FAIL";
    notes.push("ACCESS: THEORY_UNREALIZED — CORE packages not in deck");
  } else if (!args.accessReadinessReady) {
    accessQuality = "PARTIAL";
    notes.push("ACCESS: NOT_READY — no realized critical targets");
  } else if (args.accessMechanicallyVerified) {
    accessQuality = "PASS";
  } else {
    accessQuality = "FAIL";
  }

  let searchEscalation: AcceptanceVerdictV4165 = "NOT_EVALUATED";
  if (args.buildStalled) {
    searchEscalation = args.searchEscalationGenuine ? "PASS" : "FAIL";
    if (!args.searchEscalationGenuine) notes.push("SEARCH_ESCALATION: tier incremented without domain/query change");
  }

  let noOpTermination: AcceptanceVerdictV4165 = "NOT_EVALUATED";
  if (args.buildStalled) {
    noOpTermination = args.noOpTerminationEnforced ? "PASS" : "FAIL";
    if (!args.noOpTerminationEnforced) notes.push("NO_OP_TERMINATION: 100+ identical passes allowed");
  }

  let manaGating: AcceptanceVerdictV4165 = "NOT_EVALUATED";
  if (args.buildStalled && !args.structuralComplete) {
    manaGating = args.manaGatingEnforced ? "PASS" : "FAIL";
    if (!args.manaGatingEnforced) notes.push("MANA_GATING: RUN_MANA_BASE attempted while structurally incomplete");
  }

  const product: AcceptanceVerdictV4165 = args.productComplete ? "PASS" : "FAIL";
  const b4Target: AcceptanceVerdictV4165 = args.productComplete && args.realizedPowerTruthPass ? "PASS" : "FAIL";
  const preFinalCritic: AcceptanceVerdictV4165 = args.preFinalCriticExecuted ? "PASS" : "NOT_EVALUATED";

  return {
    version: PROFESSOR_ACCEPTANCE_SEMANTICS_V4_16_5_V1_VERSION,
    canonicalCardTruth: args.canonicalTruthResolved ? "PASS" : "FAIL",
    accessMechanics: args.accessMechanicallyVerified ? "PASS" : "FAIL",
    accessQuality,
    winMechanics: args.winCorrectlyBlocked ? "PASS_CORRECT_BLOCK" : args.winMechanicallyVerified ? "PASS" : "FAIL",
    opportunityCostLegality: args.opportunityCostLegal ? "PASS" : "FAIL",
    structuralCompletion: args.structuralComplete ? "PASS" : args.buildStalled ? "FAIL" : "NOT_EVALUATED",
    searchEscalation,
    noOpTermination,
    manaGating,
    realizedPowerTruth: args.realizedPowerTruthPass ? "PASS" : "NOT_EVALUATED",
    preFinalCritic,
    headProfessor: args.headProfessorExecuted ? "PASS" : "NOT_EVALUATED",
    refinement: args.refinementExecuted ? "PASS" : "NOT_EVALUATED",
    product,
    b4Target,
    notes,
  };
}
