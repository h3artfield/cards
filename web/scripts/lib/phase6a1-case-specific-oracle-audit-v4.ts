/**
 * Phase 6A.1 — Gate C v4: commander mechanism + CandidateIntent causality certification.
 */
import type { RetrievalSpecification } from "../../src/lib/deck-synthesis/archetype-discovery-types-v1";
import {
  auditCaseFieldRoleGateC,
  type CaseOracleAuditV3,
} from "./phase6a1-case-specific-oracle-audit-v3";
import {
  getCandidateIntentProfile,
  getReviewPopulationCaseIds,
} from "./phase6a1-candidate-intent-adjudication-v1";
import type { CandidateIntent } from "./phase6a1-candidate-intent-types-v1";

export const CASE_SPECIFIC_ORACLE_AUDIT_V4_VERSION = "phase6a1-case-specific-oracle-audit-v4";

export type CandidateIntentGateCAudit = {
  intentId: string;
  priority: CandidateIntent["priority"];
  causalRole: CandidateIntent["causalRole"];
  linkedSpecField: string;
  fieldNameDerivedOnly: boolean;
  commanderOutputMisclassified: boolean;
  causalDefensePresent: boolean;
  pass: boolean;
  failures: string[];
};

export type CaseCandidateIntentGateC = {
  caseId: string;
  fieldRoleAudit: CaseOracleAuditV3;
  coreIntentAudits: CandidateIntentGateCAudit[];
  noCoreDeclaration?: {
    declaration: "NO_CORE_CANDIDATE_INTENT";
    causalJustification: string;
    pass: boolean;
  };
  gateCPass: boolean;
  gateCFailures: string[];
};

const COMMANDER_OUTPUT_MECHANICS = [
  "token copy",
  "create a token",
  "create X",
  "becomes a copy",
  "search your library for up to two basic land",
  "return target creature card from your graveyard",
  "put target creature card from your graveyard on top",
  "look at the top five cards",
];

function isCommanderOutputMisclassified(intent: CandidateIntent, oracleBlob: string): boolean {
  const blob = oracleBlob.toLowerCase();
  const defense = intent.causalDefense.toLowerCase();
  if (intent.causalRole === "RESOURCE_PROVIDER" || intent.causalRole === "ENGINE_ENABLER") {
    if (intent.linkedSpecField.includes("token_generation") && blob.includes("create a token")) {
      return defense.includes("commander output") === false && defense.includes("commander provides") === false;
    }
  }
  if (
    intent.intentId.includes("token") &&
    intent.linkedSpecField.startsWith("requiredFunctions:token_generation") &&
    blob.includes("create a token") &&
    !defense.includes("deck supplies")
  ) {
    return true;
  }
  return false;
}

export function auditCaseCandidateIntentGateC(input: {
  caseId: string;
  effectiveSpec: RetrievalSpecification;
  effectiveMechanicalDirection: string;
  oracleTexts: Array<{ name: string; oracleText: string }>;
  preCorrectionSpec?: RetrievalSpecification;
}): CaseCandidateIntentGateC {
  const oracleBlob = input.oracleTexts.map((t) => t.oracleText).join("\n").toLowerCase();
  const fieldRoleAudit = auditCaseFieldRoleGateC(input);
  const profile = getCandidateIntentProfile(input.caseId);
  const gateCFailures = [...fieldRoleAudit.gateCFailures];
  const coreIntentAudits: CandidateIntentGateCAudit[] = [];

  if (!profile) {
    gateCFailures.push("missing CandidateIntent profile");
    return {
      caseId: input.caseId,
      fieldRoleAudit,
      coreIntentAudits,
      gateCPass: false,
      gateCFailures,
    };
  }

  if (profile.coreIntents.length === 0) {
    if (!profile.noCoreDeclaration) {
      gateCFailures.push("zero CORE intents without NO_CORE_CANDIDATE_INTENT declaration");
    } else if (!profile.noCoreDeclaration.causalJustification.trim()) {
      gateCFailures.push("NO_CORE_CANDIDATE_INTENT missing causal justification");
    }
  }

  for (const intent of profile.coreIntents) {
    const failures: string[] = [];
    const fieldNameDerivedOnly =
      intent.linkedSpecField.startsWith("requiredFunctions:") &&
      intent.sourceSemanticFields.every((f) => f.startsWith("requiredFunctions:"));

    if (!intent.causalDefense.trim()) failures.push("missing causalDefense");
    if (!intent.commanderMechanismSupported.trim()) failures.push("missing commanderMechanismSupported");
    if (intent.sourceSemanticFields.length === 0) failures.push("missing sourceSemanticFields");

    const commanderOutputMisclassified = isCommanderOutputMisclassified(intent, oracleBlob);
    if (commanderOutputMisclassified) {
      failures.push("commander output misclassified as deck CORE intent");
    }

    for (const phrase of COMMANDER_OUTPUT_MECHANICS) {
      if (
        intent.targetMechanic.toLowerCase().includes(phrase) &&
        oracleBlob.includes(phrase) &&
        intent.causalRole !== "PAYOFF_FOR_COMMANDER_OUTPUT" &&
        intent.causalRole !== "REDUNDANCY"
      ) {
        failures.push(`targetMechanic mirrors commander oracle: ${phrase}`);
      }
    }

    if (failures.length > 0) gateCFailures.push(`${intent.intentId}: ${failures.join("; ")}`);

    coreIntentAudits.push({
      intentId: intent.intentId,
      priority: intent.priority,
      causalRole: intent.causalRole,
      linkedSpecField: intent.linkedSpecField,
      fieldNameDerivedOnly,
      commanderOutputMisclassified,
      causalDefensePresent: Boolean(intent.causalDefense.trim()),
      pass: failures.length === 0,
      failures,
    });
  }

  const noCoreDeclaration = profile.noCoreDeclaration
    ? {
        declaration: profile.noCoreDeclaration.declaration,
        causalJustification: profile.noCoreDeclaration.causalJustification,
        pass: Boolean(profile.noCoreDeclaration.causalJustification.trim()),
      }
    : undefined;

  return {
    caseId: input.caseId,
    fieldRoleAudit,
    coreIntentAudits,
    noCoreDeclaration,
    gateCPass: gateCFailures.length === 0,
    gateCFailures,
  };
}

export function summarizeCandidateIntentGateC(audits: CaseCandidateIntentGateC[]): {
  pass: boolean;
  auditedCases: number;
  expectedCases: number;
  passingCases: number;
  failingCases: string[];
  coreIntentCount: number;
  noCoreCaseCount: number;
  casesMissingProfile: string[];
  populationCoveragePass: boolean;
} {
  const expected = new Set(getReviewPopulationCaseIds());
  const audited = new Set(audits.map((a) => a.caseId));
  const missing = [...expected].filter((id) => !audited.has(id));
  const failingCases = audits.filter((a) => !a.gateCPass).map((a) => `${a.caseId}: ${a.gateCFailures.join("; ")}`);

  return {
    pass: failingCases.length === 0 && missing.length === 0,
    auditedCases: audits.length,
    expectedCases: expected.size,
    passingCases: audits.filter((a) => a.gateCPass).length,
    failingCases,
    coreIntentCount: audits.reduce((n, a) => n + a.coreIntentAudits.length, 0),
    noCoreCaseCount: audits.filter((a) => a.noCoreDeclaration).length,
    casesMissingProfile: missing,
    populationCoveragePass: missing.length === 0 && audits.length === expected.size,
  };
}
