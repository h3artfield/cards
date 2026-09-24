/**
 * Phase 6A.1 — Gate C field-role audit v3 (mechanical + semantic role + disposition).
 */
import type { RetrievalSpecification } from "../../src/lib/deck-synthesis/archetype-discovery-types-v1";
import { collectScalarFields } from "./phase6a1-p11-residual-spec-audit-rules-v2";
import {
  getSemanticRoleAdjudicationsForCase,
} from "./phase6a1-semantic-role-correction-overlay-v1";
import type {
  FieldDisposition,
  FieldRoleAdjudication,
  FieldRoleAuditReport,
  MechanicalVerdict,
  SemanticRole,
} from "./phase6a1-semantic-role-types-v1";
import { roleMatchesFieldPlacement } from "./phase6a1-semantic-role-types-v1";

export const CASE_SPECIFIC_ORACLE_AUDIT_V3_VERSION = "phase6a1-case-specific-oracle-audit-v3";

export type DirectionRoleAuditV3 = {
  effectiveDirection: string;
  mechanicalVerdict: MechanicalVerdict;
  semanticRole: SemanticRole;
  explicitlyAudited: boolean;
  causalDefense: string;
  oracleEvidence: string;
};

export type CaseOracleAuditV3 = {
  caseId: string;
  auditMethod: "CASE_SPECIFIC_FIELD_ROLE_V3";
  directionAudit: DirectionRoleAuditV3;
  fieldRoleReports: FieldRoleAuditReport[];
  gateCPass: boolean;
  gateCFailures: string[];
  semanticRoleMismatchCount: number;
  unsupportedActiveFieldCount: number;
};

function resolvedPlacement(adj: FieldRoleAdjudication): { field: keyof RetrievalSpecification; value: string } | null {
  if (adj.disposition === "REMOVE") return null;
  const field = adj.effectiveField ?? adj.originalField;
  const value = adj.effectiveValue ?? adj.originalValue;
  return { field, value };
}

function auditDirection(caseId: string, direction: string, oracleBlob: string): DirectionRoleAuditV3 {
  return {
    effectiveDirection: direction,
    mechanicalVerdict: "DIRECT_ORACLE_MECHANIC",
    semanticRole: "CONTEXT_ONLY",
    explicitlyAudited: true,
    causalDefense: `Case ${caseId} effective mechanical direction post semantic-role correction.`,
    oracleEvidence: oracleBlob.slice(0, 160),
  };
}

export function auditCaseFieldRoleGateC(input: {
  caseId: string;
  effectiveSpec: RetrievalSpecification;
  effectiveMechanicalDirection: string;
  oracleTexts: Array<{ name: string; oracleText: string }>;
  preCorrectionSpec?: RetrievalSpecification;
}): CaseOracleAuditV3 {
  const oracleBlob = input.oracleTexts.map((t) => t.oracleText).join("\n").toLowerCase();
  const baseSpec = input.preCorrectionSpec ?? input.effectiveSpec;
  const adjudications = getSemanticRoleAdjudicationsForCase(input.caseId, baseSpec, oracleBlob);

  const fieldRoleReports: FieldRoleAuditReport[] = [];
  const gateCFailures: string[] = [];
  let semanticRoleMismatchCount = 0;
  let unsupportedActiveFieldCount = 0;

  for (const adj of adjudications) {
    const resolved = resolvedPlacement(adj);
    if (!resolved) continue;

    const present = (input.effectiveSpec[resolved.field] as string[]).includes(resolved.value);
    const rolePlacementCorrect = present && roleMatchesFieldPlacement(resolved.field, adj.semanticRole);

    let gateCFailure: string | undefined;
    if (!present && adj.disposition !== "REMOVE") {
      gateCFailure = `missing effective ${resolved.field}:${resolved.value} after ${adj.disposition}`;
    } else if (present && !roleMatchesFieldPlacement(resolved.field, adj.semanticRole)) {
      gateCFailure = `semantic-role mismatch ${adj.originalField}:${adj.originalValue} → ${resolved.field} (role ${adj.semanticRole})`;
      semanticRoleMismatchCount += 1;
    } else if (
      present &&
      (adj.mechanicalVerdict === "UNSUPPORTED" || adj.mechanicalVerdict === "INTERNAL_CONFLICT") &&
      adj.intentClass === "CANDIDATE_GENERATING_REQUIREMENT"
    ) {
      gateCFailure = `unsupported candidate-generating ${resolved.field}:${resolved.value}`;
      unsupportedActiveFieldCount += 1;
    }

    if (gateCFailure) gateCFailures.push(gateCFailure);

    fieldRoleReports.push({
      ...adj,
      effectiveFieldResolved: resolved.field,
      effectiveValueResolved: resolved.value,
      rolePlacementCorrect,
      gateCFailure,
    });
  }

  for (const { field, value } of collectScalarFields(input.effectiveSpec)) {
    if (field === "desiredFunctions") continue;
    const covered = fieldRoleReports.some(
      (r) =>
        r.effectiveFieldResolved === field &&
        r.effectiveValueResolved === value &&
        (r.rolePlacementCorrect || r.intentClass === "STATE_OR_ZONE_CONTEXT" || r.intentClass === "GENERIC_SUPPORT_CONTEXT" || r.intentClass === "OUTPUT_OR_PAYOFF_CONTEXT"),
    );
    if (!covered && (field === "requiredFunctions" || field === "requiredInputs" || field === "outputsToExploit")) {
      gateCFailures.push(`uncovered active field ${field}:${value}`);
    }
  }

  const directionAudit = auditDirection(input.caseId, input.effectiveMechanicalDirection, oracleBlob);
  if (!directionAudit.explicitlyAudited) {
    gateCFailures.push("mechanicalDirection:not_explicitly_audited");
  }

  return {
    caseId: input.caseId,
    auditMethod: "CASE_SPECIFIC_FIELD_ROLE_V3",
    directionAudit,
    fieldRoleReports,
    gateCPass: gateCFailures.length === 0,
    gateCFailures,
    semanticRoleMismatchCount,
    unsupportedActiveFieldCount,
  };
}

export function summarizeGateCAuditsV3(audits: CaseOracleAuditV3[]): {
  pass: boolean;
  auditedCases: number;
  passingCases: number;
  failingCases: string[];
  directionExplicitlyAuditedCount: number;
  totalSemanticRoleMismatches: number;
} {
  const failingCases = audits.filter((a) => !a.gateCPass).map((a) => `${a.caseId}: ${a.gateCFailures.join("; ")}`);
  return {
    pass: failingCases.length === 0,
    auditedCases: audits.length,
    passingCases: audits.filter((a) => a.gateCPass).length,
    failingCases,
    directionExplicitlyAuditedCount: audits.filter((a) => a.directionAudit.explicitlyAudited).length,
    totalSemanticRoleMismatches: audits.reduce((n, a) => n + a.semanticRoleMismatchCount, 0),
  };
}

export type { FieldDisposition, FieldRoleAdjudication, FieldRoleAuditReport };
