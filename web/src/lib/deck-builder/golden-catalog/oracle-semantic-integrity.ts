/**
 * Generic integrity invariants for OracleSemanticParse — ID graph and span containment.
 */
import { segmentCardFaces } from "./oracle-ability-segmentation";
import type { EvidenceSpan, OracleSemanticParse, SemanticAbility } from "./oracle-semantic-parse-schema";

export type SemanticIntegrityViolation = {
  code: string;
  message: string;
  actionId?: string;
  abilityId?: string;
};

function spanContainedIn(outer: EvidenceSpan, inner: EvidenceSpan): boolean {
  return inner.cardStart >= outer.cardStart && inner.cardEnd <= outer.cardEnd;
}

function faceBounds(parse: OracleSemanticParse, oracleText: string, faceId: string) {
  const faces = segmentCardFaces(oracleText);
  const face = faces.find((f) => f.faceId === faceId);
  if (!face) return { start: 0, end: oracleText.length };
  return { start: face.start, end: face.start + face.text.length };
}

function owningSpan(action: OracleSemanticParse["actions"][0], abilities: SemanticAbility[]): EvidenceSpan | undefined {
  if (action.modalOptionId) {
    for (const ability of abilities) {
      const opt = ability.options?.find((o) => o.optionId === action.modalOptionId);
      if (opt) return opt.optionSpan;
    }
  }
  const parent = abilities.find((a) => a.abilityId === action.parentAbilityId);
  return parent?.abilitySpan;
}

function collectClauseIds(abilities: SemanticAbility[]): Set<string> {
  const ids = new Set<string>();
  for (const ability of abilities) {
    for (const clauseId of ability.clauseIds) ids.add(clauseId);
    for (const opt of ability.options ?? []) {
      for (const clauseId of opt.clauseIds) ids.add(clauseId);
    }
  }
  return ids;
}

/** Verify semantic ID graph integrity. */
export function verifySemanticIdIntegrity(parse: OracleSemanticParse): SemanticIntegrityViolation[] {
  const violations: SemanticIntegrityViolation[] = [];
  const abilityIds = new Set(parse.abilities.map((a) => a.abilityId));
  const objectIds = new Set(parse.objects.map((o) => o.objectId));
  const clauseIds = collectClauseIds(parse.abilities);
  const seenActionIds = new Set<string>();
  const seenAbilityIds = new Set<string>();

  for (const ability of parse.abilities) {
    if (seenAbilityIds.has(ability.abilityId)) {
      violations.push({ code: "duplicate_ability_id", message: `Duplicate abilityId ${ability.abilityId}`, abilityId: ability.abilityId });
    }
    seenAbilityIds.add(ability.abilityId);

    const optionIds = new Set<string>();
    for (const opt of ability.options ?? []) {
      if (optionIds.has(opt.optionId)) {
        violations.push({ code: "duplicate_option_id", message: `Duplicate optionId ${opt.optionId}`, abilityId: ability.abilityId });
      }
      optionIds.add(opt.optionId);
      if (!opt.optionId.startsWith(ability.abilityId)) {
        violations.push({
          code: "option_parent_mismatch",
          message: `Option ${opt.optionId} not scoped under ${ability.abilityId}`,
          abilityId: ability.abilityId,
        });
      }
    }
  }

  for (const action of parse.actions) {
    if (seenActionIds.has(action.actionId)) {
      violations.push({ code: "duplicate_action_id", message: `Duplicate actionId ${action.actionId}`, actionId: action.actionId });
    }
    seenActionIds.add(action.actionId);

    if (!abilityIds.has(action.parentAbilityId)) {
      violations.push({
        code: "missing_parent_ability",
        message: `Action ${action.actionId} references missing parentAbilityId ${action.parentAbilityId}`,
        actionId: action.actionId,
      });
    }

    if (action.modalOptionId) {
      const parent = parse.abilities.find((a) => a.abilityId === action.parentAbilityId);
      const opt = parent?.options?.find((o) => o.optionId === action.modalOptionId);
      if (!opt) {
        violations.push({
          code: "missing_modal_option",
          message: `Action ${action.actionId} references missing modalOptionId ${action.modalOptionId}`,
          actionId: action.actionId,
        });
      }
    }

    if (action.clauseId && !clauseIds.has(action.clauseId)) {
      const isSemanticClause = action.clauseId.includes(":clause-");
      if (isSemanticClause) {
        violations.push({
          code: "missing_clause",
          message: `Action ${action.actionId} references missing clauseId ${action.clauseId}`,
          actionId: action.actionId,
        });
      }
    }

    if (action.arguments.referentObjectId && !objectIds.has(action.arguments.referentObjectId)) {
      violations.push({
        code: "missing_referent_object",
        message: `Action ${action.actionId} references missing object ${action.arguments.referentObjectId}`,
        actionId: action.actionId,
      });
    }
  }

  if (!parse.oracleTextHash) {
    violations.push({ code: "missing_oracle_text_hash", message: "oracleTextHash is required on OracleSemanticParse" });
  }

  return violations;
}

/** Verify provenance span containment for accepted semantic actions. */
export function verifyProvenanceContainment(
  parse: OracleSemanticParse,
  oracleText: string,
): SemanticIntegrityViolation[] {
  const violations: SemanticIntegrityViolation[] = [];

  for (const action of parse.actions.filter((a) => a.reviewStatus === "accepted")) {
    const owner = owningSpan(action, parse.abilities);
    const parent = parse.abilities.find((a) => a.abilityId === action.parentAbilityId);
    const faceId = parent?.faceId ?? "front";
    const face = faceBounds(parse, oracleText, faceId);

    const spans = [
      { name: "actionSpan", span: action.provenance.actionSpan },
      { name: "targetSpan", span: action.provenance.targetSpan },
      { name: "quantitySpan", span: action.provenance.quantitySpan },
      { name: "roundingSpan", span: action.provenance.roundingSpan },
    ] as const;

    for (const { name, span } of spans) {
      if (!span) continue;
      if (span.cardStart < face.start || span.cardEnd > face.end) {
        violations.push({
          code: "span_outside_face",
          message: `${name} on action ${action.actionId} outside face ${faceId}`,
          actionId: action.actionId,
        });
      }
      if (owner && !spanContainedIn(owner, span)) {
        violations.push({
          code: "span_outside_owner",
          message: `${name} on action ${action.actionId} not contained in owning ability/option span`,
          actionId: action.actionId,
        });
      }
    }

    if (action.modalOptionId) {
      const parentAbility = parse.abilities.find((a) => a.abilityId === action.parentAbilityId);
      const opt = parentAbility?.options?.find((o) => o.optionId === action.modalOptionId);
      if (opt?.additionalCost?.evidence) {
        const cost = opt.additionalCost.evidence;
        if (!spanContainedIn(opt.optionSpan, cost)) {
          violations.push({
            code: "cost_outside_option",
            message: `Additional cost span on ${action.modalOptionId} not contained in option span`,
            actionId: action.actionId,
          });
        }
      }
    }
  }

  return violations;
}

export function verifySemanticParseIntegrity(parse: OracleSemanticParse, oracleText: string) {
  const idViolations = verifySemanticIdIntegrity(parse);
  const provenanceViolations = verifyProvenanceContainment(parse, oracleText);
  return {
    ok: idViolations.length === 0 && provenanceViolations.length === 0,
    idViolations,
    provenanceViolations,
  };
}

/** Count accepted actions whose evidence span is not contained in the owning ability/option span. */
export function countAcceptedActionOutsideOwnerSpan(parse: OracleSemanticParse): number {
  let count = 0;
  for (const action of parse.actions.filter((a) => a.reviewStatus === "accepted")) {
    const owner = owningSpan(action, parse.abilities);
    const span = action.provenance.actionSpan;
    if (!owner || !spanContainedIn(owner, span)) count++;
  }
  return count;
}
