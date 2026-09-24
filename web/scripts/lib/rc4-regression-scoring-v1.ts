/**
 * RC4 regression scoring — separates action scoring from structural/policy assertions.
 */
import { parseOracleSemanticsRC3 } from "../../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { verifySemanticParseIntegrity } from "../../src/lib/deck-builder/golden-catalog/oracle-semantic-integrity";
import type { ExpectedPrimitiveAction, OracleActionEvalCaseV2 } from "../audit-oracle-action-eval-cases";
import { sumSemanticMetrics, matchGoldToSemanticActions } from "../oracle-action-semantic-matcher";
import { countActivatedCostLayer2Leakage } from "./activated-cost-leakage";

export type Rc4ScoringTarget = {
  targetId: string;
  actionType: string;
  evidenceContains: string;
  policyClass: string;
  adjudicationVerdict: "valid_gold_parser_fn";
  cardFace?: string;
  optionalEffect?: boolean;
};

export type Rc4FalsePositiveTarget = {
  gateFpId: string;
  observedAction: string;
  observedEvidence: string;
  adjudicationVerdict: "genuine_parser_fp";
  policyReason: string;
};

export type Rc4ActionScoringCase = OracleActionEvalCaseV2 & {
  sourceV13CaseId: string;
  scoringTargets: Rc4ScoringTarget[];
};

export type Rc4FpScoringCase = OracleActionEvalCaseV2 & {
  sourceV13CaseId: string;
  falsePositiveTarget: Rc4FalsePositiveTarget;
};

export type Rc4IntegrityAssertion = {
  assertionId: string;
  sourceV13CaseId: string;
  oracleId: string;
  oracleText: string;
  cardName: string;
  cardFace?: string;
  assertionType: "integrity";
  required: { idViolations: 0; provenanceViolations: 0 };
};

export type Rc4LeakageAssertion = {
  assertionId: string;
  sourceV13CaseId: string;
  oracleId: string;
  oracleText: string;
  cardName: string;
  cardFace?: string;
  assertionType: "leakage";
  forbiddenEmissions: Array<{ actionType: string; evidenceContains?: string; policyClass: string }>;
};

export type Rc4RegressionPack = {
  setClassification: string;
  evaluationSetVersion: string;
  adjudicationRef: string;
  actionScoringCases: Rc4ActionScoringCase[];
  fpScoringCases: Rc4FpScoringCase[];
  integrityAssertions: Rc4IntegrityAssertion[];
  leakageAssertions: Rc4LeakageAssertion[];
  accounting: {
    sourceValidParserFnCount: number;
    sourceGenuineParserFpCount: number;
    invalidGoldTargetsImported: number;
    duplicateTargets: number;
    unclassifiedTargets: number;
    integrityAssertions: number;
    leakageAssertions: number;
    contrastAssertions: number;
  };
};

function scoringCaseFromTargets(caseBase: OracleActionEvalCaseV2, targets: Rc4ScoringTarget[]): Rc4ActionScoringCase {
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
    sourceV13CaseId: caseBase.id,
  } as Rc4ActionScoringCase;
}

export function toActionScoringEvalCase(c: Rc4ActionScoringCase): OracleActionEvalCaseV2 {
  return scoringCaseFromTargets(c, c.scoringTargets);
}

export function scoreActionTargets(cases: Rc4ActionScoringCase[]) {
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
      sourceV13CaseId: c.sourceV13CaseId,
      cardName: (c as { cardName?: string }).cardName,
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

export function scoreFpTargets(cases: Rc4FpScoringCase[]) {
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
      sourceV13CaseId: c.sourceV13CaseId,
      cardName: (c as { cardName?: string }).cardName,
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

export function runIntegrityAssertions(assertions: Rc4IntegrityAssertion[]) {
  const rows = assertions.map((a) => {
    const parse = parseOracleSemanticsRC3({ oracleId: a.oracleId, oracleText: a.oracleText, cardFace: a.cardFace });
    const integrity = verifySemanticParseIntegrity(parse, a.oracleText);
    const pass = integrity.idViolations.length === 0 && integrity.provenanceViolations.length === 0;
    return {
      assertionId: a.assertionId,
      sourceV13CaseId: a.sourceV13CaseId,
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

export function runLeakageAssertions(assertions: Rc4LeakageAssertion[]) {
  const rows = assertions.map((a) => {
    const parse = parseOracleSemanticsRC3({ oracleId: a.oracleId, oracleText: a.oracleText, cardFace: a.cardFace });
    const structuralLeak = countActivatedCostLayer2Leakage(a.oracleId, a.oracleText, parse.actions);
    const forbiddenHits: Array<{ actionType: string; evidence: string }> = [];
    for (const action of parse.actions.filter((x) => x.reviewStatus === "accepted")) {
      for (const rule of a.forbiddenEmissions) {
        if (action.actionType !== rule.actionType) continue;
        if (
          rule.evidenceContains &&
          !action.provenance.actionSpan.text.toLowerCase().includes(rule.evidenceContains.toLowerCase().slice(0, 16))
        ) {
          continue;
        }
        forbiddenHits.push({ actionType: action.actionType, evidence: action.provenance.actionSpan.text });
      }
    }
    const pass = structuralLeak === 0 && forbiddenHits.length === 0;
    return {
      assertionId: a.assertionId,
      sourceV13CaseId: a.sourceV13CaseId,
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

export function scoreRc4RegressionPack(pack: Rc4RegressionPack) {
  const action = scoreActionTargets(pack.actionScoringCases);
  const fp = scoreFpTargets(pack.fpScoringCases);
  const integrity = runIntegrityAssertions(pack.integrityAssertions);
  const leakage = runLeakageAssertions(pack.leakageAssertions);
  return { action, fp, integrity, leakage, accounting: pack.accounting };
}

/** Slice helpers for A/B/C using adjudicated targets only. */
export function sliceActionScore(
  pack: Rc4RegressionPack,
  sourceCaseIds: string[],
  actionTypes?: string[],
) {
  const cases = pack.actionScoringCases.filter((c) => sourceCaseIds.includes(c.sourceV13CaseId));
  const filtered = actionTypes
    ? cases.map((c) => ({
        ...c,
        scoringTargets: c.scoringTargets.filter((t) => actionTypes.includes(t.actionType)),
      }))
    : cases;
  return scoreActionTargets(filtered.filter((c) => c.scoringTargets.length > 0));
}
