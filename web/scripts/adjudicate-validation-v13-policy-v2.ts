/**
 * Canonical v13 adjudication reconciliation — 82/82 FN + 8/8 gate FP ledgers.
 * Run: cd web && npx tsx scripts/adjudicate-validation-v13-policy-v2.ts
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import type { ExpectedPrimitiveAction } from "./audit-oracle-action-eval-cases";
import { matchGoldToSemanticActions, semanticActionsForMatch } from "./oracle-action-semantic-matcher";
import { countParserFalsePositives } from "./oracle-action-unified-matcher";
import {
  adjudicateOfficialFpGoldCompleteness,
  classifyCastGold,
  classifySacrificeDiscardGold,
} from "./lib/validation-v13-policy-adjudication";
import { verifySemanticParseIntegrity } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-integrity";
import { validateOracleSemanticParse } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-validator";
import type { OracleSemanticParse } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-schema";

const V13_PATH = "data/oracle-action-eval-validation-v13.json";
const AGGREGATE_PATH = "data/milestones/validation-v13-rc3-certification/validation-v13-rc3-execution-1-aggregate.json";
const RAW_PATH = "data/milestones/validation-v13-rc3-certification/validation-v13-rc3-execution-1-raw.json";
const OUT_DIR = "data/milestones/validation-v13-rc3-certification";

const OFFICIAL_SCORE = {
  tp: 248,
  fp: 8,
  fn: 82,
  precision: 0.96875,
  recall: 0.7515151515151515,
  goldDenominator: 330,
  releaseGatePass: false,
  note: "IMMUTABLE OFFICIAL SEALED FIRST CONTACT — never rewrite",
};

export type FnFinalVerdict =
  | "valid_gold_parser_fn"
  | "invalid_cost_gold"
  | "invalid_trigger_event_gold"
  | "invalid_permission_gold"
  | "invalid_reminder_gold"
  | "invalid_other_gold"
  | "evaluator_defect"
  | "unsupported";

export type FpFinalVerdict =
  | "genuine_parser_fp"
  | "missing_gold"
  | "scope_issue"
  | "evaluator_issue";

type MissLedgerFn = {
  caseId: string;
  card: string;
  mismatchKind: "FN";
  expectedAction: string;
  expectedEvidence: string;
  coverageStratum?: string;
};

type GateFp = {
  gateFpId: string;
  caseId: string;
  cardName: string;
  observedAction: string;
  observedEvidence: string;
  actionIndex: number;
};

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
}

function fnMismatchId(caseId: string, expectedAction: string, expectedEvidence: string): string {
  return createHash("sha256")
    .update(`${caseId}|${expectedAction}|${expectedEvidence}`)
    .digest("hex")
    .slice(0, 16);
}

function mapSacDiscToFinal(
  row: ReturnType<typeof classifySacrificeDiscardGold>,
): { finalVerdict: FnFinalVerdict; policyClass: string } {
  if (row.verdict === "valid_layer2_gold") {
    return { finalVerdict: "valid_gold_parser_fn", policyClass: row.policyClass };
  }
  if (row.verdict === "evaluator_evidence_mismatch") {
    return { finalVerdict: "evaluator_defect", policyClass: row.policyClass };
  }
  if (
    row.policyClass.includes("cost") ||
    row.policyClass === "landcycling_cost_layer1" ||
    row.policyClass === "condition_reference"
  ) {
    return { finalVerdict: "invalid_cost_gold", policyClass: row.policyClass };
  }
  if (row.policyClass === "trigger_event_reference") {
    return { finalVerdict: "invalid_trigger_event_gold", policyClass: row.policyClass };
  }
  if (row.policyClass === "reminder_mechanic_definition") {
    return { finalVerdict: "invalid_reminder_gold", policyClass: row.policyClass };
  }
  return { finalVerdict: "invalid_other_gold", policyClass: row.policyClass };
}

function mapCastToFinal(row: ReturnType<typeof classifyCastGold>): { finalVerdict: FnFinalVerdict; policyClass: string } {
  if (row.verdict === "valid_layer2_gold") {
    return { finalVerdict: "valid_gold_parser_fn", policyClass: row.castPolicyClass };
  }
  if (row.verdict === "evaluator_evidence_mismatch") {
    return { finalVerdict: "evaluator_defect", policyClass: row.castPolicyClass };
  }
  if (row.castPolicyClass === "additional_spell_cost") {
    return { finalVerdict: "invalid_cost_gold", policyClass: row.castPolicyClass };
  }
  if (row.castPolicyClass === "trigger_event_reference") {
    return { finalVerdict: "invalid_trigger_event_gold", policyClass: row.castPolicyClass };
  }
  if (
    row.castPolicyClass === "future_specific_object_permission" ||
    row.castPolicyClass === "future_object_class_permission" ||
    row.castPolicyClass === "duration_limited_permission"
  ) {
    return { finalVerdict: "invalid_permission_gold", policyClass: row.castPolicyClass };
  }
  if (row.castPolicyClass === "reminder_mechanic_definition") {
    return { finalVerdict: "invalid_reminder_gold", policyClass: row.castPolicyClass };
  }
  return { finalVerdict: "invalid_other_gold", policyClass: row.castPolicyClass };
}

function adjudicateOtherFn(
  testCase: OracleActionEvalCaseV2,
  gold: ExpectedPrimitiveAction,
): { finalVerdict: FnFinalVerdict; policyClass: string; reason: string } {
  const evidence = gold.evidenceContains ?? "";
  const oracle = testCase.oracleText;
  const stratum = (testCase as { coverageStratum?: string }).coverageStratum ?? "";

  if (gold.actionType === "return_to_battlefield" && /to your hand/i.test(evidence)) {
    return {
      finalVerdict: "invalid_other_gold",
      policyClass: "wrong_primitive_label",
      reason: "Gold labels return_to_battlefield but evidence is gy→hand (return_to_hand).",
    };
  }

  if (gold.actionType === "add_mana" && /\([^)]*Add \{[^}]+\}/i.test(oracle)) {
    return {
      finalVerdict: "invalid_cost_gold",
      policyClass: "granted_nested_activated_cost_layer1",
      reason: "Add mana inside token/granted activated-cost reminder — Layer-1 only.",
    };
  }

  if (gold.actionType === "add_mana" && /Add \{[WRGUBC]\}/i.test(evidence) && /When this creature enters/i.test(oracle)) {
    return {
      finalVerdict: "valid_gold_parser_fn",
      policyClass: "triggered_effect_layer2",
      reason: "Triggered add_mana resolving effect — valid L2 gold.",
    };
  }

  if (gold.actionType === "mill" && /\(To mill a card/i.test(oracle)) {
    return {
      finalVerdict: "invalid_reminder_gold",
      policyClass: "reminder_mechanic_definition",
      reason: "Mill definition in reminder parenthetical — not card-native L2.",
    };
  }

  if (
    gold.actionType === "put_counter" &&
    (/put a \+1\/\+1 counter on this creature/i.test(evidence) ||
      /put a \+1\/\+1 counter on target creature/i.test(evidence))
  ) {
    return {
      finalVerdict: "valid_gold_parser_fn",
      policyClass: "resolving_effect_layer2",
      reason: "Imperative put_counter in effect clause — valid L2 gold, parser miss.",
    };
  }

  if (gold.actionType === "return_to_battlefield" && /return target .* from your graveyard to the battlefield/i.test(evidence)) {
    return {
      finalVerdict: "valid_gold_parser_fn",
      policyClass: "resolving_effect_layer2",
      reason: "Genuine gy→battlefield effect — valid L2 gold.",
    };
  }

  if (gold.actionType === "create_token" && /create a .* token/i.test(evidence)) {
    return {
      finalVerdict: "valid_gold_parser_fn",
      policyClass: "resolving_effect_layer2",
      reason: "Triggered create_token effect — valid L2 gold.",
    };
  }

  if (gold.actionType === "draw" && /draw a card/i.test(evidence) && /\{[^}]+\}:/.test(oracle)) {
    return {
      finalVerdict: "valid_gold_parser_fn",
      policyClass: "activated_effect_layer2",
      reason: "Draw in activated post-colon effect — valid L2 gold.",
    };
  }

  if (gold.actionType === "put_counter" && /Put a \+1\/\+1 counter on it for each/i.test(evidence)) {
    return {
      finalVerdict: "valid_gold_parser_fn",
      policyClass: "compound_effect_layer2",
      reason: "Variable counter effect — valid L2 gold.",
    };
  }

  if (stratum.startsWith("policy_")) {
    return {
      finalVerdict: "invalid_reminder_gold",
      policyClass: "policy_stratum_review",
      reason: "Policy stratum non-cast/discard/sac FN — default reminder/trigger review.",
    };
  }

  return {
    finalVerdict: "unsupported",
    policyClass: "unclassified",
    reason: "Requires human review — no automated policy mapping.",
  };
}

function adjudicateFnRow(testCase: OracleActionEvalCaseV2, gold: ExpectedPrimitiveAction) {
  if (gold.actionType === "sacrifice" || gold.actionType === "discard") {
    const row = classifySacrificeDiscardGold({ testCase, gold });
    const mapped = mapSacDiscToFinal(row);
    return { ...mapped, adjudicationReason: row.policyReason };
  }
  if (gold.actionType === "cast") {
    const row = classifyCastGold({ testCase, gold });
    const mapped = mapCastToFinal(row);
    return { ...mapped, adjudicationReason: row.policyReason };
  }
  const other = adjudicateOtherFn(testCase, gold);
  return other;
}

function extractGateFps(
  cases: OracleActionEvalCaseV2[],
  rawById: Record<string, { semanticParse: OracleSemanticParse }>,
): GateFp[] {
  const gateFps: GateFp[] = [];
  for (const tc of cases) {
    const parse = rawById[tc.id].semanticParse;
    const expected = tc.expectedPrimitiveActions.filter((e) => !e.negative);
    const match = matchGoldToSemanticActions({
      expected,
      parse,
      tier: "accepted",
      oracleText: tc.oracleText,
      caseId: tc.id,
    });
    const actions = semanticActionsForMatch(parse);
    const extracted = actions.map((a) => ({
      index: a.index,
      primitive: a.actionType,
      evidenceText: a.evidenceText,
      evidenceStart: a.evidenceStart,
      evidenceEnd: a.evidenceEnd,
      cardFaceId: a.faceId,
      abilityIndex: a.segmentAbilityIndex,
      loyaltyCost: a.loyaltyCost,
      modalOptionId: a.modalOptionKey,
      reviewStatus: a.reviewStatus as "accepted" | "needs_review",
      optionalEffect: a.optionalEffect,
      optional: a.optionalEffect,
      optionalCost: a.optionalCost,
      cardNativeLayer2Eligible: a.cardNativeLayer2Eligible,
      cardStart: a.evidenceStart,
      cardEnd: a.evidenceEnd,
    }));

    for (const idx of match.unmatchedActionIndices) {
      const a = actions[idx];
      if (a.reviewStatus !== "accepted") continue;
      const fp = countParserFalsePositives(tc, [idx], extracted);
      if (fp > 0) {
        gateFps.push({
          gateFpId: `${tc.id}|${a.actionType}|${a.evidenceText}|${idx}`,
          caseId: tc.id,
          cardName: (tc as { cardName?: string }).cardName ?? tc.oracleId,
          observedAction: a.actionType,
          observedEvidence: a.evidenceText,
          actionIndex: idx,
        });
      }
    }
  }
  return gateFps;
}

function buildIntegritySummary(
  rawCases: Array<{ caseId: string; cardName?: string; semanticParse: OracleSemanticParse }>,
  caseById: Record<string, OracleActionEvalCaseV2>,
  aggregateInvariants: Record<string, number>,
) {
  const violationRecords: Array<{
    caseId: string;
    card: string;
    violationCode: string;
    violationMessage: string;
    actionId?: string;
    abilityId?: string;
    provenanceSpan?: string;
    constructionPath?: string;
  }> = [];
  const affectedActionIds = new Set<string>();
  const affectedCases = new Set<string>();

  for (const row of rawCases) {
    const testCase = caseById[row.caseId];
    if (!testCase) continue;
    const parse = row.semanticParse;
    const validation = validateOracleSemanticParse(parse, testCase.oracleText);
    const integrity = verifySemanticParseIntegrity(parse, testCase.oracleText);

    for (const issue of validation.issues.filter((i) => i.severity === "invalid")) {
      const action = issue.actionId ? parse.actions.find((a) => a.actionId === issue.actionId) : undefined;
      if (issue.actionId) affectedActionIds.add(issue.actionId);
      affectedCases.add(row.caseId);
      violationRecords.push({
        caseId: row.caseId,
        card: row.cardName ?? testCase.oracleId,
        violationCode: issue.code,
        violationMessage: issue.message,
        actionId: issue.actionId,
        abilityId: action?.parentAbilityId,
        provenanceSpan: action?.provenance.actionSpan.text,
        constructionPath: action?.extractionSource,
      });
    }
    for (const v of [...integrity.idViolations, ...integrity.provenanceViolations]) {
      if (v.actionId) affectedActionIds.add(v.actionId);
      affectedCases.add(row.caseId);
      violationRecords.push({
        caseId: row.caseId,
        card: row.cardName ?? testCase.oracleId,
        violationCode: v.code,
        violationMessage: v.message,
        actionId: v.actionId,
        abilityId: v.abilityId,
      });
    }
  }

  return {
    semanticInvalidActionCount: aggregateInvariants.semanticInvalidActionCount,
    semanticValidatorViolationCount: aggregateInvariants.semanticValidatorViolationCount,
    idViolations: aggregateInvariants.idViolations,
    provenanceViolations: aggregateInvariants.provenanceViolations,
    activatedCostLayer2Leakage: aggregateInvariants.activatedCostLayer2Leakage,
    violationRecordCount: violationRecords.length,
    uniqueAffectedSemanticNodes: affectedActionIds.size,
    uniqueAffectedCases: affectedCases.size,
    affectedCaseIds: [...affectedCases],
    violationRecords,
    note: "Violation records may exceed unique nodes/cases; activatedCostLayer2Leakage is separate parser-policy emission census.",
  };
}

function main() {
  const envelope = JSON.parse(readFileSync(V13_PATH, "utf8")) as {
    contentHash: string;
    cases: OracleActionEvalCaseV2[];
    parserExecutionCount: number;
  };
  const aggregate = JSON.parse(readFileSync(AGGREGATE_PATH, "utf8")) as {
    missLedger: MissLedgerFn[];
    invariants: Record<string, number>;
  };
  const raw = JSON.parse(readFileSync(RAW_PATH, "utf8")) as {
    cases: Array<{ caseId: string; cardName?: string; semanticParse: OracleSemanticParse }>;
  };

  if (envelope.parserExecutionCount !== 1) {
    throw new Error(`v13 must be spent (parserExecutionCount=1), got ${envelope.parserExecutionCount}`);
  }

  const caseById = Object.fromEntries(envelope.cases.map((c) => [c.id, c]));
  const rawById = Object.fromEntries(raw.cases.map((c) => [c.caseId, c]));

  const officialFnRows = aggregate.missLedger.filter(
    (r): r is MissLedgerFn => r.mismatchKind === "FN" && !!r.expectedAction,
  );
  if (officialFnRows.length !== 82) {
    throw new Error(`Expected 82 official FN rows, got ${officialFnRows.length}`);
  }

  const fnLedger = officialFnRows.map((row) => {
    const testCase = caseById[row.caseId];
    const gold = testCase.expectedPrimitiveActions.find(
      (g) => !g.negative && g.actionType === row.expectedAction && g.evidenceContains === row.expectedEvidence,
    );
    if (!gold) throw new Error(`Gold not found for FN ${row.caseId} ${row.expectedAction}`);
    const adj = adjudicateFnRow(testCase, gold);
    return {
      mismatchId: fnMismatchId(row.caseId, row.expectedAction, row.expectedEvidence),
      caseId: row.caseId,
      card: row.card,
      expectedAction: row.expectedAction,
      goldEvidence: row.expectedEvidence,
      caseScope: testCase.caseScope ?? "full_card",
      coverageStratum: row.coverageStratum ?? (testCase as { coverageStratum?: string }).coverageStratum,
      finalVerdict: adj.finalVerdict,
      policyClass: adj.policyClass,
      adjudicationReason: adj.adjudicationReason ?? adj.reason,
    };
  });

  const fnIds = new Set(fnLedger.map((r) => r.mismatchId));
  if (fnLedger.length !== 82 || fnIds.size !== 82) {
    throw new Error(`FN ledger integrity failed: rows=${fnLedger.length}, unique=${fnIds.size}`);
  }

  const fnPartition = fnLedger.reduce<Record<FnFinalVerdict, number>>(
    (acc, r) => {
      acc[r.finalVerdict] = (acc[r.finalVerdict] ?? 0) + 1;
      return acc;
    },
    {} as Record<FnFinalVerdict, number>,
  );
  const fnPartitionSum = Object.values(fnPartition).reduce((s, n) => s + n, 0);
  if (fnPartitionSum !== 82) {
    throw new Error(`FN partition sum ${fnPartitionSum} !== 82: ${JSON.stringify(fnPartition)}`);
  }

  const gateFps = extractGateFps(envelope.cases, rawById);
  if (gateFps.length !== 8) {
    throw new Error(`Expected 8 gate FPs, got ${gateFps.length}: ${JSON.stringify(gateFps.map((g) => g.caseId))}`);
  }

  const fpLedger = gateFps.map((gate) => {
    const testCase = caseById[gate.caseId];
    const blind = adjudicateOfficialFpGoldCompleteness({
      testCase,
      actionType: gate.observedAction,
      evidenceContains: gate.observedEvidence,
      abilityType: "unknown",
    });
    let finalVerdict: FpFinalVerdict;
    if (blind.verdict === "out_of_scope_emission") finalVerdict = "scope_issue";
    else if (blind.verdict === "missing_gold") finalVerdict = "missing_gold";
    else if (blind.verdict === "evaluator_defect") finalVerdict = "evaluator_issue";
    else finalVerdict = "genuine_parser_fp";

    return {
      gateFpId: gate.gateFpId,
      caseId: gate.caseId,
      card: gate.cardName,
      observedAction: gate.observedAction,
      observedEvidence: gate.observedEvidence,
      actionIndex: gate.actionIndex,
      caseScope: testCase.caseScope ?? "full_card",
      finalVerdict,
      adjudicationReason: blind.policyReason,
      recommendedGoldAddition: blind.recommendedGoldAddition,
    };
  });

  const fpPartition = fpLedger.reduce<Record<FpFinalVerdict, number>>(
    (acc, r) => {
      acc[r.finalVerdict] = (acc[r.finalVerdict] ?? 0) + 1;
      return acc;
    },
    {} as Record<FpFinalVerdict, number>,
  );
  if (Object.values(fpPartition).reduce((s, n) => s + n, 0) !== 8) {
    throw new Error(`FP partition sum !== 8: ${JSON.stringify(fpPartition)}`);
  }

  const diagnosticNonGate = aggregate.missLedger
    .filter(
      (r: { mismatchKind: string; errorClass?: string }) =>
        r.mismatchKind === "FP" && r.errorClass === "parser_false_positive",
    )
    .filter((r: { caseId: string }) => !gateFps.some((g) => g.caseId === r.caseId && (r as { observedAction?: string }).observedAction === g.observedAction));

  const invalidGoldFn = fnLedger.filter((r) => r.finalVerdict.startsWith("invalid_")).length;
  const genuineParserFn = fnLedger.filter((r) => r.finalVerdict === "valid_gold_parser_fn").length;
  const evaluatorFn = fnLedger.filter((r) => r.finalVerdict === "evaluator_defect").length;
  const unsupportedFn = fnLedger.filter((r) => r.finalVerdict === "unsupported").length;

  const missingGoldFp = fpLedger.filter((r) => r.finalVerdict === "missing_gold").length;
  const genuineParserFp = fpLedger.filter((r) => r.finalVerdict === "genuine_parser_fp").length;
  const evaluatorFp = fpLedger.filter((r) => r.finalVerdict === "evaluator_issue").length;
  const scopeFp = fpLedger.filter((r) => r.finalVerdict === "scope_issue").length;

  const correctedGoldDenominator = OFFICIAL_SCORE.goldDenominator - invalidGoldFn + missingGoldFp;
  const correctedTp = OFFICIAL_SCORE.tp + missingGoldFp;
  const correctedFp = genuineParserFp + evaluatorFp;
  const correctedFn = genuineParserFn + evaluatorFn + unsupportedFn;

  if (correctedTp + correctedFn !== correctedGoldDenominator) {
    throw new Error(
      `Corrected accounting failed: TP+FN=${correctedTp + correctedFn} !== denom=${correctedGoldDenominator}`,
    );
  }

  const correctedPrecision = correctedTp + correctedFp > 0 ? correctedTp / (correctedTp + correctedFp) : 1;
  const correctedRecall = correctedTp + correctedFn > 0 ? correctedTp / (correctedTp + correctedFn) : 1;

  const integrity = buildIntegritySummary(raw.cases, caseById, aggregate.invariants);

  const genuineFailureCensus = {
    byStructuralFamily: {} as Record<string, number>,
  };
  for (const row of fnLedger.filter((r) => r.finalVerdict === "valid_gold_parser_fn")) {
    let family = "other";
    if (row.expectedAction === "cast") family = "immediate_cast";
    else if (row.expectedAction === "put_counter") family = "quantity_counter";
    else if (row.expectedAction === "sacrifice" || row.expectedAction === "discard") family = "activated_cost_effect_segmentation";
    else if (row.coverageStratum?.includes("search")) family = "search_referent_chain";
    else if (row.coverageStratum?.includes("modal")) family = "modal_choice";
    else if (row.coverageStratum?.includes("multiface")) family = "mdfc_face";
    else if (row.expectedAction === "return_to_battlefield") family = "zone_transition";
    else if (row.expectedAction === "create_token") family = "other";
    genuineFailureCensus.byStructuralFamily[family] = (genuineFailureCensus.byStructuralFamily[family] ?? 0) + 1;
  }
  if (genuineParserFp > 0) {
    genuineFailureCensus.byStructuralFamily.library_top_vs_search = genuineParserFp;
  }
  if (integrity.uniqueAffectedCases > 0) {
    genuineFailureCensus.byStructuralFamily.modal_clause_id_lifecycle = integrity.uniqueAffectedCases;
  }
  if (integrity.activatedCostLayer2Leakage > 0) {
    genuineFailureCensus.byStructuralFamily.activated_cost_layer2_leakage = integrity.activatedCostLayer2Leakage;
  }

  const artifact = {
    artifactType: "ValidationPolicyAdjudication",
    version: "validation-v13-policy-adjudication-v2",
    generatedAt: new Date().toISOString(),
    parserBlind: true,
    officialSealedFirstContact: OFFICIAL_SCORE,
    accountingAssertions: {
      fnRowCount: fnLedger.length,
      fnUniqueMismatchIds: fnIds.size,
      fnPartitionSum,
      fpGateRowCount: fpLedger.length,
      fpPartitionSum: 8,
      correctedTpPlusFnEqualsDenominator: correctedTp + correctedFn === correctedGoldDenominator,
    },
    canonicalFnLedger: {
      rowCount: fnLedger.length,
      partition: fnPartition,
      invalidGoldSubpartition: {
        invalid_cost_gold: fnPartition.invalid_cost_gold ?? 0,
        invalid_trigger_event_gold: fnPartition.invalid_trigger_event_gold ?? 0,
        invalid_permission_gold: fnPartition.invalid_permission_gold ?? 0,
        invalid_reminder_gold: fnPartition.invalid_reminder_gold ?? 0,
        invalid_other_gold: fnPartition.invalid_other_gold ?? 0,
      },
      rows: fnLedger,
    },
    canonicalGateFpLedger: {
      rowCount: fpLedger.length,
      source: "countParserFalsePositives on frozen validation-v13-rc3-execution-1-raw.json",
      officialGateCaseIds: fpLedger.map((r) => r.caseId),
      partition: fpPartition,
      rows: fpLedger,
    },
    diagnosticNonGateEmissions: {
      label: "missLedger parser_false_positive rows NOT in official gate FP=8 set",
      count: diagnosticNonGate.length,
      rows: diagnosticNonGate,
    },
    fpIdentityReconciliation: {
      note: "First-run prose listed vh13-0031/0089/0151 as FPs but those are structure_only — excluded by gate scorer. Immutable gate FPs are exactly the 8 rows in canonicalGateFpLedger.",
      immutableGateFpCaseIds: fpLedger.map((r) => r.caseId),
      missLedgerParserFalsePositiveCaseIds: [
        ...new Set(
          aggregate.missLedger
            .filter((r: { mismatchKind: string; errorClass?: string }) => r.mismatchKind === "FP" && r.errorClass === "parser_false_positive")
            .map((r: { caseId: string }) => r.caseId),
        ),
      ],
    },
    integritySummary: integrity,
    genuineFailureCensus: {
      originalScoring: OFFICIAL_SCORE,
      fnDisposition: fnPartition,
      fpDisposition: fpPartition,
      invalidGoldFnLabels: invalidGoldFn,
      missingGoldFpLabels: missingGoldFp,
      genuineParserFn,
      genuineParserFp,
      evaluatorFn,
      evaluatorFp,
      unsupportedFn,
      structuralFamilies: genuineFailureCensus.byStructuralFamily,
    },
  };

  const correctedDiagnostic = {
    artifactType: "ValidationPolicyCorrectedDiagnostic",
    version: "validation-v13-policy-corrected-diagnostic-v2",
    generatedAt: artifact.generatedAt,
    adjudicationRef: "validation-v13-policy-adjudication-v2.json",
    officialSealedFirstContact: OFFICIAL_SCORE,
    accountingFormula: {
      goldDenominator: "original(330) - invalidGoldFn + missingGoldFp",
      tp: "original(248) + missingGoldFp",
      fp: "genuineParserFp + evaluatorFp",
      fn: "genuineParserFn + evaluatorFn + unsupportedFn",
      invariant: "TP + FN === goldDenominator",
    },
    policyCorrected: {
      goldDenominator: correctedGoldDenominator,
      tp: correctedTp,
      fp: correctedFp,
      fn: correctedFn,
      precision: correctedPrecision,
      recall: correctedRecall,
    },
    inputs: {
      invalidGoldFnRemoved: invalidGoldFn,
      missingGoldFpAdded: missingGoldFp,
      genuineParserFnRetained: genuineParserFn,
      genuineParserFpRetained: genuineParserFp,
    },
    releaseGatePassUnderPolicyCorrection: false,
    note: "Hypothetical post-adjudication view — v13 official result remains FAIL/SPENT.",
  };

  mkdirSync(resolve(OUT_DIR), { recursive: true });
  const adjPath = resolve(OUT_DIR, "validation-v13-policy-adjudication-v2.json");
  const diagPath = resolve(OUT_DIR, "validation-v13-policy-corrected-diagnostic-v2.json");
  writeFileSync(adjPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  writeFileSync(diagPath, `${JSON.stringify(correctedDiagnostic, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        adjudicationHash: sha256File(adjPath),
        diagnosticHash: sha256File(diagPath),
        fnPartition,
        fpPartition,
        policyCorrected: correctedDiagnostic.policyCorrected,
        integrity: {
          uniqueCases: integrity.uniqueAffectedCases,
          uniqueNodes: integrity.uniqueAffectedSemanticNodes,
          violationRecords: integrity.violationRecordCount,
          activatedCostLayer2Leakage: integrity.activatedCostLayer2Leakage,
        },
        structuralFamilies: genuineFailureCensus.byStructuralFamily,
      },
      null,
      2,
    ),
  );
}

main();
