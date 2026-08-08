/**
 * RC3 semantic validator — release-gating unsupported = structurally invalid parse only.
 * Lexical phrase matching is diagnostic-only, never a gate.
 */
import { isPrimitiveActionType, type PrimitiveActionType } from "./oracle-action-taxonomy";
import { segmentCardFaces } from "./oracle-ability-segmentation";
import type { OracleSemanticParse, SemanticAction } from "./oracle-semantic-parse-schema";
import { verifySemanticParseIntegrity } from "./oracle-semantic-integrity";

export type SemanticValidationIssue = {
  code: string;
  message: string;
  actionId?: string;
  severity: "invalid" | "diagnostic";
};

export type SemanticValidationResult = {
  valid: boolean;
  invalidCount: number;
  issues: SemanticValidationIssue[];
  lexicalDiagnostics: SemanticValidationIssue[];
};

const ZONE_TRANSITION_PRIMITIVES = new Set<PrimitiveActionType>([
  "draw",
  "put_into_hand",
  "return_to_hand",
  "put_onto_battlefield",
  "return_to_battlefield",
  "exile",
  "mill",
  "discard",
]);

function requiredArgsFor(actionType: PrimitiveActionType): (keyof SemanticAction["arguments"])[] {
  switch (actionType) {
    case "put_into_hand":
      return ["destinationZone"];
    case "return_to_hand":
      return ["destinationZone"];
    case "draw":
      return ["destinationZone"];
    default:
      return [];
  }
}

function validateActionArguments(action: SemanticAction): SemanticValidationIssue[] {
  const issues: SemanticValidationIssue[] = [];
  if (!isPrimitiveActionType(action.actionType)) {
    issues.push({
      code: "invalid_action_type",
      message: `Unknown actionType ${action.actionType}`,
      actionId: action.actionId,
      severity: "invalid",
    });
    return issues;
  }
  const required = requiredArgsFor(action.actionType);
  for (const key of required) {
    const val = action.arguments[key as keyof typeof action.arguments];
    if (val === undefined || (Array.isArray(val) && val.length === 0)) {
      issues.push({
        code: "missing_required_argument",
        message: `${action.actionType} missing required argument ${String(key)}`,
        actionId: action.actionId,
        severity: "invalid",
      });
    }
  }
  if (action.actionType === "put_into_hand") {
    const dest = action.arguments.destinationZone;
    if (dest && !dest.includes("hand")) {
      issues.push({
        code: "put_into_hand_wrong_destination",
        message: "put_into_hand requires destinationZone hand",
        actionId: action.actionId,
        severity: "invalid",
      });
    }
  }
  if (ZONE_TRANSITION_PRIMITIVES.has(action.actionType)) {
    if (!action.arguments.destinationZone?.length && action.actionType === "put_into_hand") {
      issues.push({
        code: "zone_transition_incoherent",
        message: `${action.actionType} missing destination zone`,
        actionId: action.actionId,
        severity: "invalid",
      });
    }
  }
  return issues;
}

/** Optional lexical overlap — diagnostic only, never invalidates. */
export function evidenceSupportConfidence(
  oracleText: string,
  action: SemanticAction,
): { confidence: number; diagnostic?: string } {
  const ev = action.provenance.actionSpan.text.toLowerCase();
  const oracle = oracleText.toLowerCase();
  if (!oracle.includes(ev.slice(0, Math.min(20, ev.length)))) {
    return { confidence: 0.3, diagnostic: "evidence_span_not_found_in_oracle" };
  }
  return { confidence: 0.95 };
}

/** Validate OracleSemanticParse structurally — unsupported gate for RC3. */
export function validateOracleSemanticParse(
  parse: OracleSemanticParse,
  oracleText: string,
): SemanticValidationResult {
  const issues: SemanticValidationIssue[] = [];
  const lexicalDiagnostics: SemanticValidationIssue[] = [];

  const integrity = verifySemanticParseIntegrity(parse, oracleText);
  for (const v of [...integrity.idViolations, ...integrity.provenanceViolations]) {
    issues.push({
      code: v.code,
      message: v.message,
      actionId: v.actionId,
      severity: "invalid",
    });
  }

  const faces = segmentCardFaces(oracleText);
  for (const action of parse.actions) {
    issues.push(...validateActionArguments(action));

    const parent = parse.abilities.find((a) => a.abilityId === action.parentAbilityId);
    if (!parent) {
      issues.push({
        code: "dangling_parent_ability",
        message: `parentAbilityId ${action.parentAbilityId} not found`,
        actionId: action.actionId,
        severity: "invalid",
      });
    }

    if (action.modalOptionId && parent) {
      const opt = parent.options?.find((o) => o.optionId === action.modalOptionId);
      if (!opt) {
        issues.push({
          code: "dangling_modal_option",
          message: `modalOptionId ${action.modalOptionId} not found`,
          actionId: action.actionId,
          severity: "invalid",
        });
      }
    }

    if (action.clauseId && parent && !parent.clauseIds.includes(action.clauseId)) {
      const onOption = parent.options?.some((o) => o.clauseIds.includes(action.clauseId!));
      if (!onOption) {
        issues.push({
          code: "dangling_clause",
          message: `clauseId ${action.clauseId} not on parent ability`,
          actionId: action.actionId,
          severity: "invalid",
        });
      }
    }

    if (action.arguments.referentObjectId) {
      const obj = parse.objects.find((o) => o.objectId === action.arguments.referentObjectId);
      if (!obj) {
        issues.push({
          code: "dangling_referent_object",
          message: `referentObjectId ${action.arguments.referentObjectId} not found`,
          actionId: action.actionId,
          severity: "invalid",
        });
      }
    }

    const span = action.provenance.actionSpan;
    if (span.cardStart < 0 || span.cardEnd > oracleText.length) {
      issues.push({
        code: "provenance_out_of_bounds",
        message: "actionSpan outside oracle text",
        actionId: action.actionId,
        severity: "invalid",
      });
    }

    const face = faces.find((f) => {
      const parentAbility = parse.abilities.find((a) => a.abilityId === action.parentAbilityId);
      return parentAbility?.faceId === f.faceId;
    });
    if (face && (span.cardStart < face.start || span.cardEnd > face.start + face.text.length)) {
      issues.push({
        code: "provenance_face_leakage",
        message: "actionSpan outside face bounds",
        actionId: action.actionId,
        severity: "invalid",
      });
    }

    const lexical = evidenceSupportConfidence(oracleText, action);
    if (lexical.confidence < 0.5 && lexical.diagnostic) {
      lexicalDiagnostics.push({
        code: "lexical_diagnostic",
        message: lexical.diagnostic,
        actionId: action.actionId,
        severity: "diagnostic",
      });
    }
  }

  const invalidCount = issues.filter((i) => i.severity === "invalid").length;
  return {
    valid: invalidCount === 0,
    invalidCount,
    issues,
    lexicalDiagnostics,
  };
}
