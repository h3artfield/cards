/**
 * Phase 6A.1 — Generic effective-spec Oracle audit + contaminated template detection.
 * Extends P11 v2 per-case auditors with population-wide rules.
 */
import type { RetrievalSpecification } from "../../src/lib/deck-synthesis/archetype-discovery-types-v1";
import {
  auditEffectiveSpecV2,
  collectScalarFields,
  SPEC_FIELD_KEYS,
  type AuditVerdict,
  type CaseAuditClassification,
  type FieldAuditV2,
} from "./phase6a1-p11-residual-spec-audit-rules-v2";

export const EFFECTIVE_SPEC_ORACLE_AUDIT_V1_VERSION = "phase6a1-effective-spec-oracle-audit-v1";

export type ContaminationTemplateId =
  | "MANA_GENERATION_DRAW_ENGINE_DIRECTION"
  | "ETB_TRIGGER_DRAW_ENGINE_DIRECTION"
  | "GENERIC_RAMP_WITHOUT_ORACLE"
  | "GENERIC_MANA_PRODUCTION_WITHOUT_ORACLE"
  | "GENERIC_LIFE_LOSS_WITHOUT_ORACLE"
  | "ETB_PERMANENTS_WITHOUT_ORACLE"
  | "COMBAT_MANIPULATION_WITHOUT_ORACLE";

export type ContaminationTemplateHit = {
  templateId: ContaminationTemplateId;
  caseId: string;
  field: string;
  value: string;
  oracleEvidence: string;
};

type OracleContext = {
  caseId: string;
  oracleTexts: Array<{ name: string; oracleText: string }>;
  oracleBlob: string;
};

function ctx(input: { caseId: string; oracleTexts: Array<{ name: string; oracleText: string }> }): OracleContext {
  return {
    caseId: input.caseId,
    oracleTexts: input.oracleTexts,
    oracleBlob: input.oracleTexts.map((t) => t.oracleText).join("\n").toLowerCase(),
  };
}

function pass(field: string, value: string, causalDefense: string, oracleEvidence: string): FieldAuditV2 {
  return { field, value, verdict: "DEFENSIBLE", causalDefense, oracleEvidence };
}

function fail(
  field: string,
  value: string,
  verdict: Exclude<AuditVerdict, "DEFENSIBLE">,
  causalDefense: string,
  oracleEvidence: string,
): FieldAuditV2 {
  return { field, value, verdict, causalDefense, oracleEvidence };
}

function oracleMentionsManaProduction(o: OracleContext): boolean {
  return (
    /add \{[^}]+\}/.test(o.oracleBlob) ||
    /add .* mana/.test(o.oracleBlob) ||
    /create .* treasure token/.test(o.oracleBlob) ||
    /search your library for .* land/.test(o.oracleBlob)
  );
}

function oracleMentionsLifeLoss(o: OracleContext): boolean {
  return /loses? .* life|pay .* life|each opponent loses/.test(o.oracleBlob);
}

function oracleMentionsEtb(o: OracleContext): boolean {
  return /when(?:ever)? .* enters(?: the battlefield)?[,.\s]/i.test(o.oracleBlob);
}

function oracleMentionsCombatManipulation(o: OracleContext): boolean {
  return /can't block|must block|can't be blocked|fight target|battles? with/.test(o.oracleBlob);
}

function oracleMentionsSacrifice(o: OracleContext): boolean {
  return /sacrifice/.test(o.oracleBlob);
}

function auditDirectionTemplates(direction: string, o: OracleContext): FieldAuditV2[] {
  const hits: FieldAuditV2[] = [];
  if (/MANA_GENERATION.*DRAW_ENGINE|MANA_GENERATION → DRAW_ENGINE/i.test(direction)) {
    hits.push(
      fail(
        "mechanicalDirection",
        direction,
        "UNSUPPORTED",
        "MANA_GENERATION → DRAW_ENGINE template is not commander-derived unless Oracle establishes mana production engine.",
        oracleMentionsManaProduction(o) ? o.oracleBlob.slice(0, 120) : "No mana-production oracle anchor.",
      ),
    );
  }
  if (/ETB_TRIGGER.*DRAW_ENGINE|ETB_TRIGGER → DRAW_ENGINE/i.test(direction)) {
    hits.push(
      fail(
        "mechanicalDirection",
        direction,
        "UNSUPPORTED",
        "ETB_TRIGGER → DRAW_ENGINE template requires ETB draw engine in commander Oracle.",
        oracleMentionsEtb(o) ? o.oracleBlob.slice(0, 120) : "No ETB oracle anchor.",
      ),
    );
  }
  return hits;
}

function auditGenericField(field: string, value: string, o: OracleContext): FieldAuditV2 {
  if (field === "requiredFunctions" && value === "ramp") {
    return oracleMentionsManaProduction(o)
      ? pass(field, value, "Commander Oracle references mana production.", o.oracleBlob.slice(0, 120))
      : fail(field, value, "UNSUPPORTED", "Generic ramp without commander-derived mana production.", "No mana production in Oracle.");
  }
  if (field === "desiredFunctions" && value === "mana_generation") {
    return oracleMentionsManaProduction(o)
      ? pass(field, value, "Indirect mana support plausibly linked.", o.oracleBlob.slice(0, 120))
      : fail(field, value, "UNSUPPORTED", "Generic mana_generation without oracle causal link.", "No mana production in Oracle.");
  }
  if (field === "desiredFunctions" && value === "life_loss") {
    return oracleMentionsLifeLoss(o)
      ? pass(field, value, "Life loss referenced in commander Oracle.", o.oracleBlob.slice(0, 120))
      : fail(field, value, "UNSUPPORTED", "Generic life_loss without oracle causal link.", "No life loss in Oracle.");
  }
  if (field === "resourcesToProduce" && value === "mana") {
    return oracleMentionsManaProduction(o)
      ? pass(field, value, "Commander produces or references mana.", o.oracleBlob.slice(0, 120))
      : fail(field, value, "UNSUPPORTED", "resourcesToProduce:mana without commander oracle anchor.", "No mana production in Oracle.");
  }
  if (field === "requiredInputs" && value === "etb_permanents") {
    return oracleMentionsEtb(o)
      ? pass(field, value, "Commander references ETB triggers.", o.oracleBlob.slice(0, 120))
      : fail(field, value, "UNSUPPORTED", "Generic etb_permanents without commander ETB engine.", "No ETB trigger in Oracle.");
  }
  if (field === "requiredFunctions" && value === "combat_manipulation") {
    return oracleMentionsCombatManipulation(o)
      ? pass(field, value, "Combat manipulation referenced in Oracle.", o.oracleBlob.slice(0, 120))
      : fail(field, value, "UNSUPPORTED", "combat_manipulation without oracle anchor.", "No combat manipulation in Oracle.");
  }
  if (field.startsWith("desiredFunctions")) {
    return pass(
      field,
      value,
      "Optional indirect support — generic audit does not reject without contradiction.",
      "Not directly required; retained unless contamination template matches.",
    );
  }
  return pass(
    field,
    value,
    "No population-wide contamination rule triggered; field retained pending case-specific audit.",
    o.oracleBlob.slice(0, 80),
  );
}

function classifyCase(fieldAudits: FieldAuditV2[]): CaseAuditClassification {
  if (fieldAudits.some((f) => f.verdict === "UNSUPPORTED" || f.verdict === "INTERNAL_CONFLICT")) {
    return "RESIDUAL_CONTAMINATION";
  }
  if (fieldAudits.some((f) => f.verdict === "AMBIGUOUS_REQUIRES_REVIEW")) {
    return "AMBIGUOUS_REQUIRES_REVIEW";
  }
  return "CONFIRMED_CORRECTED_SPEC";
}

const P11_AUDITED_CASE_IDS = new Set([
  "single-aristocrats-teysa",
  "blindv5-23-triggered-engine",
  "blindv5-42-resource-conversion",
  "blindv5-44-unusual-zones",
  "blindv5-25-activated-engine",
  "blindv5-51-tokens",
  "blindv5-16-commander-background",
  "blindv5-53-counters",
]);

export function detectContaminationTemplates(input: {
  caseId: string;
  effectiveSpec: RetrievalSpecification;
  effectiveMechanicalDirection: string;
  oracleTexts: Array<{ name: string; oracleText: string }>;
}): ContaminationTemplateHit[] {
  const o = ctx(input);
  const hits: ContaminationTemplateHit[] = [];

  if (/MANA_GENERATION.*DRAW_ENGINE|MANA_GENERATION → DRAW_ENGINE/i.test(input.effectiveMechanicalDirection)) {
    if (!oracleMentionsManaProduction(o)) {
      hits.push({
        templateId: "MANA_GENERATION_DRAW_ENGINE_DIRECTION",
        caseId: input.caseId,
        field: "mechanicalDirection",
        value: input.effectiveMechanicalDirection,
        oracleEvidence: "Direction uses mana-generation draw template without mana oracle anchor.",
      });
    }
  }
  if (/ETB_TRIGGER.*DRAW_ENGINE|ETB_TRIGGER → DRAW_ENGINE/i.test(input.effectiveMechanicalDirection)) {
    if (!oracleMentionsEtb(o) || (input.caseId === "multi-korvold" && oracleMentionsSacrifice(o))) {
      hits.push({
        templateId: "ETB_TRIGGER_DRAW_ENGINE_DIRECTION",
        caseId: input.caseId,
        field: "mechanicalDirection",
        value: input.effectiveMechanicalDirection,
        oracleEvidence:
          input.caseId === "multi-korvold"
            ? "Korvold causal engine is sacrifice → counters + draw, not ETB."
            : "Direction uses ETB draw template without ETB oracle anchor.",
      });
    }
  }

  for (const { field, value } of collectScalarFields(input.effectiveSpec)) {
    if (field === "requiredFunctions" && value === "ramp" && !oracleMentionsManaProduction(o)) {
      hits.push({
        templateId: "GENERIC_RAMP_WITHOUT_ORACLE",
        caseId: input.caseId,
        field,
        value,
        oracleEvidence: "requiredFunctions:ramp without commander mana production.",
      });
    }
    if (
      (field === "desiredFunctions" && value === "mana_generation") ||
      (field === "resourcesToProduce" && value === "mana")
    ) {
      if (!oracleMentionsManaProduction(o)) {
        hits.push({
          templateId:
            field === "resourcesToProduce"
              ? "GENERIC_MANA_PRODUCTION_WITHOUT_ORACLE"
              : "GENERIC_MANA_PRODUCTION_WITHOUT_ORACLE",
          caseId: input.caseId,
          field,
          value,
          oracleEvidence: `${field}:${value} without commander mana production.`,
        });
      }
    }
    if (field === "desiredFunctions" && value === "life_loss" && !oracleMentionsLifeLoss(o)) {
      hits.push({
        templateId: "GENERIC_LIFE_LOSS_WITHOUT_ORACLE",
        caseId: input.caseId,
        field,
        value,
        oracleEvidence: "desiredFunctions:life_loss without commander life-loss anchor.",
      });
    }
    if (field === "requiredInputs" && value === "etb_permanents" && !oracleMentionsEtb(o)) {
      hits.push({
        templateId: "ETB_PERMANENTS_WITHOUT_ORACLE",
        caseId: input.caseId,
        field,
        value,
        oracleEvidence: "requiredInputs:etb_permanents without ETB oracle anchor.",
      });
    }
    if (field === "requiredFunctions" && value === "combat_manipulation" && !oracleMentionsCombatManipulation(o)) {
      hits.push({
        templateId: "COMBAT_MANIPULATION_WITHOUT_ORACLE",
        caseId: input.caseId,
        field,
        value,
        oracleEvidence: "requiredFunctions:combat_manipulation without oracle anchor.",
      });
    }
  }

  return hits;
}

export function auditEffectiveSpecUniversal(input: {
  caseId: string;
  effectiveSpec: RetrievalSpecification;
  effectiveMechanicalDirection: string;
  oracleTexts: Array<{ name: string; oracleText: string }>;
}): {
  auditMethod: "P11_CASE_SPECIFIC_V2" | "GENERIC_POPULATION_V1";
  fieldAudits: FieldAuditV2[];
  caseClassification: CaseAuditClassification;
  remainingIssues: FieldAuditV2[];
  contaminationTemplates: ContaminationTemplateHit[];
} {
  const contaminationTemplates = detectContaminationTemplates(input);

  if (P11_AUDITED_CASE_IDS.has(input.caseId)) {
    const audit = auditEffectiveSpecV2(input);
    return { auditMethod: "P11_CASE_SPECIFIC_V2", contaminationTemplates, ...audit };
  }

  const o = ctx(input);
  const scalarAudits = collectScalarFields(input.effectiveSpec).map(({ field, value }) =>
    auditGenericField(field, value, o),
  );
  const directionAudits = auditDirectionTemplates(input.effectiveMechanicalDirection, o);
  const fieldAudits = [...scalarAudits, ...directionAudits];
  const remainingIssues = fieldAudits.filter((f) => f.verdict !== "DEFENSIBLE");

  return {
    auditMethod: "GENERIC_POPULATION_V1",
    fieldAudits,
    caseClassification: classifyCase(fieldAudits),
    remainingIssues,
    contaminationTemplates,
  };
}

export { SPEC_FIELD_KEYS, collectScalarFields, type FieldAuditV2, type CaseAuditClassification };
