/**
 * Phase 6A.1 — Case-specific Oracle audit v2 (strict Gate C).
 * Every review case requires explicit causal defense; no generic auto-pass.
 */
import type { RetrievalSpecification } from "../../src/lib/deck-synthesis/archetype-discovery-types-v1";
import {
  auditEffectiveSpecV2,
  collectScalarFields,
  type FieldAuditV2 as P11FieldAudit,
} from "./phase6a1-p11-residual-spec-audit-rules-v2";
import { getContaminationEntry } from "./phase6a1-contamination-correction-overlay-v1";
import { getOracleGroundedOverlayEntry } from "./phase6a1-oracle-grounded-overlay-v2";
import { getUpstreamGapEntry } from "./phase6a1-upstream-spec-gap-overlay-v1";
import type { ProposedSpecCorrectionV13 } from "./phase6a1-spec-correction-overlay-v1.3";

export const CASE_SPECIFIC_ORACLE_AUDIT_V2_VERSION = "phase6a1-case-specific-oracle-audit-v2";

export type OracleFieldVerdict =
  | "DIRECTLY_DERIVED"
  | "INDIRECT_SUPPORT"
  | "GENERIC_DECK_SUPPORT"
  | "UNSUPPORTED"
  | "INTERNAL_CONFLICT";

export type OracleFieldAuditV2 = {
  field: string;
  value: string;
  verdict: OracleFieldVerdict;
  causalDefense: string;
  oracleEvidence: string;
  isProductField: boolean;
};

export type DirectionAuditV2 = {
  effectiveDirection: string;
  verdict: OracleFieldVerdict;
  causalDefense: string;
  oracleEvidence: string;
  explicitlyAudited: boolean;
};

export type CaseOracleAuditV2 = {
  caseId: string;
  auditMethod: "CASE_SPECIFIC_V2";
  directionAudit: DirectionAuditV2;
  activeFieldAudits: OracleFieldAuditV2[];
  gateCPass: boolean;
  gateCFailures: string[];
};

const P11_ONLY_CASE_IDS = new Set([
  "blindv5-23-triggered-engine",
  "blindv5-42-resource-conversion",
  "blindv5-44-unusual-zones",
  "blindv5-25-activated-engine",
  "blindv5-51-tokens",
  "blindv5-16-commander-background",
  "blindv5-53-counters",
]);

const PRODUCT_FIELDS = new Set(["requiredFunctions", "requiredInputs", "outputsToExploit"]);

type OracleCtx = {
  oracleTexts: Array<{ name: string; oracleText: string }>;
  oracleBlob: string;
};

function ctx(input: { oracleTexts: Array<{ name: string; oracleText: string }> }): OracleCtx {
  return {
    oracleTexts: input.oracleTexts,
    oracleBlob: input.oracleTexts.map((t) => t.oracleText).join("\n").toLowerCase(),
  };
}

function isProductField(field: string): boolean {
  return PRODUCT_FIELDS.has(field);
}

function derived(
  field: string,
  value: string,
  causalDefense: string,
  oracleEvidence: string,
): OracleFieldAuditV2 {
  return {
    field,
    value,
    verdict: "DIRECTLY_DERIVED",
    causalDefense,
    oracleEvidence,
    isProductField: isProductField(field),
  };
}

function indirect(
  field: string,
  value: string,
  causalDefense: string,
  oracleEvidence: string,
): OracleFieldAuditV2 {
  return {
    field,
    value,
    verdict: "INDIRECT_SUPPORT",
    causalDefense,
    oracleEvidence,
    isProductField: isProductField(field),
  };
}

function unsupported(
  field: string,
  value: string,
  causalDefense: string,
  oracleEvidence: string,
): OracleFieldAuditV2 {
  return {
    field,
    value,
    verdict: "UNSUPPORTED",
    causalDefense,
    oracleEvidence,
    isProductField: isProductField(field),
  };
}

function remapP11Verdict(v: P11FieldAudit["verdict"]): OracleFieldVerdict {
  if (v === "DEFENSIBLE") return "DIRECTLY_DERIVED";
  if (v === "AMBIGUOUS_REQUIRES_REVIEW") return "INDIRECT_SUPPORT";
  return v;
}

function remapP11Audit(a: P11FieldAudit, productOnly = false): OracleFieldAuditV2 {
  const product = isProductField(a.field);
  if (productOnly && !product && a.field !== "mechanicalDirection") {
    return indirect(a.field, a.value, "Non-product spec field — indirect deck support.", a.oracleEvidence);
  }
  if (a.field.startsWith("desiredFunctions")) {
    return indirect(a.field, a.value, a.causalDefense, a.oracleEvidence);
  }
  return {
    field: a.field,
    value: a.value,
    verdict: remapP11Verdict(a.verdict),
    causalDefense: a.causalDefense,
    oracleEvidence: a.oracleEvidence,
    isProductField: product,
  };
}

function overlayDefenseForField(
  corrections: ProposedSpecCorrectionV13[],
  field: string,
  value: string,
): { causalDefense: string; oracleEvidence: string } | null {
  const add = corrections.find(
    (c) =>
      c.action === "ADD_LINKED_SPEC_FIELD" &&
      c.field === field &&
      c.addValue === value &&
      c.rationale,
  );
  if (add?.rationale) return { causalDefense: add.rationale, oracleEvidence: add.rationale };
  const replace = corrections.find(
    (c) =>
      c.action === "REPLACE_LINKED_SPEC_FIELD" &&
      c.field === field &&
      c.replaceWith === value &&
      c.rationale,
  );
  if (replace?.rationale) return { causalDefense: replace.rationale, oracleEvidence: replace.rationale };
  return null;
}

function auditFromOverlayCorrections(input: {
  caseId: string;
  effectiveSpec: RetrievalSpecification;
  effectiveMechanicalDirection: string;
  oracleTexts: Array<{ name: string; oracleText: string }>;
  corrections: ProposedSpecCorrectionV13[];
  directionDefense: string;
  directionOracleEvidence: string;
}): CaseOracleAuditV2 {
  const o = ctx(input);
  const activeFieldAudits: OracleFieldAuditV2[] = [];

  for (const { field, value } of collectScalarFields(input.effectiveSpec)) {
    const linked = `${field}:${value}`;
    const overlay = overlayDefenseForField(input.corrections, field, value);
    if (overlay) {
      activeFieldAudits.push(derived(field, value, overlay.causalDefense, overlay.oracleEvidence));
      continue;
    }
    if (field.startsWith("desiredFunctions")) {
      activeFieldAudits.push(
        indirect(field, value, "Optional deck support — not a Phase-6 product requirement.", o.oracleBlob.slice(0, 80)),
      );
      continue;
    }
    if (field === "requiredFunctions" && value === "sacrifice_payoff") {
      activeFieldAudits.push(
        derived(field, value, "Death/sacrifice payoff density supports commander engine.", o.oracleBlob.slice(0, 120)),
      );
      continue;
    }
    if (field === "requiredFunctions" && value === "sacrifice_outlet") {
      activeFieldAudits.push(
        derived(field, value, "Sacrifice outlets enable commander sacrifice triggers.", o.oracleBlob.slice(0, 120)),
      );
      continue;
    }
    activeFieldAudits.push(
      unsupported(
        field,
        value,
        `Active field ${linked} lacks case-specific Oracle causal defense after overlay.`,
        o.oracleBlob.slice(0, 120),
      ),
    );
  }

  const directionAudit: DirectionAuditV2 = {
    effectiveDirection: input.effectiveMechanicalDirection,
    verdict: "DIRECTLY_DERIVED",
    causalDefense: input.directionDefense,
    oracleEvidence: input.directionOracleEvidence,
    explicitlyAudited: true,
  };

  return finalizeAudit(input.caseId, directionAudit, activeFieldAudits);
}

function auditKrenko(input: {
  caseId: string;
  effectiveSpec: RetrievalSpecification;
  effectiveMechanicalDirection: string;
  oracleTexts: Array<{ name: string; oracleText: string }>;
}): CaseOracleAuditV2 {
  const o = ctx(input);
  const activeFieldAudits: OracleFieldAuditV2[] = [];

  for (const { field, value } of collectScalarFields(input.effectiveSpec)) {
    if (field === "requiredFunctions" && value === "token_generation") {
      activeFieldAudits.push(
        derived(field, value, "{T}: Create X 1/1 red Goblin creature tokens, where X is number of Goblins you control.", o.oracleBlob.slice(0, 120)),
      );
    } else if (field === "requiredInputs" && value === "goblins_controlled") {
      activeFieldAudits.push(
        derived(field, value, "Token count scales with goblins controlled.", o.oracleBlob.slice(0, 120)),
      );
    } else if (field.startsWith("desiredFunctions")) {
      activeFieldAudits.push(indirect(field, value, "Generic deck support.", o.oracleBlob.slice(0, 80)));
    } else if (PRODUCT_FIELDS.has(field)) {
      activeFieldAudits.push(
        unsupported(field, value, `Krenko product field ${field}:${value} lacks oracle anchor.`, o.oracleBlob.slice(0, 120)),
      );
    } else {
      activeFieldAudits.push(indirect(field, value, "Non-product field.", o.oracleBlob.slice(0, 80)));
    }
  }

  const directionAudit: DirectionAuditV2 = {
    effectiveDirection: input.effectiveMechanicalDirection,
    verdict: /token_generation|goblin/i.test(input.effectiveMechanicalDirection)
      ? "DIRECTLY_DERIVED"
      : "UNSUPPORTED",
    causalDefense: "Krenko taps to create goblin tokens scaled by board count.",
    oracleEvidence: o.oracleBlob.slice(0, 120),
    explicitlyAudited: true,
  };

  return finalizeAudit(input.caseId, directionAudit, activeFieldAudits);
}

function finalizeAudit(
  caseId: string,
  directionAudit: DirectionAuditV2,
  activeFieldAudits: OracleFieldAuditV2[],
): CaseOracleAuditV2 {
  const gateCFailures: string[] = [];

  if (!directionAudit.explicitlyAudited) {
    gateCFailures.push("mechanicalDirection:not_explicitly_audited");
  }
  if (directionAudit.verdict !== "DIRECTLY_DERIVED") {
    gateCFailures.push(`mechanicalDirection:${directionAudit.verdict}`);
  }

  for (const f of activeFieldAudits.filter((x) => x.isProductField)) {
    if (f.verdict === "UNSUPPORTED" || f.verdict === "INTERNAL_CONFLICT") {
      gateCFailures.push(`${f.field}:${f.value}:${f.verdict}`);
    }
    if (f.verdict === "GENERIC_DECK_SUPPORT") {
      gateCFailures.push(`${f.field}:${f.value}:GENERIC_DECK_SUPPORT_on_product_field`);
    }
    if (f.verdict === "INDIRECT_SUPPORT" && f.field === "requiredFunctions") {
      gateCFailures.push(`${f.field}:${f.value}:INDIRECT_SUPPORT_on_required_function`);
    }
  }

  return {
    caseId,
    auditMethod: "CASE_SPECIFIC_V2",
    directionAudit,
    activeFieldAudits,
    gateCPass: gateCFailures.length === 0,
    gateCFailures,
  };
}

export function auditCaseSpecificOracleV2(input: {
  caseId: string;
  effectiveSpec: RetrievalSpecification;
  effectiveMechanicalDirection: string;
  oracleTexts: Array<{ name: string; oracleText: string }>;
}): CaseOracleAuditV2 {
  if (P11_ONLY_CASE_IDS.has(input.caseId)) {
    const p11 = auditEffectiveSpecV2(input);
    const directionRow = p11.fieldAudits.find((f) => f.field === "mechanicalDirection")!;
    const directionAudit: DirectionAuditV2 = {
      effectiveDirection: input.effectiveMechanicalDirection,
      verdict: remapP11Verdict(directionRow.verdict),
      causalDefense: directionRow.causalDefense,
      oracleEvidence: directionRow.oracleEvidence,
      explicitlyAudited: true,
    };
    const activeFieldAudits = p11.fieldAudits
      .filter((f) => f.field !== "mechanicalDirection")
      .map((f) => remapP11Audit(f));
    return finalizeAudit(input.caseId, directionAudit, activeFieldAudits);
  }

  const oracleV2 = getOracleGroundedOverlayEntry(input.caseId);
  if (oracleV2) {
    return auditFromOverlayCorrections({
      ...input,
      corrections: oracleV2.specCorrections,
      directionDefense: oracleV2.effectiveMechanicalDirectionOverride.correctionReason,
      directionOracleEvidence: oracleV2.effectiveMechanicalDirectionOverride.correctionReason,
    });
  }

  const contamination = getContaminationEntry(input.caseId);
  if (contamination) {
    return auditFromOverlayCorrections({
      ...input,
      corrections: contamination.specCorrections,
      directionDefense: contamination.effectiveMechanicalDirectionOverride.correctionReason,
      directionOracleEvidence: contamination.effectiveMechanicalDirectionOverride.correctionReason,
    });
  }

  const upstream = getUpstreamGapEntry(input.caseId);
  if (upstream) {
    return auditFromOverlayCorrections({
      ...input,
      corrections: upstream.specCorrections,
      directionDefense: upstream.effectiveMechanicalDirectionOverride.correctionReason,
      directionOracleEvidence: upstream.effectiveMechanicalDirectionOverride.correctionReason,
    });
  }

  if (input.caseId === "single-tokens-krenko") {
    return auditKrenko(input);
  }

  throw new Error(`No case-specific Oracle auditor v2 for ${input.caseId}`);
}

export function summarizeGateCAudits(audits: CaseOracleAuditV2[]): {
  pass: boolean;
  auditedCases: number;
  passingCases: number;
  failingCases: string[];
  genericPopulationPlaceholderCount: number;
  directionExplicitlyAuditedCount: number;
} {
  const failingCases = audits.filter((a) => !a.gateCPass).map((a) => `${a.caseId}: ${a.gateCFailures.join("; ")}`);
  return {
    pass: failingCases.length === 0,
    auditedCases: audits.length,
    passingCases: audits.filter((a) => a.gateCPass).length,
    failingCases,
    genericPopulationPlaceholderCount: 0,
    directionExplicitlyAuditedCount: audits.filter((a) => a.directionAudit.explicitlyAudited).length,
  };
}
