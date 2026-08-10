/**
 * RC5 regression scoring — separates action scoring from structural/policy assertions.
 * Action targets = genuine_parser_fn + genuine_parser_fp from spent v14 forensic ledger.
 */
import { parseOracleSemanticsRC3 } from "../../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { verifySemanticParseIntegrity } from "../../src/lib/deck-builder/golden-catalog/oracle-semantic-integrity";
import type { ExpectedPrimitiveAction, OracleActionEvalCaseV2 } from "../audit-oracle-action-eval-cases";
import { sumSemanticMetrics, matchGoldToSemanticActions } from "../oracle-action-semantic-matcher";
import { countActivatedCostLayer2Leakage } from "./activated-cost-leakage";

export type Rc5ScoringTarget = {
  targetId: string;
  actionType: string;
  evidenceContains: string;
  policyClass: string;
  adjudicationVerdict: "genuine_parser_fn";
  rc5Family: string;
  coverageStratum: string;
  cardFace?: string;
  optionalEffect?: boolean;
};

export type Rc5FalsePositiveTarget = {
  gateFpId: string;
  observedAction: string;
  observedEvidence: string;
  adjudicationVerdict: "genuine_parser_fp";
  policyReason: string;
  rc5Family: string;
  coverageStratum: string;
};

export type Rc5ActionScoringCase = OracleActionEvalCaseV2 & {
  sourceV14CaseId: string;
  scoringTargets: Rc5ScoringTarget[];
};

export type Rc5FpScoringCase = OracleActionEvalCaseV2 & {
  sourceV14CaseId: string;
  falsePositiveTarget: Rc5FalsePositiveTarget;
};

export type Rc5IntegrityAssertion = {
  assertionId: string;
  sourceV14CaseId: string;
  oracleId: string;
  oracleText: string;
  cardName: string;
  cardFace?: string;
  assertionType: "integrity";
  required: { idViolations: 0; provenanceViolations: 0 };
};

export type Rc5LeakageAssertion = {
  assertionId: string;
  sourceV14CaseId: string;
  oracleId: string;
  oracleText: string;
  cardName: string;
  cardFace?: string;
  assertionType: "leakage";
  forbiddenEmissions: Array<{ actionType: string; evidenceContains?: string; policyClass: string }>;
};

export type Rc5DevelopmentFamily =
  | "granted_nested_actions"
  | "replacement_effect_parsing"
  | "modal_families"
  | "triggered_families"
  | "saga_planeswalker"
  | "scattered_one_offs";

export type Rc5RegressionPack = {
  setClassification: string;
  evaluationSetVersion: string;
  adjudicationRef: string;
  forensicRef: string;
  actionScoringCases: Rc5ActionScoringCase[];
  fpScoringCases: Rc5FpScoringCase[];
  integrityAssertions: Rc5IntegrityAssertion[];
  leakageAssertions: Rc5LeakageAssertion[];
  developmentOrder: Array<{
    family: Rc5DevelopmentFamily;
    priority: number;
    actionTargetIds: string[];
    fpTargetIds: string[];
  }>;
  accounting: {
    sourceGenuineParserFnCount: number;
    sourceGenuineParserFpCount: number;
    invalidGoldFnExcluded: number;
    missingGoldFpExcluded: number;
    invalidGoldTargetsImported: number;
    duplicateTargets: number;
    unclassifiedTargets: number;
    integrityAssertions: number;
    leakageAssertions: number;
    contrastAssertions: number;
  };
};

export function rc5FamilyForStratum(
  coverageStratum: string,
  verdict: "fn" | "fp",
  caseId: string,
): Rc5DevelopmentFamily {
  if (coverageStratum === "challenge_granted_nested_actions") return "granted_nested_actions";
  if (coverageStratum === "challenge_replacement") return "replacement_effect_parsing";
  if (coverageStratum === "broad_saga_planeswalker" && verdict === "fp") return "saga_planeswalker";
  if (coverageStratum === "broad_saga_planeswalker") return "saga_planeswalker";
  if (coverageStratum === "challenge_modal_option_lineage" || coverageStratum === "broad_modal") {
    return "modal_families";
  }
  if (coverageStratum === "broad_triggered") return "triggered_families";
  return "scattered_one_offs";
}

function scoringCaseFromTargets(caseBase: OracleActionEvalCaseV2, targets: Rc5ScoringTarget[]): Rc5ActionScoringCase {
  const expectedPrimitiveActions: ExpectedPrimitiveAction[] = targets.map((t) => ({
    actionType: t.actionType,
    evidenceContains: t.evidenceContains,
    ...(t.cardFace ? { cardFace: t.cardFace } : {}),
    ...(t.optionalEffect ? { optionalEffect: true } : {}),
  }));
  return {
    ...caseBase,
    expectedPrimitiveActions,
    scoringTargets: targets,
    sourceV14CaseId: caseBase.id,
  } as Rc5ActionScoringCase;
}

export function toActionScoringEvalCase(c: Rc5ActionScoringCase): OracleActionEvalCaseV2 {
  return scoringCaseFromTargets(c, c.scoringTargets);
}

export function scoreActionTargets(cases: Rc5ActionScoringCase[]) {
  const rows = cases.map((c) => {
    const evalCase = toActionScoringEvalCase(c);
    const parse = parseOracleSemanticsRC3({
      oracleId: evalCase.oracleId,
      oracleText: evalCase.oracleText,
      cardFace: evalCase.cardFace,
    });
    const expected = evalCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const matched = matchGoldToSemanticActions({
      expected,
      parse,
      tier: "accepted",
      oracleText: evalCase.oracleText,
      caseId: evalCase.id,
    });
    const tp = matched.matches.filter((m) => m.matched).length;
    const fn = expected.length - tp;
    return {
      caseId: c.id,
      sourceV14CaseId: c.sourceV14CaseId,
      cardName: (c as { cardName?: string }).cardName,
      rc5Family: c.scoringTargets[0]?.rc5Family ?? "scattered_one_offs",
      targets: c.scoringTargets,
      metrics: { tp, fp: 0, fn },
      emitted: parse.actions
        .filter((a) => a.reviewStatus === "accepted")
        .map((a) => ({ actionType: a.actionType, evidence: a.provenance.actionSpan.text })),
    };
  });
  const accepted = sumSemanticMetrics(rows.map((r) => ({ caseId: r.caseId, accepted: r.metrics })));
  return { rows, accepted, targetCount: cases.reduce((n, c) => n + c.scoringTargets.length, 0) };
}

export function scoreFpTargets(cases: Rc5FpScoringCase[]) {
  const rows = cases.map((c) => {
    const parse = parseOracleSemanticsRC3({
      oracleId: c.oracleId,
      oracleText: c.oracleText,
      cardFace: c.cardFace,
    });
    const fp = c.falsePositiveTarget;
    const emitted = parse.actions.filter((a) => a.reviewStatus === "accepted");
    const falsePositiveHit = emitted.some(
      (a) =>
        a.actionType === fp.observedAction &&
        a.provenance.actionSpan.text.toLowerCase().includes(fp.observedEvidence.toLowerCase().slice(0, 20)),
    );
    return {
      caseId: c.id,
      sourceV14CaseId: c.sourceV14CaseId,
      cardName: (c as { cardName?: string }).cardName,
      rc5Family: fp.rc5Family,
      falsePositiveTarget: fp,
      fp: falsePositiveHit ? 1 : 0,
      pass: !falsePositiveHit,
      emitted: emitted.map((a) => ({ actionType: a.actionType, evidence: a.provenance.actionSpan.text })),
    };
  });
  return {
    rows,
    fp: rows.reduce((n, r) => n + r.fp, 0),
    passCount: rows.filter((r) => r.pass).length,
  };
}

export function runIntegrityAssertions(assertions: Rc5IntegrityAssertion[]) {
  const rows = assertions.map((a) => {
    const parse = parseOracleSemanticsRC3({ oracleId: a.oracleId, oracleText: a.oracleText, cardFace: a.cardFace });
    const integrity = verifySemanticParseIntegrity(parse, a.oracleText);
    const pass = integrity.idViolations.length === 0 && integrity.provenanceViolations.length === 0;
    return {
      assertionId: a.assertionId,
      sourceV14CaseId: a.sourceV14CaseId,
      pass,
      idViolations: integrity.idViolations.length,
      provenanceViolations: integrity.provenanceViolations.length,
    };
  });
  return {
    rows,
    passCount: rows.filter((r) => r.pass).length,
    idViolations: rows.reduce((n, r) => n + r.idViolations, 0),
    provenanceViolations: rows.reduce((n, r) => n + r.provenanceViolations, 0),
  };
}

export function runLeakageAssertions(assertions: Rc5LeakageAssertion[]) {
  const rows = assertions.map((a) => {
    const parse = parseOracleSemanticsRC3({ oracleId: a.oracleId, oracleText: a.oracleText, cardFace: a.cardFace });
    const structuralLeak = countActivatedCostLayer2Leakage(a.oracleId, a.oracleText, parse.actions);
    const forbiddenHits: Array<{ actionType: string; evidence: string; policyClass: string }> = [];
    for (const action of parse.actions.filter((x) => x.reviewStatus === "accepted")) {
      for (const rule of a.forbiddenEmissions) {
        if (action.actionType !== rule.actionType) continue;
        if (
          rule.evidenceContains &&
          !action.provenance.actionSpan.text.toLowerCase().includes(rule.evidenceContains.toLowerCase().slice(0, 16))
        ) {
          continue;
        }
        forbiddenHits.push({
          actionType: action.actionType,
          evidence: action.provenance.actionSpan.text,
          policyClass: rule.policyClass,
        });
      }
    }
    const pass = structuralLeak === 0 && forbiddenHits.length === 0;
    return {
      assertionId: a.assertionId,
      sourceV14CaseId: a.sourceV14CaseId,
      pass,
      structuralLeak,
      forbiddenHits,
    };
  });
  return {
    rows,
    passCount: rows.filter((r) => r.pass).length,
    structuralLeak: rows.reduce((n, r) => n + r.structuralLeak, 0),
    forbiddenHitCount: rows.reduce((n, r) => n + r.forbiddenHits.length, 0),
  };
}

export function scoreRc5RegressionPack(pack: Rc5RegressionPack) {
  const action = scoreActionTargets(pack.actionScoringCases);
  const fp = scoreFpTargets(pack.fpScoringCases);
  const integrity = runIntegrityAssertions(pack.integrityAssertions);
  const leakage = runLeakageAssertions(pack.leakageAssertions);
  return { action, fp, integrity, leakage, accounting: pack.accounting };
}

export function sliceActionScoreByFamily(pack: Rc5RegressionPack, family: Rc5DevelopmentFamily) {
  const cases = pack.actionScoringCases.filter((c) =>
    c.scoringTargets.some((t) => t.rc5Family === family),
  );
  return scoreActionTargets(cases);
}

export function sliceFpScoreByFamily(pack: Rc5RegressionPack, family: Rc5DevelopmentFamily) {
  const cases = pack.fpScoringCases.filter((c) => c.falsePositiveTarget.rc5Family === family);
  return scoreFpTargets(cases);
}
