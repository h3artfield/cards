/**
 * v18 forensic diagnosis v1 — 27 FN / 10 FP adjudication from preserved RC8 first run.
 * Run: cd web && npx tsx scripts/forensic-validation-v18-v1.ts
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ExpectedPrimitiveAction, OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import type { OracleSemanticParse } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-schema";
import { verifySemanticParseIntegrity } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-integrity";
import { matchGoldToSemanticActions, semanticActionsForMatch } from "./oracle-action-semantic-matcher";
import { countParserFalsePositives } from "./oracle-action-unified-matcher";
import {
  adjudicateOfficialFpGoldCompleteness,
  classifyCastGold,
  classifySacrificeDiscardGold,
} from "./lib/validation-v13-policy-adjudication";
import { validateBenchmarkGoldPolicy, validateGoldAction } from "./lib/gold-policy-validator-v1";
import { enrichGoldAction } from "./lib/gold-semantic-enrichment-v1";
import {
  isOneShotCastPermission,
  isPersistentZoneCastPermission,
} from "../src/lib/deck-builder/golden-catalog/oracle-span-role-classifier";
import { computeGoldPolicyStackHashes } from "./lib/gold-policy-stack-v1";

const OUT_DIR = "data/milestones/validation-v18-certification";
const V18_PATH = "data/oracle-action-eval-validation-v18.json";
const AGGREGATE_PATH = `${OUT_DIR}/validation-v18-rc8-execution-1-aggregate.json`;
const RAW_PATH = `${OUT_DIR}/validation-v18-rc8-execution-1-raw.json`;
const EXEC_RECORD_PATH = `${OUT_DIR}/validation-v18-rc8-execution-record.json`;
const CERT_PATH = `${OUT_DIR}/validation-v18-gold-policy-certificate-v2-rc8.json`;
const CORR_PATH = `${OUT_DIR}/validation-v18-gold-policy-correction-report-v1.json`;
const FREEZE_PATH = `${OUT_DIR}/validation-v18-freeze-manifest-v152.json`;
const V17_ROOT_CAUSE_PATH = "data/milestones/validation-v17-certification/validation-v17-root-cause-ledger-v1.json";
const V17_FORENSIC_PATH = "data/milestones/validation-v17-certification/validation-v17-forensic-adjudication-v1.json";

const OFFICIAL = {
  tp: 227,
  fp: 10,
  fn: 27,
  precision: 0.9578059071729957,
  recall: 0.8937007874015748,
  goldDenominator: 254,
  validationPass: false,
  holdoutStatus: "FAIL / SPENT",
};

const V15_GRAMMAR_GAPS = [
  { caseId: "vh15-0064", construction: "discard your hand", action: "discard" },
  { caseId: "vh15-0085", construction: "Aisha immediate cast", action: "cast" },
  { caseId: "vh15-0089", construction: "cleave-bracket return", action: "return_to_hand" },
  { caseId: "vh15-0105", construction: "Mill a card", action: "mill" },
  { caseId: "vh15-0142", construction: "Barrin's Spite sacrifice", action: "sacrifice" },
];

type FnVerdict =
  | "genuine_parser_fn"
  | "invalid_gold"
  | "wrong_primitive_gold"
  | "evaluator_defect"
  | "scope_defect"
  | "unsupported";

type FpVerdict = "genuine_parser_fp" | "missing_gold" | "evaluator_defect" | "scope_defect";

function goldKey(g: ExpectedPrimitiveAction): string {
  return `${g.actionType}|${(g.evidenceContains ?? "").toLowerCase().trim()}|${g.cardFace ?? ""}`;
}

function goldRowKey(caseId: string, gold: ExpectedPrimitiveAction): string {
  return `${caseId}|${gold.actionType}|${gold.evidenceContains}`;
}

function scanReminderDerivedAcceptedGold(cases: OracleActionEvalCaseV2[]) {
  const rows: Array<Record<string, unknown>> = [];
  for (const tc of cases) {
    for (const gold of tc.expectedPrimitiveActions.filter((g) => !g.negative)) {
      const violations = validateGoldAction(tc, gold).filter((v) => v.policyFamily === "reminder_mechanic_definition");
      if (violations.length === 0) continue;
      const semantic = enrichGoldAction(tc, gold);
      rows.push({
        caseId: tc.id,
        cardName: tc.cardName,
        actionType: gold.actionType,
        evidenceContains: gold.evidenceContains,
        semanticOwner: semantic.semanticOwner,
        executionContext: semantic.executionContext,
        cardNativeLayer2Eligible: semantic.cardNativeLayer2Eligible,
        inReminderSpan: semantic.inReminderSpan,
        inTypeLineMechanicReminder: semantic.inTypeLineMechanicReminder,
        violations: violations.map((v) => ({
          code: v.code,
          policyFamily: v.policyFamily,
          reason: v.policyReason,
        })),
        adjudicationVerdict: "invalid_gold",
        note: "Reminder/mechanic span — not card-native Layer-2 under validator v1.6.",
      });
    }
  }
  return rows;
}

function policyValidGold(tc: OracleActionEvalCaseV2): ExpectedPrimitiveAction[] {
  return tc.expectedPrimitiveActions.filter((g) => !g.negative && validateGoldAction(tc, g).length === 0);
}

function classifyGrantedNestedSemantics(
  testCase: OracleActionEvalCaseV2,
  gold: ExpectedPrimitiveAction,
): Record<string, unknown> {
  const semantic = enrichGoldAction(testCase, gold);
  const owner =
    semantic.semanticOwner === "granted_object"
      ? "granted_object"
      : semantic.semanticOwner === "created_object"
        ? "created_object"
        : "source_card";
  const contextFamily =
    semantic.executionContext === "granted_ability"
      ? "granted_ability"
      : semantic.executionContext === "token_definition"
        ? "token_definition"
        : semantic.executionContext === "reminder"
          ? "reminder"
          : semantic.executionContext === "permission"
            ? "static_permission"
            : semantic.executionContext === "replacement_effect"
              ? "replacement_effect"
              : semantic.executionContext === "immediate"
                ? "source_card_resolving_effect"
                : semantic.executionContext;
  return {
    semanticOwner: semantic.semanticOwner,
    ownerBucket: owner,
    executionContext: semantic.executionContext,
    contextFamily,
    clauseRole: semantic.clauseRole,
    abilityType: semantic.abilityType,
    cardNativeLayer2Eligible: semantic.cardNativeLayer2Eligible,
    inReminderSpan: semantic.inReminderSpan,
    inCreatedObjectDefinition: semantic.inCreatedObjectDefinition,
    inGrantedQuotedAbility: semantic.inGrantedQuotedAbility,
    livePolicyViolations: validateGoldAction(testCase, gold).map((v) => v.policyFamily),
  };
}

function classifyReplacementSemantics(
  testCase: OracleActionEvalCaseV2,
  gold: ExpectedPrimitiveAction,
): Record<string, unknown> {
  const semantic = enrichGoldAction(testCase, gold);
  const ev = gold.evidenceContains ?? "";
  const isReplacedEventRef =
    /\bIf you would\b/i.test(ev) && !/\binstead\b/i.test(ev) && gold.actionType !== "exile";
  const isReplacementConsequence =
    /\binstead\b/i.test(ev) || semantic.executionContext === "replacement_effect";
  return {
    ...classifyGrantedNestedSemantics(testCase, gold),
    isReplacedEventReference: isReplacedEventRef,
    isReplacementConsequence,
    replacementLayer:
      isReplacedEventRef && !isReplacementConsequence
        ? "L1_intercepted_event"
        : isReplacementConsequence
          ? "L2_replacement_consequence"
          : "other",
  };
}

function inferrc9FamilyHint(
  row: Record<string, unknown>,
  kind: "fn" | "fp",
): string | undefined {
  const verdict = row.finalVerdict as string;
  if (verdict !== "genuine_parser_fn" && verdict !== "genuine_parser_fp") return undefined;
  const action = (kind === "fn" ? row.expectedAction : row.observedAction) as string;
  const ctx = row.executionContext as string | undefined;
  const owner = row.semanticOwner as string | undefined;
  if (ctx === "granted_ability" || owner === "granted_object") return "granted_nested_extraction";
  if (ctx === "replacement_effect") return "replacement_consequence_extraction";
  if (ctx === "token_definition" || owner === "created_object") return "created_object_boundary";
  if (ctx === "reminder") return "reminder_governance";
  if (ctx === "permission") return "permission_vs_resolving_cast";
  if (action === "discard" && /discard your hand/i.test(String(row.goldEvidence ?? row.observedEvidence ?? ""))) {
    return "imperative_discard_your_hand";
  }
  if (action === "cast") return "immediate_cast_grammar";
  if (action === "mill") return "imperative_mill_lexeme";
  if (action === "return_to_hand") return "cleave_bracket_return";
  if (action === "sacrifice") return "player_subject_sacrifice";
  return `${row.coverageStratum}|${action}`;
}

function diagnoseInvariantFailures(
  cases: OracleActionEvalCaseV2[],
  rawById: Record<string, OracleSemanticParse>,
): Record<string, unknown> {
  const semanticInvalidRecords: Array<Record<string, unknown>> = [];
  const provenanceRecords: Array<Record<string, unknown>> = [];

  for (const tc of cases) {
    const parse = rawById[tc.id];
    const integrity = verifySemanticParseIntegrity(parse, tc.oracleText);

    for (const issue of parse.semanticValidation.issues.filter((i) => i.severity === "invalid")) {
      const action =
        issue.actionId != null
          ? parse.actions.find((a) => a.actionId === issue.actionId)
          : issue.actionIndex != null
            ? parse.actions[issue.actionIndex]
            : undefined;
      semanticInvalidRecords.push({
        caseId: tc.id,
        cardName: tc.cardName,
        oracleText: tc.oracleText,
        actionId: action?.actionId ?? issue.actionId ?? null,
        abilityId: action?.parentAbilityId ?? null,
        segmentAbilityIndex: action?.segmentAbilityIndex ?? null,
        invariantViolated: "semanticInvalid",
        issueCode: issue.code,
        issueMessage: issue.message,
        offendingAstFragment: action
          ? {
              actionType: action.actionType,
              textRole: action.textRole,
              reviewStatus: action.reviewStatus,
              parentAbilityId: action.parentAbilityId,
              modalOptionId: action.modalOptionId,
              evidenceText: action.provenance?.actionSpan?.text ?? null,
            }
          : null,
        evidenceSpan: action?.provenance?.actionSpan ?? null,
        expectedInvariant: "accepted semantic action evidence span must lie within owning ability/option span",
        exactGeneratingParserStage:
          action?.extractionSource === "v1_legacy"
            ? "v1_legacy_primitive_promotion"
            : action?.provenance?.stage ?? "semantic_action_builder",
        affectsScoring: action?.reviewStatus === "accepted",
        structuralCorruption: true,
        note: "Modal nested triggered cost attached to wrong parentAbilityId — span ownership defect.",
      });
    }

    for (const v of integrity.provenanceViolations) {
      const action =
        v.actionIndex != null
          ? parse.actions[v.actionIndex]
          : v.actionId
            ? parse.actions.find((a) => a.actionId === v.actionId)
            : undefined;
      provenanceRecords.push({
        caseId: tc.id,
        cardName: tc.cardName,
        oracleText: tc.oracleText,
        actionId: action?.actionId ?? v.actionId ?? null,
        abilityId: action?.parentAbilityId ?? null,
        segmentAbilityIndex: action?.segmentAbilityIndex ?? null,
        invariantViolated: "provenanceViolation",
        provenanceClass: "semantic_action_evidence_provenance",
        notGitRepositoryProvenance: true,
        violationCode: v.code,
        violationMessage: v.message,
        offendingAstFragment: action
          ? {
              actionType: action.actionType,
              reviewStatus: action.reviewStatus,
              parentAbilityId: action.parentAbilityId,
              evidenceText: action.provenance?.actionSpan?.text ?? null,
              provenance: action.provenance,
            }
          : null,
        evidenceSpan: action?.provenance?.actionSpan ?? v.span ?? null,
        expectedInvariant: "action lineage span must be contained in declared ability/option owner span",
        exactGeneratingParserStage: action?.extractionSource ?? "semantic_action_builder",
        affectsScoring: action?.reviewStatus === "accepted",
        structuralCorruption: true,
      });
    }
  }

  const validatorViolationRecords = semanticInvalidRecords.map((r) => ({
    ...r,
    invariantViolated: "validatorViolation",
    note: "Duplicate counter — same span_outside_owner semantic invalid issue counted as validatorViolation gate.",
  }));

  return {
    summary: {
      semanticInvalid: semanticInvalidRecords.length,
      validatorViolations: validatorViolationRecords.length,
      provenanceViolations: provenanceRecords.length,
      distinctStructuralCases: new Set([
        ...semanticInvalidRecords.map((r) => r.caseId),
        ...provenanceRecords.map((r) => r.caseId),
      ]).size,
      priority: "HIGH — structural span ownership corruption before recall work",
    },
    semanticInvalidRecords,
    validatorViolationRecords,
    provenanceViolationRecords: provenanceRecords,
  };
}

const V16_GRANT_MECHANISMS = [
  "granted_compound_primitive_extraction",
  "granted_nested_activated_mana",
  "granted_subability_not_materialized",
  "granted_variable_draw_not_materialized",
] as const;

function mapRc9PrimaryMechanism(row: Record<string, unknown>): string {
  const stratum = String(row.coverageStratum ?? "");
  const stage = String(row.failureStage ?? "");
  const action = String(row.expectedAction ?? row.observedAction ?? "");
  const verdict = String(row.finalVerdict ?? "");
  if (verdict !== "genuine_parser_fn" && verdict !== "genuine_parser_fp") return `non_parser_${verdict}`;

  if (stratum === "challenge_granted_nested_actions") {
    if (stage === "primitive_extraction") return "grant_span_detection";
    if (stage === "referent_resolution") return "nested_segmentation";
    return "subability_materialization";
  }
  if (stratum === "challenge_immediate_cast_vs_permission") return "immediate_cast_grammar";
  if (stratum === "challenge_replacement") return "replacement_consequence_extraction";
  if (action === "cast") return "cast_play_policy_boundary";
  if (stage === "evaluator") return "evaluator_evidence_mismatch";
  if (stage === "referent_resolution") return "referent_resolution";
  return `${stratum}|${action}|${stage}`;
}

function buildRc9RootCauseLedger(
  fnLedger: Array<Record<string, unknown>>,
  fpLedger: Array<Record<string, unknown>>,
  v17Ledger: Array<{ primaryMechanism?: string; caseId?: string; recurrence?: Record<string, boolean> }>,
): Record<string, unknown> {
  const genuine = [
    ...fnLedger.filter((r) => r.finalVerdict === "genuine_parser_fn"),
    ...fpLedger.filter((r) => r.finalVerdict === "genuine_parser_fp"),
  ];
  const v17Mechanisms = new Set(v17Ledger.map((r) => r.primaryMechanism).filter(Boolean));
  const v17CaseIds = new Set(v17Ledger.map((r) => r.caseId).filter(Boolean));
  const rows = genuine.map((row) => {
    const mechanism = mapRc9PrimaryMechanism(row);
    const caseId = String(row.caseId);
    const v17Analog = caseId.replace("vh18", "vh17");
    const v16Analog = caseId.replace("vh18", "vh16");
    const v17Match =
      v17CaseIds.has(v17Analog) ||
      v17Ledger.some((v) => v.primaryMechanism === mechanism) ||
      v17Mechanisms.has(mechanism);
    const v16Match = v17Ledger.some(
      (v) => v.recurrence?.observedV16 && v.primaryMechanism === mechanism,
    );
    return {
      caseId: row.caseId,
      cardName: row.cardName,
      mismatchKind: row.expectedAction ? "FN" : "FP",
      primitive: row.expectedAction ?? row.observedAction,
      goldEvidence: row.goldEvidence ?? null,
      observedEvidence: row.observedEvidence ?? null,
      coverageStratum: row.coverageStratum,
      failureStage: row.failureStage,
      primaryMechanism: mechanism,
      recurrence: {
        observedV15: false,
        observedV16: v16Match,
        observedV17: v17Match,
        observedV18: true,
      },
      mismatchId: row.mismatchId ?? row.gateFpId,
    };
  });

  const mechanisms = rows.map((r) => r.primaryMechanism);
  const mismatchIds = rows.map((r) => r.mismatchId);
  const duplicateMismatchIds = mismatchIds.filter((id, i) => mismatchIds.indexOf(id) !== i);
  return {
    artifactType: "ValidationRootCauseLedger",
    version: "validation-v18-root-cause-ledger-v1",
    integrity: {
      mappedRows: rows.length,
      expectedRows: genuine.length,
      unclassified: rows.filter((r) => !r.primaryMechanism).length,
      duplicateMismatchAssignment: duplicateMismatchIds.length,
      distinctMechanismFamilies: new Set(mechanisms).size,
      allGenuineMapped: rows.length === genuine.length,
    },
    ledger: rows,
  };
}

function v15GrammarCrossReference(fnLedger: Array<Record<string, unknown>>) {
  return V15_GRAMMAR_GAPS.map((gap) => {
    const hits = fnLedger.filter(
      (r) =>
        r.finalVerdict === "genuine_parser_fn" &&
        r.expectedAction === gap.action &&
        new RegExp(gap.construction.split(" ")[0]!, "i").test(String(r.goldEvidence ?? "")),
    );
    return {
      ...gap,
      v18IndependentRecurrence: hits.length > 0,
      v18Cases: hits.map((r) => r.caseId),
      note:
        hits.length > 0
          ? "Fresh v18 independently exposes same construction."
          : "No independent v18 recurrence.",
    };
  });
}

function evaluateOfficialFpFn(testCase: OracleActionEvalCaseV2, parse: OracleSemanticParse) {
  const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
  const match = matchGoldToSemanticActions({
    expected,
    parse,
    tier: "accepted",
    oracleText: testCase.oracleText,
    caseId: testCase.id,
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

  const fpRows: Array<Record<string, unknown>> = [];
  for (const idx of match.unmatchedActionIndices) {
    const a = actions[idx];
    if (!a || a.reviewStatus !== "accepted") continue;
    if (countParserFalsePositives(testCase, [idx], extracted) === 0) continue;
    fpRows.push({
      caseId: testCase.id,
      cardName: testCase.cardName,
      observedAction: a.actionType,
      observedEvidence: a.evidenceText,
      actionIndex: idx,
      abilityIndex: a.segmentAbilityIndex,
      modalOptionKey: a.modalOptionKey,
      loyaltyCost: a.loyaltyCost,
      executionContext: a.executionContext,
      semanticOwner: a.semanticOwner,
      cardNativeLayer2Eligible: a.cardNativeLayer2Eligible,
      textRole: parse.actions[idx]?.textRole ?? null,
    });
  }

  const fnRows: Array<Record<string, unknown>> = [];
  for (const ei of match.unmatchedExpectedIndices) {
    const gold = expected[ei];
    if (!gold) continue;
    fnRows.push({
      caseId: testCase.id,
      cardName: testCase.cardName,
      expectedAction: gold.actionType,
      goldEvidence: gold.evidenceContains,
      optionalEffect: gold.optionalEffect,
      loyaltyCost: gold.loyaltyCost,
      optionId: gold.optionId,
    });
  }

  return { tp: match.matches.filter((m) => m.matched).length, fpRows, fnRows };
}

function sameTypeEmissions(parse: OracleSemanticParse, actionType: string) {
  return semanticActionsForMatch(parse)
    .filter((a) => a.reviewStatus === "accepted" && a.actionType === actionType)
    .map((a) => ({
      actionType: a.actionType,
      evidence: a.evidenceText,
      executionContext: a.executionContext,
      semanticOwner: a.semanticOwner,
      abilityIndex: a.segmentAbilityIndex,
      textRole: parse.actions[a.index]?.textRole ?? null,
    }));
}

function inferFailureStage(
  parse: OracleSemanticParse,
  gold: ExpectedPrimitiveAction,
): string {
  const sameType = sameTypeEmissions(parse, gold.actionType);
  if (sameType.length === 0) return "primitive_extraction";
  const ev = (gold.evidenceContains ?? "").toLowerCase();
  const hit = sameType.some((a) => a.evidence.toLowerCase().includes(ev.slice(0, Math.min(20, ev.length))));
  if (!hit) return "referent_resolution";
  return "evaluator";
}

function isEldraziTokenDefinitionAddManaGold(testCase: OracleActionEvalCaseV2, gold: ExpectedPrimitiveAction): boolean {
  if (gold.actionType !== "add_mana" || !/Add \{C\}/.test(gold.evidenceContains ?? "")) return false;
  return /\bThey have "[^"]*(?:Sacrifice this (?:token|creature)|Add \{C\})/i.test(testCase.oracleText);
}

function isTokenDefinitionInlineGold(testCase: OracleActionEvalCaseV2, gold: ExpectedPrimitiveAction): boolean {
  const violations = validateGoldAction(testCase, gold);
  return violations.some((v) => v.policyFamily === "token_definition_not_card_native_l2");
}

function structuralTokenCapabilityNote(
  testCase: OracleActionEvalCaseV2,
  gold?: ExpectedPrimitiveAction,
): Record<string, unknown> {
  const withQuote = /\bCreate [^.!\n]{0,160}? tokens? with "/i.test(testCase.oracleText);
  const theyHave = /\bThey have "/i.test(testCase.oracleText);
  const tokenKind = /Nightmare/i.test(testCase.oracleText)
    ? "Nightmare token"
    : /Eldrazi Scion/i.test(testCase.oracleText)
      ? "Eldrazi Scion"
      : /Eldrazi Spawn/i.test(testCase.oracleText)
        ? "Eldrazi Spawn"
        : "created_token";
  const effect =
    gold?.actionType === "put_counter"
      ? "put_counter on this token"
      : gold?.actionType === "add_mana"
        ? "add_mana {C}"
        : gold?.actionType ?? "token_defined_effect";
  return {
    createdObject: tokenKind,
    syntax: withQuote ? "create_tokens_with_quote" : theyHave ? "create_tokens_they_have" : "token_definition",
    definedTriggeredOrActivatedAbility: effect,
    correctSemanticOwner: "created_object",
    correctExecutionContext: "token_definition",
    correctCardNativeLayer2Eligible: false,
    note: "Structural token-defined capability — not a source-card card-native L2 action.",
  };
}

function adjudicateFn(
  testCase: OracleActionEvalCaseV2,
  gold: ExpectedPrimitiveAction,
  parse: OracleSemanticParse,
): { finalVerdict: FnVerdict; policyClass: string; reason: string; rc9FamilyHint?: string } {
  const livePolicyViolations = validateGoldAction(testCase, gold);
  if (livePolicyViolations.length > 0) {
    const family = livePolicyViolations[0]!.policyFamily;
    if (family === "wrong_primitive_label" || family === "target_assignment_not_copy") {
      return {
        finalVerdict: "wrong_primitive_gold",
        policyClass: family,
        reason: livePolicyViolations[0]!.policyReason,
      };
    }
    return {
      finalVerdict: "invalid_gold",
      policyClass: family,
      reason: livePolicyViolations[0]!.policyReason,
    };
  }

  const stratum = testCase.coverageStratum ?? "";
  const ev = gold.evidenceContains ?? "";
  const oracle = testCase.oracleText;
  const semantic = enrichGoldAction(testCase, gold);

  if (isEldraziTokenDefinitionAddManaGold(testCase, gold) || isTokenDefinitionInlineGold(testCase, gold)) {
    return {
      finalVerdict: "invalid_gold",
      policyClass: "token_definition_not_card_native_l2",
      reason:
        "Token definition quoted ability defines created-object capability — not source-card card-native Layer-2.",
      rc9FamilyHint: undefined,
    };
  }

  if (gold.actionType === "return_to_battlefield" && /to your hand/i.test(ev)) {
    return {
      finalVerdict: "wrong_primitive_gold",
      policyClass: "wrong_primitive_label",
      reason: "Gold labels return_to_battlefield but evidence describes gy→hand (return_to_hand).",
      rc9FamilyHint: "saga_planeswalker_semantics",
    };
  }

  if (gold.actionType === "play" && /play lands?/i.test(ev)) {
    return {
      finalVerdict: "invalid_gold",
      policyClass: "static_play_permission_layer1",
      reason: "Play lands permission — Layer-1 static permission, not resolving L2 play action.",
      rc9FamilyHint: "library_movement_distinction",
    };
  }

  if (gold.actionType === "play" && /You may play that card/i.test(ev)) {
    return {
      finalVerdict: "invalid_gold",
      policyClass: "cast_play_permission_layer1",
      reason: "Granted play permission on exiled/card reference — L1 permission, not resolving L2 play.",
      rc9FamilyHint: "granted_nested_generalization",
    };
  }

  if (gold.actionType === "cast") {
    if (/you may cast[^.]*without paying its mana cost/i.test(ev)) {
      return {
        finalVerdict: "genuine_parser_fn",
        policyClass: "one_shot_cast_without_paying",
        reason: "One-shot cast without paying mana cost — valid resolving L2 cast in triggered/immediate effect clause.",
        rc9FamilyHint: "immediate_cast_grammar",
      };
    }
    if (/cast (?:instant and sorcery|creature spells from|spells with the chosen name|if you control)/i.test(ev)) {
      return {
        finalVerdict: "invalid_gold",
        policyClass: "cast_play_permission_layer1",
        reason: "Static or conditional cast permission — L1 permission grammar, not one-shot resolving cast.",
        rc9FamilyHint: stratum.includes("immediate_cast")
          ? "immediate_cast_grammar"
          : "triggered_compound_grammar",
      };
    }
    if (/cast more than one spell each turn/i.test(ev)) {
      return {
        finalVerdict: "invalid_gold",
        policyClass: "static_restriction_layer1",
        reason: "Static restriction on casting frequency — L1 permission/restriction, not resolving cast.",
        rc9FamilyHint: "cast_play_permission_boundary",
      };
    }
    if (/cast spells of the chosen type/i.test(ev)) {
      return {
        finalVerdict: "invalid_gold",
        policyClass: "cast_play_permission_layer1",
        reason: "Conditional cast permission on chosen type — L1 static permission.",
        rc9FamilyHint: "cast_play_permission_boundary",
      };
    }
    if (/cast this way would be put into your graveyard/i.test(ev)) {
      return {
        finalVerdict: "invalid_gold",
        policyClass: "replacement_event_reference",
        reason: "Cast reference inside replacement intercept — L1 replaced-event reference, not resolving cast.",
        rc9FamilyHint: "replacement_event_reference",
      };
    }
    if (/cast spells or activate abilities that aren't mana abilities/i.test(ev)) {
      return {
        finalVerdict: "invalid_gold",
        policyClass: "static_restriction_layer1",
        reason: "Replacement/static restriction on casting — not a resolving cast primitive.",
        rc9FamilyHint: "replacement_effect_parsing",
      };
    }
    if (/cast an Ally spell/i.test(ev) && /Whenever you cast/i.test(oracle)) {
      return {
        finalVerdict: "invalid_gold",
        policyClass: "trigger_event_reference",
        reason: "Cast reference inside trigger condition — L1 trigger event, not resolving cast.",
        rc9FamilyHint: "triggered_compound_grammar",
      };
    }
    const castAdj = classifyCastGold({ testCase, gold });
    if (castAdj.verdict === "valid_layer2_gold") {
      const oneShot = isOneShotCastPermission(oracle, 0, ev);
      const persistent = isPersistentZoneCastPermission(ev);
      if (persistent && !oneShot) {
        return {
          finalVerdict: "invalid_gold",
          policyClass: "cast_play_permission_layer1",
          reason: "Persistent zone cast permission — L1, not one-shot L2 cast.",
          rc9FamilyHint: "immediate_cast_grammar",
        };
      }
      return {
        finalVerdict: "genuine_parser_fn",
        policyClass: castAdj.castPolicyClass,
        reason: castAdj.policyReason,
        rc9FamilyHint: stratum.includes("immediate_cast")
          ? "immediate_cast_grammar"
          : stratum.includes("granted")
            ? "granted_nested_generalization"
            : "triggered_compound_grammar",
      };
    }
    if (castAdj.verdict === "evaluator_evidence_mismatch") {
      return {
        finalVerdict: "evaluator_defect",
        policyClass: castAdj.castPolicyClass,
        reason: castAdj.policyReason,
      };
    }
    return {
      finalVerdict: "invalid_gold",
      policyClass: castAdj.castPolicyClass,
      reason: castAdj.policyReason,
    };
  }

  if (gold.actionType === "draw" && /draw step|draw an additional/i.test(ev)) {
    return {
      finalVerdict: "invalid_gold",
      policyClass: "trigger_event_reference",
      reason: "Draw reference embedded in trigger/step condition — not resolving effect draw.",
      rc9FamilyHint: "triggered_compound_grammar",
    };
  }

  if (gold.actionType === "sacrifice" || gold.actionType === "discard") {
    const row = classifySacrificeDiscardGold({ testCase, gold });
    if (row.verdict === "valid_layer2_gold") {
      return {
        finalVerdict: "genuine_parser_fn",
        policyClass: row.policyClass,
        reason: row.policyReason,
        rc9FamilyHint: "player_subject_imperative_extraction",
      };
    }
    if (row.verdict === "evaluator_evidence_mismatch") {
      return { finalVerdict: "evaluator_defect", policyClass: row.policyClass, reason: row.policyReason };
    }
    return { finalVerdict: "invalid_gold", policyClass: row.policyClass, reason: row.policyReason };
  }

  if (stratum === "challenge_granted_nested_actions") {
    if (gold.actionType === "add_mana" && /Add \{/.test(ev)) {
      return {
        finalVerdict: "genuine_parser_fn",
        policyClass: "nested_granted_mana_ability",
        reason: "Nested granted activated mana ability — valid L2; parser failed nested extraction.",
        rc9FamilyHint: "granted_nested_generalization",
      };
    }
    if (gold.actionType === "draw" && /draw a card/i.test(ev)) {
      return {
        finalVerdict: "genuine_parser_fn",
        policyClass: "nested_granted_triggered_effect",
        reason: "Nested granted triggered draw — valid L2; parser failed nested extraction.",
        rc9FamilyHint: "granted_nested_generalization",
      };
    }
  }

  if (gold.actionType === "put_counter") {
    const emissions = sameTypeEmissions(parse, "put_counter");
    if (emissions.length > 0) {
      return {
        finalVerdict: "evaluator_defect",
        policyClass: "evaluator_evidence_mismatch",
        reason: "Parser emitted put_counter but evaluator did not match gold evidence span.",
        rc9FamilyHint: "saga_planeswalker_semantics",
      };
    }
    return {
      finalVerdict: "genuine_parser_fn",
      policyClass: "resolving_effect_layer2",
      reason: "Put counter resolving effect — valid L2; no accepted emission.",
      rc9FamilyHint: "saga_planeswalker_semantics",
    };
  }

  if (gold.actionType === "add_mana" && /Add \{/.test(ev)) {
    return {
      finalVerdict: "genuine_parser_fn",
      policyClass: "resolving_effect_layer2",
      reason: "Add mana resolving effect — valid L2.",
      rc9FamilyHint: stratum.includes("granted") ? "granted_nested_generalization" : undefined,
    };
  }
  if (gold.actionType === "draw" && /draw/i.test(ev)) {
    const emissions = sameTypeEmissions(parse, "draw");
    if (emissions.length > 0) {
      return {
        finalVerdict: "evaluator_defect",
        policyClass: "evaluator_evidence_mismatch",
        reason: "Parser emitted draw but gold evidence span did not match.",
        rc9FamilyHint: "mdfc_face_provenance",
      };
    }
    return {
      finalVerdict: "genuine_parser_fn",
      policyClass: "resolving_effect_layer2",
      reason: "Draw effect — valid L2.",
    };
  }
  if (gold.actionType === "mill" && /\bmill/i.test(ev)) {
    return {
      finalVerdict: "genuine_parser_fn",
      policyClass: "resolving_effect_layer2",
      reason: "Mill effect — valid L2.",
      rc9FamilyHint: "mdfc_face_provenance",
    };
  }
  if (gold.actionType === "deal_damage" && /deals? \d+ damage/i.test(ev)) {
    return {
      finalVerdict: "genuine_parser_fn",
      policyClass: "resolving_effect_layer2",
      reason: "Damage effect — valid L2.",
      rc9FamilyHint: "mdfc_face_provenance",
    };
  }
  if (gold.actionType === "return_to_hand" && /return target/i.test(ev)) {
    return {
      finalVerdict: "genuine_parser_fn",
      policyClass: "resolving_effect_layer2",
      reason: "Return to hand resolving effect — valid L2.",
      rc9FamilyHint: "zone_transition_effects",
    };
  }
  if (gold.actionType === "shuffle_into_library" && /shuffle/i.test(ev)) {
    return {
      finalVerdict: "genuine_parser_fn",
      policyClass: "resolving_effect_layer2",
      reason: "Shuffle into library — valid L2.",
      rc9FamilyHint: "saga_planeswalker_semantics",
    };
  }

  if (semantic.executionContext === "permission" && semantic.cardNativeLayer2Eligible === false) {
    return {
      finalVerdict: "invalid_gold",
      policyClass: "permission_context_layer1",
      reason: "Semantic enrichment marks permission context — not card-native L2.",
    };
  }

  const stage = inferFailureStage(parse, gold);
  if (stage === "evaluator") {
    return {
      finalVerdict: "evaluator_defect",
      policyClass: "evaluator_evidence_mismatch",
      reason: "Same-type emission present but official matcher missed gold evidence.",
    };
  }

  return {
    finalVerdict: "genuine_parser_fn",
    policyClass: "resolving_effect_layer2",
    reason: `Valid L2 ${gold.actionType} — parser missing emission (${stage}).`,
    rc9FamilyHint: stratum.includes("granted")
      ? "granted_nested_generalization"
      : stratum.includes("immediate_cast")
        ? "immediate_cast_grammar"
        : stratum.includes("library")
          ? "library_movement_distinction"
          : stratum.includes("saga") || stratum.includes("planeswalker")
            ? "saga_planeswalker_semantics"
            : "triggered_compound_grammar",
  };
}

function adjudicateFp(
  testCase: OracleActionEvalCaseV2,
  observedAction: string,
  observedEvidence: string,
): {
  finalVerdict: FpVerdict;
  policyClass: string;
  reason: string;
  recommendedGoldAddition?: ExpectedPrimitiveAction;
} {
  const blind = adjudicateOfficialFpGoldCompleteness({
    testCase,
    actionType: observedAction,
    evidenceContains: observedEvidence,
    abilityType: "unknown",
  });

  if (blind.verdict === "missing_gold") {
    return {
      finalVerdict: "missing_gold",
      policyClass: "missing_gold_label",
      reason: blind.policyReason,
      recommendedGoldAddition: blind.recommendedGoldAddition,
    };
  }
  if (blind.verdict === "evaluator_defect") {
    return { finalVerdict: "evaluator_defect", policyClass: "evaluator", reason: blind.policyReason };
  }
  if (blind.verdict === "out_of_scope_emission") {
    return { finalVerdict: "scope_defect", policyClass: "scope", reason: blind.policyReason };
  }

  if (observedAction === "cast" && /You may cast this /i.test(observedEvidence)) {
    return {
      finalVerdict: "scope_defect",
      policyClass: "cast_play_permission_layer1",
      reason: "Flash/alternate cast permission fragment — L1 permission emission should not score as L2 FP.",
    };
  }

  if (observedAction === "play" && /You may play it this turn/i.test(observedEvidence)) {
    return {
      finalVerdict: "missing_gold",
      policyClass: "missing_gold_label",
      reason: "Temporary play permission resolving clause — gold omits legitimate L2 play permission effect.",
      recommendedGoldAddition: {
        actionType: "play",
        evidenceContains: observedEvidence,
      } as ExpectedPrimitiveAction,
    };
  }

  if (observedAction === "copy" && /copy (?:it|target)/i.test(observedEvidence)) {
    const hasCopyGold = testCase.expectedPrimitiveActions.some(
      (g) => !g.negative && g.actionType === "copy" && /copy/i.test(g.evidenceContains ?? ""),
    );
    if (!hasCopyGold) {
      return {
        finalVerdict: "missing_gold",
        policyClass: "missing_gold_label",
        reason: "Copy effect emission lacks matching gold row.",
        recommendedGoldAddition: {
          actionType: "copy",
          evidenceContains: observedEvidence.slice(0, 80),
        } as ExpectedPrimitiveAction,
      };
    }
  }

  if (observedAction === "create_token" && /create two tapped/i.test(observedEvidence)) {
    return {
      finalVerdict: "evaluator_defect",
      policyClass: "evaluator_evidence_mismatch",
      reason: "Parser emission may match gold with relaxed evidence — evaluator defect suspected.",
    };
  }

  if (observedAction === "add_mana" && /Add one mana of any color/i.test(observedEvidence)) {
    const hasGold = testCase.expectedPrimitiveActions.some(
      (g) => !g.negative && g.actionType === "add_mana" && /Add one mana/i.test(g.evidenceContains ?? ""),
    );
    if (hasGold) {
      return {
        finalVerdict: "evaluator_defect",
        policyClass: "evaluator_evidence_mismatch",
        reason: "Gold exists for add_mana but official matcher missed — evaluator defect.",
      };
    }
    return {
      finalVerdict: "missing_gold",
      policyClass: "missing_gold_label",
      reason: "Activated mana ability emission lacks matching gold label.",
      recommendedGoldAddition: {
        actionType: "add_mana",
        evidenceContains: observedEvidence.slice(0, 80),
      } as ExpectedPrimitiveAction,
    };
  }

  if (observedAction === "sacrifice" && /Sacrifice this (Case|enchantment)/i.test(observedEvidence)) {
    return {
      finalVerdict: "missing_gold",
      policyClass: "missing_gold_label",
      reason: "Case/enchantment sacrifice cost/effect lacks gold label.",
      recommendedGoldAddition: {
        actionType: "sacrifice",
        evidenceContains: observedEvidence,
      } as ExpectedPrimitiveAction,
    };
  }

  return { finalVerdict: "genuine_parser_fp", policyClass: "parser", reason: blind.policyReason };
}

function main() {
  mkdirSync(resolve(OUT_DIR), { recursive: true });

  const envelope = JSON.parse(readFileSync(V18_PATH, "utf8")) as {
    contentHash: string;
    cases: OracleActionEvalCaseV2[];
    parserExecutionCount: number;
  };
  const raw = JSON.parse(readFileSync(RAW_PATH, "utf8")) as {
    cases: Array<{ caseId: string; semanticParse: OracleSemanticParse }>;
  };
  const cert = JSON.parse(readFileSync(CERT_PATH, "utf8"));
  const corr = JSON.parse(readFileSync(CORR_PATH, "utf8"));
  const freeze = JSON.parse(readFileSync(FREEZE_PATH, "utf8"));

  if (envelope.parserExecutionCount !== 0) {
    throw new Error("v18 benchmark envelope must remain sealed (parserExecutionCount=0)");
  }
  const execRecord = JSON.parse(readFileSync(EXEC_RECORD_PATH, "utf8")) as {
    parserExecutionCountAfter: number;
    datasetHash: string;
  };
  if (execRecord.parserExecutionCountAfter !== 1) {
    throw new Error("v18 execution record must show parserExecutionCountAfter=1");
  }
  if (execRecord.datasetHash !== envelope.contentHash) {
    throw new Error("v18 execution record datasetHash != benchmark contentHash");
  }

  const rawById = Object.fromEntries(raw.cases.map((c) => [c.caseId, c.semanticParse]));
  const caseById = Object.fromEntries(envelope.cases.map((c) => [c.id, c]));
  const policyStackPinned = computeGoldPolicyStackHashes();

  const liveValidation = validateBenchmarkGoldPolicy({
    cases: envelope.cases,
    benchmarkHash: envelope.contentHash,
    benchmarkPath: V18_PATH,
  });

  const allFp: Array<Record<string, unknown>> = [];
  const allFn: Array<Record<string, unknown>> = [];
  let tp = 0;
  for (const tc of envelope.cases) {
    const parse = rawById[tc.id];
    const { tp: t, fpRows, fnRows } = evaluateOfficialFpFn(tc, parse);
    tp += t;
    allFp.push(...fpRows);
    allFn.push(...fnRows);
  }

  if (allFp.length !== OFFICIAL.fp) throw new Error(`FP row count ${allFp.length} !== ${OFFICIAL.fp}`);
  if (allFn.length !== OFFICIAL.fn) throw new Error(`FN row count ${allFn.length} !== ${OFFICIAL.fn}`);
  if (tp !== OFFICIAL.tp) throw new Error(`TP ${tp} !== ${OFFICIAL.tp}`);

  const fnLedger = allFn.map((row) => {
    const tc = caseById[row.caseId as string];
    const gold = tc.expectedPrimitiveActions.find(
      (g) => !g.negative && g.actionType === row.expectedAction && g.evidenceContains === row.goldEvidence,
    )!;
    const parse = rawById[row.caseId as string];
    const semantic = enrichGoldAction(tc, gold);
    const adj = adjudicateFn(tc, gold, parse);
    const emissions = semanticActionsForMatch(parse)
      .filter((a) => a.reviewStatus === "accepted")
      .map((a) => ({
        actionType: a.actionType,
        evidence: a.evidenceText,
        executionContext: a.executionContext,
        semanticOwner: a.semanticOwner,
        textRole: parse.actions[a.index]?.textRole ?? null,
      }));
    return {
      mismatchId: createHash("sha256")
        .update(`${row.caseId}|${row.expectedAction}|${row.goldEvidence}`)
        .digest("hex")
        .slice(0, 16),
      ...row,
      oracleClause: gold.evidenceContains,
      expectedPrimitive: gold.actionType,
      clauseRole: semantic.clauseRole,
      abilityType: semantic.abilityType,
      semanticOwner: semantic.semanticOwner,
      executionContext: semantic.executionContext,
      cardNativeLayer2Eligible: semantic.cardNativeLayer2Eligible,
      parserEmissions: emissions,
      failureStage: inferFailureStage(parse, gold),
      caseScope: tc.caseScope,
      coverageStratum: tc.coverageStratum,
      finalVerdict: adj.finalVerdict,
      policyClass: adj.policyClass,
      adjudicationReason: adj.reason,
      rc9FamilyHint: adj.rc9FamilyHint ?? inferrc9FamilyHint({ ...row, finalVerdict: adj.finalVerdict, semanticOwner: semantic.semanticOwner, executionContext: semantic.executionContext }, "fn") ?? null,
      livePolicyViolationFamilies: validateGoldAction(tc, gold).map((v) => v.policyFamily),
      validatorGapNote:
        isEldraziTokenDefinitionAddManaGold(tc, gold) && validateGoldAction(tc, gold).length === 0
          ? "Live validator missed token-definition add_mana (pre-v1.5 created-object plural detection)."
          : isTokenDefinitionInlineGold(tc, gold) && validateGoldAction(tc, gold).length === 0
            ? "Live validator missed create-with-quote token definition (pre-v1.6 inline quote detection)."
            : null,
      structuralSemanticTarget:
        isEldraziTokenDefinitionAddManaGold(tc, gold) || isTokenDefinitionInlineGold(tc, gold)
          ? structuralTokenCapabilityNote(tc, gold)
          : null,
    };
  });

  const fpLedger = allFp.map((row) => {
    const tc = caseById[row.caseId as string];
    const adj = adjudicateFp(tc, row.observedAction as string, row.observedEvidence as string);
    return {
      gateFpId: `${row.caseId}|${row.observedAction}|${row.observedEvidence}|${row.actionIndex}`,
      ...row,
      oracleTextExcerpt: tc.oracleText.slice(0, 200),
      goldActions: tc.expectedPrimitiveActions.filter((g) => !g.negative).map((g) => ({
        actionType: g.actionType,
        evidenceContains: g.evidenceContains,
      })),
      caseScope: tc.caseScope,
      coverageStratum: tc.coverageStratum,
      finalVerdict: adj.finalVerdict,
      policyClass: adj.policyClass,
      adjudicationReason: adj.reason,
      rc9FamilyHint: inferrc9FamilyHint({ ...row, finalVerdict: adj.finalVerdict }, "fp") ?? null,
      recommendedGoldAddition: adj.recommendedGoldAddition,
    };
  });

  const fnIds = new Set(fnLedger.map((r) => r.mismatchId));
  const fpIds = new Set(fpLedger.map((r) => r.gateFpId));
  if (fnLedger.length !== 27 || fnIds.size !== 27) throw new Error("FN ledger integrity failed");
  if (fpLedger.length !== 10 || fpIds.size !== 10) throw new Error("FP ledger integrity failed");

  const unsupportedFn = fnLedger.filter((r) => r.finalVerdict === "unsupported");
  if (unsupportedFn.length > 0) throw new Error(`unclassified FN rows: ${unsupportedFn.length}`);

  const reminderDerivedGoldAudit = scanReminderDerivedAcceptedGold(envelope.cases);
  const invalidReminderGoldKeys = new Set(
    reminderDerivedGoldAudit.map(
      (r) => `${r.caseId}|${r.actionType}|${r.evidenceContains}`,
    ),
  );

  const invalidGoldFnKeys = new Set(
    fnLedger
      .filter((r) => r.finalVerdict === "invalid_gold" || r.finalVerdict === "wrong_primitive_gold")
      .map((r) => `${r.caseId}|${r.expectedAction}|${r.goldEvidence}`),
  );
  const missingGoldAdds = fpLedger.filter((r) => r.finalVerdict === "missing_gold" && r.recommendedGoldAddition);

  let diagTp = 0;
  let diagFp = 0;
  let diagFn = 0;
  for (const tc of envelope.cases) {
    const parse = rawById[tc.id];
    const filteredGold = tc.expectedPrimitiveActions.filter((g) => {
      if (g.negative) return true;
      const key = goldRowKey(tc.id, g);
      return !invalidGoldFnKeys.has(key) && !invalidReminderGoldKeys.has(key);
    });
    const additions = missingGoldAdds.filter((r) => r.caseId === tc.id).map((r) => r.recommendedGoldAddition!);
    const adjustedCase = { ...tc, expectedPrimitiveActions: [...filteredGold.filter((g) => !g.negative), ...additions] };
    const { tp: t, fpRows, fnRows } = evaluateOfficialFpFn(adjustedCase, parse);
    diagTp += t;
    diagFp += fpRows.length;
    diagFn += fnRows.length;
  }
  const diagPrecision = diagTp + diagFp > 0 ? diagTp / (diagTp + diagFp) : 1;
  const diagRecall = diagTp + diagFn > 0 ? diagTp / (diagTp + diagFn) : 1;
  const correctedDenominator = diagTp + diagFn;

  const genuineParserFn = fnLedger.filter((r) => r.finalVerdict === "genuine_parser_fn");
  const genuineParserFp = fpLedger.filter((r) => r.finalVerdict === "genuine_parser_fp");
  const invalidGoldFn = fnLedger.filter((r) => r.finalVerdict === "invalid_gold");
  const wrongPrimitiveFn = fnLedger.filter((r) => r.finalVerdict === "wrong_primitive_gold");
  const evaluatorFn = fnLedger.filter((r) => r.finalVerdict === "evaluator_defect");
  const missingGoldFp = fpLedger.filter((r) => r.finalVerdict === "missing_gold");
  const evaluatorFp = fpLedger.filter((r) => r.finalVerdict === "evaluator_defect");

  const familyCensus: Record<string, number> = {};
  for (const r of genuineParserFn) {
    const hint = (r.rc9FamilyHint as string) ?? `${r.coverageStratum}|${r.expectedAction}`;
    familyCensus[hint] = (familyCensus[hint] ?? 0) + 1;
  }
  for (const r of genuineParserFp) {
    const hint = (r.rc9FamilyHint as string) ?? `${r.coverageStratum}|${r.observedAction}`;
    familyCensus[`FP:${hint}`] = (familyCensus[`FP:${hint}`] ?? 0) + 1;
  }

  const grantedNestedFnRows = fnLedger.filter((r) => r.coverageStratum === "challenge_granted_nested_actions");
  const grantedNestedSemanticAudit = grantedNestedFnRows.map((row) => {
    const tc = caseById[row.caseId as string];
    const gold = tc.expectedPrimitiveActions.find(
      (g) => !g.negative && g.actionType === row.expectedAction && g.evidenceContains === row.goldEvidence,
    )!;
    const semantics = classifyGrantedNestedSemantics(tc, gold);
    return {
      caseId: row.caseId,
      cardName: row.cardName,
      expectedAction: row.expectedAction,
      goldEvidence: row.goldEvidence,
      finalVerdict: row.finalVerdict,
      failureStage: row.failureStage,
      ...semantics,
      adjudicationNote:
        semantics.ownerBucket === "granted_object" && semantics.contextFamily === "granted_ability"
          ? row.finalVerdict === "genuine_parser_fn"
            ? "Likely real granted-rule extraction miss — RC8 structural family candidate."
            : "Granted semantics but non-parser verdict — review gold/policy."
          : semantics.ownerBucket === "created_object" || semantics.contextFamily === "token_definition"
            ? "Created-object/token definition — fix gold/policy, not grant detector."
            : semantics.contextFamily === "reminder"
              ? "Reminder definition — gold/policy issue."
              : semantics.contextFamily === "static_permission"
                ? "Static permission — gold/policy L1 issue."
                : "Source-card resolving effect under granted stratum label — semantic not grant miss.",
    };
  });

  const replacementFnRows = fnLedger.filter((r) => r.coverageStratum === "challenge_replacement");
  const replacementSemanticAudit = replacementFnRows.map((row) => {
    const tc = caseById[row.caseId as string];
    const gold = tc.expectedPrimitiveActions.find(
      (g) => !g.negative && g.actionType === row.expectedAction && g.evidenceContains === row.goldEvidence,
    )!;
    const semantics = classifyReplacementSemantics(tc, gold);
    return {
      caseId: row.caseId,
      cardName: row.cardName,
      expectedAction: row.expectedAction,
      goldEvidence: row.goldEvidence,
      finalVerdict: row.finalVerdict,
      failureStage: row.failureStage,
      ...semantics,
      adjudicationNote:
        semantics.replacementLayer === "L1_intercepted_event"
          ? "Replaced-event reference in gold — invalid_gold/policy, not parser grammar expansion."
          : semantics.replacementLayer === "L2_replacement_consequence" && row.finalVerdict === "genuine_parser_fn"
            ? "Legitimate replacement consequence miss — RC8 replacement family candidate."
            : row.finalVerdict === "invalid_gold"
              ? "Gold labels non-consequence under replacement policy."
              : "Parser-blind semantic adjudication required before RC8 replacement work.",
    };
  });

  const policyBucketFnRows = fnLedger.filter((r) => String(r.coverageStratum ?? "").startsWith("policy_"));
  const policyBucketAudit = policyBucketFnRows.map((row) => {
    const tc = caseById[row.caseId as string];
    const gold = tc.expectedPrimitiveActions.find(
      (g) => !g.negative && g.actionType === row.expectedAction && g.evidenceContains === row.goldEvidence,
    )!;
    const semantics = enrichGoldAction(tc, gold);
    const liveViolations = validateGoldAction(tc, gold);
    return {
      caseId: row.caseId,
      cardName: row.cardName,
      expectedAction: row.expectedAction,
      goldEvidence: row.goldEvidence,
      finalVerdict: row.finalVerdict,
      failureStage: row.failureStage,
      clauseRole: semantics.clauseRole,
      executionContext: semantics.executionContext,
      semanticOwner: semantics.semanticOwner,
      cardNativeLayer2Eligible: semantics.cardNativeLayer2Eligible,
      livePolicyViolationFamilies: liveViolations.map((v) => v.policyFamily),
      validatorGapNote:
        liveViolations.length === 0 && row.finalVerdict !== "genuine_parser_fn"
          ? "Certified clean but forensic invalid — possible validator rule gap."
          : liveViolations.length === 0 && row.finalVerdict === "genuine_parser_fn"
            ? "Certified clean; genuine parser miss despite zero leakage."
            : null,
    };
  });

  const policyBucketFpRows = fpLedger.filter((r) => String(r.coverageStratum ?? "").startsWith("policy_"));
  const policyBucketMismatchAudit = {
    fnCount: policyBucketFnRows.length,
    fpCount: policyBucketFpRows.length,
    fnRows: policyBucketAudit,
    fpRows: policyBucketFpRows.map((row) => ({
      caseId: row.caseId,
      cardName: row.cardName,
      observedAction: row.observedAction,
      observedEvidence: row.observedEvidence,
      finalVerdict: row.finalVerdict,
      policyClass: row.policyClass,
      adjudicationReason: row.adjudicationReason,
      coverageStratum: row.coverageStratum,
      validatorGapNote:
        row.finalVerdict === "genuine_parser_fp"
          ? "Certified clean but parser FP under policy stratum — inspect semantic rule gap."
          : null,
    })),
  };

  const proposedRc9Families = Object.entries(familyCensus)
    .filter(([k]) => !k.startsWith("FP:"))
    .map(([family, count]) => ({
      family: family.replace(/^FP:/, ""),
      genuineParserFn: count,
      genuineParserFp: familyCensus[`FP:${family.replace(/^FP:/, "")}`] ?? 0,
      status: "proposed_wait_rc8_authorization",
      auditCases: genuineParserFn.filter((r) => (r.rc9FamilyHint as string) === family).map((r) => r.caseId),
    }))
    .filter((f) => f.genuineParserFn + f.genuineParserFp > 0)
    .sort((a, b) => b.genuineParserFn + b.genuineParserFp - (a.genuineParserFn + a.genuineParserFp));

  const v15GrammarRecurrence = v15GrammarCrossReference(fnLedger);
  const invariantDiagnosis = diagnoseInvariantFailures(envelope.cases, rawById);
  const v17RootCause = JSON.parse(readFileSync(V17_ROOT_CAUSE_PATH, "utf8")) as {
    ledger: Array<{ primaryMechanism?: string; caseId?: string; recurrence?: Record<string, boolean> }>;
  };
  const rc9RootCauseLedger = buildRc9RootCauseLedger(fnLedger, fpLedger, v17RootCause.ledger ?? []);

  const castPlayFnRows = fnLedger.filter((r) => r.coverageStratum === "challenge_immediate_cast_vs_permission");
  const castPlayAudit = castPlayFnRows.map((row) => {
    const tc = caseById[row.caseId as string];
    const gold = tc.expectedPrimitiveActions.find(
      (g) => !g.negative && g.actionType === row.expectedAction && g.evidenceContains === row.goldEvidence,
    )!;
    const castAdj = classifyCastGold({ testCase: tc, gold });
    const oneShot = isOneShotCastPermission(tc.oracleText, 0, gold.evidenceContains ?? "");
    const persistent = isPersistentZoneCastPermission(gold.evidenceContains ?? "");
    return {
      caseId: row.caseId,
      cardName: row.cardName,
      goldEvidence: row.goldEvidence,
      finalVerdict: row.finalVerdict,
      castPolicyClass: castAdj.castPolicyClass,
      castAdjudicationVerdict: castAdj.verdict,
      oneShotCastGrammar: oneShot,
      persistentZonePermission: persistent,
      layerExpectation:
        castAdj.verdict === "valid_layer2_gold" && oneShot && !persistent
          ? "L2_immediate_resolving_cast"
          : persistent || castAdj.verdict !== "valid_layer2_gold"
            ? "L1_permission_or_invalid_gold"
            : "review",
      parserDebtOnlyIf: "finalVerdict=genuine_parser_fn AND layerExpectation=L2_immediate_resolving_cast",
      aishaStyleRecurrence: /cast (?:it|that spell)/i.test(gold.evidenceContains ?? ""),
    };
  });

  const conditionalFnRows = fnLedger.filter(
    (r) =>
      /\bthen\b/i.test(String(r.goldEvidence ?? "")) ||
      /if you do/i.test(String(r.goldEvidence ?? "")) ||
      r.coverageStratum === "broad_compound",
  );
  const conditionalSequentialAudit = conditionalFnRows.map((row) => ({
    caseId: row.caseId,
    cardName: row.cardName,
    goldEvidence: row.goldEvidence,
    finalVerdict: row.finalVerdict,
    failureStage: row.failureStage,
    rc6PromotionCandidate: /\bthen\b/i.test(String(row.goldEvidence ?? "")) || /if you do/i.test(String(row.goldEvidence ?? "")),
    failureBucket:
      row.finalVerdict !== "genuine_parser_fn"
        ? "gold_or_policy"
        : row.failureStage === "referent_resolution"
          ? "referent_resolution"
          : row.failureStage === "primitive_extraction"
            ? "primitive_extraction"
            : "promotion_or_segmentation",
  }));

  const grantedV16MechanismRecurrence = grantedNestedSemanticAudit
    .filter((r) => r.finalVerdict === "genuine_parser_fn")
    .map((row) => {
      const mechanism = mapRc9PrimaryMechanism({ ...row, coverageStratum: "challenge_granted_nested_actions" });
      return {
        caseId: row.caseId,
        mechanism,
        v16MechanismRecurrence: V16_GRANT_MECHANISMS.includes(
          mechanism as (typeof V16_GRANT_MECHANISMS)[number],
        ),
        contextFamily: row.contextFamily,
        semanticOwner: row.semanticOwner,
        executionContext: row.executionContext,
        cardNativeLayer2Eligible: row.cardNativeLayer2Eligible,
      };
    });

  const artifact = {
    artifactType: "ValidationForensicAdjudication",
    version: "validation-v18-forensic-adjudication-v1",
    frozen: true,
    frozenAt: new Date().toISOString(),
    policyStackPinned,
    officialV18: OFFICIAL,
    goldPolicyAtCertification: {
      violations: cert.violations,
      benchmarkHash: cert.benchmarkHash,
      stackCompositeHash: cert.policyStack.stackCompositeHash,
      liveViolationsNow: liveValidation.violations.length,
    },
    denominatorReconciliation: {
      prePolicyL2: freeze.validationV18?.prePolicyLayer2GoldPrimitiveCount ?? corr.prePolicyL2,
      certifiedL2: freeze.validationV18?.layer2GoldPrimitiveCount ?? corr.certifiedL2,
      officialScoredDenominator: OFFICIAL.goldDenominator,
    },
    fnLedger: {
      rowCount: fnLedger.length,
      partition: fnLedger.reduce<Record<string, number>>((a, r) => {
        a[r.finalVerdict] = (a[r.finalVerdict] ?? 0) + 1;
        return a;
      }, {}),
      rows: fnLedger,
    },
    fpLedger: {
      rowCount: fpLedger.length,
      partition: fpLedger.reduce<Record<string, number>>((a, r) => {
        a[r.finalVerdict] = (a[r.finalVerdict] ?? 0) + 1;
        return a;
      }, {}),
      rows: fpLedger,
    },
    invariantDiagnosis,
    castPlayAudit: {
      stratumRecallOfficial: 0.625,
      fnCount: castPlayFnRows.length,
      rows: castPlayAudit,
    },
    conditionalSequentialAudit: {
      stratumRecallOfficial: 0.6666666666666666,
      fnCount: conditionalFnRows.length,
      rows: conditionalSequentialAudit,
      rc6GeneralizationNote: "Audit whether RC6 then/if-you-do promotion regressed or new syntax/gold caused misses.",
    },
    grantedV16MechanismRecurrence,
    focusAreas: {
      challengeGrantedNested: fnLedger.filter((r) => r.coverageStratum === "challenge_granted_nested_actions"),
      challengeReplacement: fnLedger.filter((r) => r.coverageStratum === "challenge_replacement"),
      challengeImmediateCast: fnLedger.filter((r) => r.coverageStratum === "challenge_immediate_cast_vs_permission"),
      broadTriggered: fnLedger.filter((r) => r.coverageStratum === "broad_triggered"),
      broadSagaPlaneswalker: [...fnLedger, ...fpLedger].filter((r) => r.coverageStratum === "broad_saga_planeswalker"),
      policyBucket: fnLedger.filter((r) => String(r.coverageStratum ?? "").startsWith("policy_")),
    },
    grantedNestedSemanticAudit: {
      stratumRecallOfficial: 0.64,
      fnCount: grantedNestedFnRows.length,
      rows: grantedNestedSemanticAudit,
      summary: {
        genuineParserFn: grantedNestedSemanticAudit.filter((r) => r.finalVerdict === "genuine_parser_fn").length,
        invalidGold: grantedNestedSemanticAudit.filter((r) => r.finalVerdict === "invalid_gold").length,
        grantedAbilityMisses: grantedNestedSemanticAudit.filter(
          (r) => r.finalVerdict === "genuine_parser_fn" && r.contextFamily === "granted_ability",
        ).length,
        tokenDefinitionMislabels: grantedNestedSemanticAudit.filter((r) => r.contextFamily === "token_definition").length,
      },
    },
    replacementSemanticAudit: {
      stratumRecallOfficial: 0.8333333333333334,
      fnCount: replacementFnRows.length,
      rows: replacementSemanticAudit,
    },
    policyBucketMismatchAudit,
    policyCorrectedDiagnostic: {
      label: "validation_v18_mismatch_adjudicated_forensic_v1",
      note: "NOT official v18 — forensic view only; official remains FAIL/SPENT",
      tp: diagTp,
      fp: diagFp,
      fn: diagFn,
      correctedDenominator,
      precision: diagPrecision,
      recall: diagRecall,
      invalidGoldFnRemoved: invalidGoldFn.length + wrongPrimitiveFn.length,
      invalidReminderGoldRemoved: reminderDerivedGoldAudit.length,
      missingGoldFpAdded: missingGoldAdds.length,
    },
    reminderDerivedGoldAudit: {
      rowCount: reminderDerivedGoldAudit.length,
      invalidReminderGoldKeys: [...invalidReminderGoldKeys],
      rows: reminderDerivedGoldAudit,
    },
    v15GrammarRecurrence,
    genuineParserFailureCensus: {
      genuineParserFnCount: genuineParserFn.length,
      genuineParserFpCount: genuineParserFp.length,
      invalidGoldFnCount: invalidGoldFn.length,
      wrongPrimitiveGoldFnCount: wrongPrimitiveFn.length,
      evaluatorFnCount: evaluatorFn.length,
      missingGoldFpCount: missingGoldFp.length,
      evaluatorFpCount: evaluatorFp.length,
      byRootCauseFamily: familyCensus,
      genuineParserFnRows: genuineParserFn,
      genuineParserFpRows: genuineParserFp,
    },
    proposedRc9Families,
    rc9RootCauseLedger,
  };

  const outPath = resolve(OUT_DIR, "validation-v18-forensic-adjudication-v1.json");
  writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  writeFileSync(
    resolve(OUT_DIR, "validation-v18-root-cause-ledger-v1.json"),
    `${JSON.stringify(rc9RootCauseLedger, null, 2)}\n`,
  );

  writeFileSync(
    resolve(OUT_DIR, "validation-v18-policy-adjudication-v1.json"),
    `${JSON.stringify(
      {
        artifactType: "ValidationPolicyAdjudication",
        version: "validation-v18-policy-adjudication-v1",
        parserBlind: true,
        officialSpentFirstRun: OFFICIAL,
        fnLedger: artifact.fnLedger,
        fpLedger: artifact.fpLedger,
        grantedNestedSemanticAudit: artifact.grantedNestedSemanticAudit,
        replacementSemanticAudit: artifact.replacementSemanticAudit,
        policyBucketMismatchAudit: artifact.policyBucketMismatchAudit,
        genuineParserFailureCensus: artifact.genuineParserFailureCensus,
        proposedRc9Families: artifact.proposedRc9Families,
      },
      null,
      2,
    )}\n`,
  );

  writeFileSync(
    resolve(OUT_DIR, "validation-v18-policy-corrected-diagnostic-v1.json"),
    `${JSON.stringify(
      {
        artifactType: "ValidationPolicyCorrectedDiagnostic",
        version: "validation-v18-policy-corrected-diagnostic-v1",
        officialSpentFirstRun: OFFICIAL,
        policyCorrected: artifact.policyCorrectedDiagnostic,
        adjudicationRef: "validation-v18-policy-adjudication-v1.json",
      },
      null,
      2,
    )}\n`,
  );

  writeFileSync(
    resolve(OUT_DIR, "validation-v18-forensic-freeze-manifest-v1.json"),
    `${JSON.stringify(
      {
        manifestVersion: "validation-v18-forensic-freeze-v1",
        frozenAt: artifact.frozenAt,
        forensicArtifactPath: "validation-v18-forensic-adjudication-v1.json",
        forensicArtifactHash: createHash("sha256").update(JSON.stringify(artifact, null, 2)).digest("hex"),
        officialV18: OFFICIAL,
        note: "Frozen forensic ledger — official v18 result remains FAIL/SPENT.",
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    JSON.stringify(
      {
        fnLedger: artifact.fnLedger.partition,
        fpLedger: artifact.fpLedger.partition,
        policyCorrected: artifact.policyCorrectedDiagnostic,
        genuineParserFailureCensus: {
          fn: genuineParserFn.length,
          fp: genuineParserFp.length,
        },
        grantedNestedSummary: artifact.grantedNestedSemanticAudit.summary,
        proposedRc9Families,
        v15GrammarRecurrence,
      },
      null,
      2,
    ),
  );
}

main();
