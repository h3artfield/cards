/**
 * Parser-blind v13 policy/gold/evaluator adjudication.
 * Produces validation-v13-policy-adjudication-v1.json and policy-corrected diagnostic.
 * Run: cd web && npx tsx scripts/adjudicate-validation-v13-policy-v1.ts
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import {
  applyOverride,
  adjudicateOfficialFpGoldCompleteness,
  adjudicatePolicyStratumFn,
  classifyCastGold,
  classifySacrificeDiscardGold,
  type CastAdjudication,
  type IntegrityFailureLedgerEntry,
  type OfficialFpAdjudication,
  type PolicyStratumAdjudication,
  type SacrificeDiscardAdjudication,
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

/** Audit targets derived from frozen first-run miss ledger (which labels to adjudicate — not parser reasoning). */
type MissTarget = {
  caseId: string;
  mismatchKind: "FN" | "FP";
  expectedAction: string | null;
  expectedEvidence?: string;
};

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
}

function buildIntegrityLedger(
  rawCases: Array<{ caseId: string; cardName?: string; semanticParse: OracleSemanticParse }>,
  caseById: Record<string, OracleActionEvalCaseV2>,
): IntegrityFailureLedgerEntry[] {
  const ledger: IntegrityFailureLedgerEntry[] = [];

  for (const row of rawCases) {
    const testCase = caseById[row.caseId];
    if (!testCase) continue;
    const parse = row.semanticParse;
    const validation = validateOracleSemanticParse(parse, testCase.oracleText);
    const integrity = verifySemanticParseIntegrity(parse, testCase.oracleText);

    for (const issue of validation.issues.filter((i) => i.severity === "invalid")) {
      const action = issue.actionId ? parse.actions.find((a) => a.actionId === issue.actionId) : undefined;
      const parent = action
        ? parse.abilities.find((a) => a.abilityId === action.parentAbilityId)
        : undefined;
      ledger.push({
        caseId: row.caseId,
        card: row.cardName ?? testCase.oracleId,
        offendingNode: issue.actionId ? `action:${issue.actionId}` : "parse",
        violationCode: issue.code,
        violationMessage: issue.message,
        actionId: issue.actionId,
        abilityId: action?.parentAbilityId,
        expectedParent: parent?.abilitySpan?.text?.slice(0, 80),
        actualParent: action?.provenance.actionSpan.text,
        face: parent?.faceId,
        clause: action?.clauseId,
        provenanceSpan: action
          ? `[${action.provenance.actionSpan.cardStart},${action.provenance.actionSpan.cardEnd}) ${action.provenance.actionSpan.text}`
          : undefined,
        constructionPath: action?.extractionSource,
        repairableByGold: false,
      });
    }

    for (const v of integrity.idViolations) {
      ledger.push({
        caseId: row.caseId,
        card: row.cardName ?? testCase.oracleId,
        offendingNode: v.actionId ? `action:${v.actionId}` : v.abilityId ? `ability:${v.abilityId}` : "id",
        violationCode: v.code,
        violationMessage: v.message,
        actionId: v.actionId,
        abilityId: v.abilityId,
        repairableByGold: false,
      });
    }

    for (const v of integrity.provenanceViolations) {
      const action = v.actionId ? parse.actions.find((a) => a.actionId === v.actionId) : undefined;
      ledger.push({
        caseId: row.caseId,
        card: row.cardName ?? testCase.oracleId,
        offendingNode: v.actionId ? `action:${v.actionId}` : "provenance",
        violationCode: v.code,
        violationMessage: v.message,
        actionId: v.actionId,
        abilityId: v.abilityId,
        provenanceSpan: action?.provenance.actionSpan.text,
        constructionPath: action?.extractionSource,
        repairableByGold: false,
      });
    }
  }

  return ledger;
}

function classifyGenuineParserFamily(
  actionType: string,
  stratum: string,
  policyClass?: string,
): string {
  if (policyClass?.includes("activated") || policyClass?.includes("cost")) return "activated_cost_effect_segmentation";
  if (stratum.includes("granted")) return "granted_nested_semantics";
  if (actionType === "cast") return "immediate_cast";
  if (stratum.includes("search")) return "search_referent_chain";
  if (stratum.includes("zone")) return "zone_transition";
  if (stratum.includes("replacement")) return "replacement";
  if (stratum.includes("modal")) return "modal_choice";
  if (stratum.includes("multiface")) return "mdfc_face";
  if (stratum.includes("variable") || actionType === "put_counter") return "quantity_counter";
  if (stratum.includes("recursion")) return "recursion";
  return "other";
}

function main() {
  const envelope = JSON.parse(readFileSync(V13_PATH, "utf8")) as {
    contentHash: string;
    cases: OracleActionEvalCaseV2[];
    parserExecutionCount: number;
    holdoutStatus?: string;
  };
  const aggregate = JSON.parse(readFileSync(AGGREGATE_PATH, "utf8")) as {
    missLedger: MissTarget[];
    invariants: Record<string, number>;
  };
  const raw = JSON.parse(readFileSync(RAW_PATH, "utf8")) as {
    cases: Array<{ caseId: string; cardName?: string; semanticParse: OracleSemanticParse }>;
  };

  if (envelope.parserExecutionCount !== 1) {
    throw new Error(`v13 must be spent (parserExecutionCount=1), got ${envelope.parserExecutionCount}`);
  }

  const caseById = Object.fromEntries(envelope.cases.map((c) => [c.id, c]));

  const fnTargets = aggregate.missLedger.filter(
    (r) => r.mismatchKind === "FN" && r.expectedAction,
  ) as Array<MissTarget & { expectedAction: string; expectedEvidence?: string }>;

  const sacrificeDiscardAdjudications: SacrificeDiscardAdjudication[] = [];
  const castAdjudications: CastAdjudication[] = [];
  const policyStratumAdjudications: PolicyStratumAdjudication[] = [];

  for (const target of fnTargets) {
    const testCase = caseById[target.caseId];
    if (!testCase) continue;
    const gold = testCase.expectedPrimitiveActions.find(
      (g) => !g.negative && g.actionType === target.expectedAction && g.evidenceContains === target.expectedEvidence,
    );
    if (!gold) continue;

    const stratum = (testCase as { coverageStratum?: string }).coverageStratum ?? "";

    if (target.expectedAction === "sacrifice" || target.expectedAction === "discard") {
      let row = classifySacrificeDiscardGold({ testCase, gold });
      row = applyOverride(row, [target.caseId, target.expectedAction, target.expectedEvidence?.slice(0, 30) ?? ""]);
      row = applyOverride(row, [target.caseId, target.expectedAction, (target.expectedEvidence ?? "").slice(0, 20)]);
      if (target.expectedEvidence?.includes("Sacrifice this enchantment")) {
        row = applyOverride(row, ["vh13-0094", "sacrifice", "Sacrifice this enchantment"]);
      }
      if (target.expectedEvidence?.includes("sacrifice one or more")) {
        row = applyOverride(row, ["vh13-0107", "sacrifice", "sacrifice one or more"]);
      }
      sacrificeDiscardAdjudications.push(row);
    } else if (target.expectedAction === "cast") {
      let row = classifyCastGold({ testCase, gold });
      if (target.expectedEvidence?.includes("you may cast a copy")) {
        row = applyOverride(row, ["vh13-0160", "cast", "you may cast a copy"]);
      }
      castAdjudications.push(row);

      if (stratum === "policy_reminder_heavy" || stratum === "policy_trigger_condition") {
        policyStratumAdjudications.push(
          adjudicatePolicyStratumFn({
            testCase,
            gold,
            stratum: stratum as "policy_reminder_heavy" | "policy_trigger_condition",
          }),
        );
      }
    }

    if (
      (stratum === "policy_reminder_heavy" || stratum === "policy_trigger_condition") &&
      target.expectedAction !== "cast"
    ) {
      const existing = policyStratumAdjudications.find(
        (p) => p.caseId === target.caseId && p.evidenceContains === gold.evidenceContains,
      );
      if (!existing) {
        let ps = adjudicatePolicyStratumFn({
          testCase,
          gold,
          stratum: stratum as "policy_reminder_heavy" | "policy_trigger_condition",
        });
        if (target.caseId === "vh13-0207" && target.expectedAction === "put_counter") {
          ps = applyOverride(ps, ["vh13-0207", "put_counter", "put a +1/+1 counter on target"]);
        }
        policyStratumAdjudications.push(ps);
      }
    }
  }

  const officialFpTargets = aggregate.missLedger.filter(
    (r) => r.mismatchKind === "FP" && (r as { errorClass?: string }).errorClass === "parser_false_positive",
  ) as Array<
    MissTarget & {
      observedAction?: string;
      observedEvidence?: string;
      abilityType?: string;
      errorClass?: string;
    }
  >;

  const fpAdjudications: OfficialFpAdjudication[] = [];
  for (const target of officialFpTargets) {
    const testCase = caseById[target.caseId];
    if (!testCase) continue;
    const blind = adjudicateOfficialFpGoldCompleteness({
      testCase,
      actionType: (target as { observedAction?: string }).observedAction ?? "",
      evidenceContains: (target as { observedEvidence?: string }).observedEvidence ?? "",
      abilityType: (target as { abilityType?: string }).abilityType ?? "unknown",
    });
    fpAdjudications.push({
      ...blind,
      emittedAction: (target as { observedAction?: string }).observedAction ?? "",
      emittedEvidence: (target as { observedEvidence?: string }).observedEvidence ?? "",
      modalOptionKey: undefined,
    });
  }

  const integrityLedger = buildIntegrityLedger(raw.cases, caseById);

  const allFnAdjudicationRows = [
    ...sacrificeDiscardAdjudications.map((r) => ({ ...r, actionType: r.actionType })),
    ...castAdjudications.map((r) => ({ ...r, actionType: "cast" as const })),
    ...policyStratumAdjudications
      .filter(
        (p) =>
          !castAdjudications.some(
            (c) => c.caseId === p.caseId && c.evidenceContains === p.evidenceContains,
          ) &&
          !sacrificeDiscardAdjudications.some(
            (s) => s.caseId === p.caseId && s.evidenceContains === p.evidenceContains,
          ),
      )
      .map((p) => ({ ...p, actionType: p.actionType })),
  ];

  const goldDefectFns = allFnAdjudicationRows.filter((r) => r.verdict === "gold_defect_remove_from_l2").length;

  const evaluatorDefectFns = allFnAdjudicationRows.filter((r) => r.verdict === "evaluator_evidence_mismatch").length;

  const genuineParserFns = allFnAdjudicationRows.filter((r) => r.verdict === "valid_layer2_gold").length;

  const goldDefectFps = fpAdjudications.filter((r) => r.verdict === "missing_gold").length;
  const genuineParserFps = fpAdjudications.filter(
    (r) => r.verdict === "genuine_parser_fp" && r.caseScope !== "structure_only",
  ).length;
  const evaluatorDefectFps = fpAdjudications.filter((r) => r.verdict === "evaluator_defect").length;
  const outOfScopeFps = fpAdjudications.filter((r) => r.verdict === "out_of_scope_emission").length;

  const correctedGoldDenominator = OFFICIAL_SCORE.goldDenominator - goldDefectFns;
  const correctedTp = OFFICIAL_SCORE.tp;
  const correctedFp = genuineParserFps;
  const correctedFn = genuineParserFns;
  const correctedPrecision = correctedTp + correctedFp > 0 ? correctedTp / (correctedTp + correctedFp) : 1;
  const correctedRecall = correctedTp + correctedFn > 0 ? correctedTp / (correctedTp + correctedFn) : 1;

  const genuineFailureCensus = {
    originalScoring: OFFICIAL_SCORE,
    goldDefects: goldDefectFns,
    evaluatorDefects: evaluatorDefectFns + evaluatorDefectFps,
    genuineParserFp: genuineParserFps,
    genuineParserFn: genuineParserFns,
    genuineIntegrityFailures: integrityLedger.length,
    outOfScopeFpEmissions: outOfScopeFps,
    goldDefectFpReclassified: goldDefectFps,
    byStructuralFamily: {} as Record<string, number>,
  };

  for (const row of allFnAdjudicationRows.filter((r) => r.verdict === "valid_layer2_gold")) {
    const stratum =
      "coverageStratum" in row
        ? (row as SacrificeDiscardAdjudication).coverageStratum
        : "stratum" in row
          ? (row as PolicyStratumAdjudication).stratum
          : (row as CastAdjudication).coverageStratum;
    const policyClass =
      "policyClass" in row
        ? (row as SacrificeDiscardAdjudication).policyClass
        : "castPolicyClass" in row
          ? (row as CastAdjudication).castPolicyClass
          : undefined;
    const fam = classifyGenuineParserFamily(String(row.actionType), stratum, policyClass);
    genuineFailureCensus.byStructuralFamily[fam] = (genuineFailureCensus.byStructuralFamily[fam] ?? 0) + 1;
  }

  const sensitivity = {
    note: "Diagnostic only — not predictions",
    sacrificeDiscardFnAllGoldDefect: {
      ifAll30InvalidCostGold: {
        recall: correctedTp / (correctedGoldDenominator || 1),
        goldDenominator: correctedGoldDenominator,
      },
    },
    policyStratumFnAdditional: {
      reminderHeavyFn: policyStratumAdjudications.filter((p) => p.stratum === "policy_reminder_heavy").length,
      triggerConditionFn: policyStratumAdjudications.filter((p) => p.stratum === "policy_trigger_condition").length,
    },
  };

  const adjudication = {
    artifactType: "ValidationPolicyAdjudication",
    version: "validation-v13-policy-adjudication-v1",
    generatedAt: new Date().toISOString(),
    parserBlind: true,
    inputs: {
      validationHash: envelope.contentHash,
      validationPath: V13_PATH,
      officialExecutionAggregateRef: "validation-v13-rc3-execution-1-aggregate.json",
      officialExecutionAggregateHash: sha256File(AGGREGATE_PATH),
      taxonomyVersion: "three-layer-v1.4",
      policyOverlayCommitSha: "37df6de95ffabebf8ac64bf0f8eed180aa87aa61",
    },
    officialSealedFirstContact: OFFICIAL_SCORE,
    sections: {
      A_sacrificeDiscardAdjudication: {
        summary: {
          totalAudited: sacrificeDiscardAdjudications.length,
          goldDefect: sacrificeDiscardAdjudications.filter((r) => r.verdict === "gold_defect_remove_from_l2").length,
          validLayer2: sacrificeDiscardAdjudications.filter((r) => r.verdict === "valid_layer2_gold").length,
          sacrificeFn: sacrificeDiscardAdjudications.filter((r) => r.actionType === "sacrifice").length,
          discardFn: sacrificeDiscardAdjudications.filter((r) => r.actionType === "discard").length,
        },
        rows: sacrificeDiscardAdjudications,
      },
      B_castAdjudication: {
        summary: {
          totalAudited: castAdjudications.length,
          goldDefect: castAdjudications.filter((r) => r.verdict === "gold_defect_remove_from_l2").length,
          validLayer2: castAdjudications.filter((r) => r.verdict === "valid_layer2_gold").length,
          byCastPolicyClass: castAdjudications.reduce<Record<string, number>>((acc, r) => {
            acc[r.castPolicyClass] = (acc[r.castPolicyClass] ?? 0) + 1;
            return acc;
          }, {}),
        },
        rows: castAdjudications,
      },
      C_policyStratumAdjudication: {
        summary: {
          reminderHeavy: policyStratumAdjudications.filter((p) => p.stratum === "policy_reminder_heavy"),
          triggerCondition: policyStratumAdjudications.filter((p) => p.stratum === "policy_trigger_condition"),
          goldDefect: policyStratumAdjudications.filter((r) => r.verdict === "gold_defect_remove_from_l2").length,
          validLayer2: policyStratumAdjudications.filter((r) => r.verdict === "valid_layer2_gold").length,
        },
        rows: policyStratumAdjudications,
      },
      D_officialFpAdjudication: {
        summary: {
          totalParserFalsePositiveLedgerRows: officialFpTargets.length,
          officialScoringFp: OFFICIAL_SCORE.fp,
          missingGold: goldDefectFps,
          genuineParserFp: genuineParserFps,
          evaluatorDefect: evaluatorDefectFps,
          outOfScope: outOfScopeFps,
        },
        rows: fpAdjudications,
      },
      E_semanticIntegrityLedger: {
        summary: {
          semanticInvalidActionCount: aggregate.invariants.semanticInvalidActionCount,
          semanticValidatorViolationCount: aggregate.invariants.semanticValidatorViolationCount,
          idViolations: aggregate.invariants.idViolations,
          provenanceViolations: aggregate.invariants.provenanceViolations,
          activatedCostLayer2Leakage: aggregate.invariants.activatedCostLayer2Leakage,
          ledgerEntries: integrityLedger.length,
          note: "Integrity failures cannot be repaired by gold changes — parser integrity work only.",
        },
        rows: integrityLedger,
      },
    },
    genuineFailureCensus,
    sensitivity,
  };

  const correctedDiagnostic = {
    artifactType: "ValidationPolicyCorrectedDiagnostic",
    version: "validation-v13-policy-corrected-diagnostic-v1",
    generatedAt: adjudication.generatedAt,
    adjudicationRef: "validation-v13-policy-adjudication-v1.json",
    officialSealedFirstContact: OFFICIAL_SCORE,
    policyCorrected: {
      goldDenominator: correctedGoldDenominator,
      tp: correctedTp,
      fp: correctedFp,
      fn: correctedFn,
      precision: correctedPrecision,
      recall: correctedRecall,
      note: "Hypothetical scoring if gold/evaluator defects removed per adjudication — NOT a re-run and NOT a pass claim.",
    },
    breakdown: {
      goldDefectsRemovedFromDenominator: goldDefectFns,
      goldDefectFpReclassifiedAsMissingGold: goldDefectFps,
      genuineParserFpRemaining: genuineParserFps,
      genuineParserFnRemaining: genuineParserFns,
      integrityFailuresNonGoldRepairable: integrityLedger.length,
    },
    genuineFailureCensus,
    releaseGatePassUnderPolicyCorrection: false,
    nextSteps: [
      "v13 remains spent validation material — forensic evidence only",
      "RC4 development against development + spent-v13 regression families",
      "Fresh sealed validation v14 required before blind",
      "Blind v2 taxonomy migration NOT authorized yet",
    ],
  };

  correctedDiagnostic.releaseGatePassUnderPolicyCorrection =
    correctedPrecision >= 0.98 &&
    correctedRecall >= 0.9 &&
    integrityLedger.filter((e) => e.violationCode.startsWith("span_outside") || e.violationCode.includes("dangling")).length === 0 &&
    aggregate.invariants.activatedCostLayer2Leakage === 0;

  mkdirSync(resolve(OUT_DIR), { recursive: true });

  const adjPath = resolve(OUT_DIR, "validation-v13-policy-adjudication-v1.json");
  const diagPath = resolve(OUT_DIR, "validation-v13-policy-corrected-diagnostic.json");
  writeFileSync(adjPath, `${JSON.stringify(adjudication, null, 2)}\n`, "utf8");
  writeFileSync(diagPath, `${JSON.stringify(correctedDiagnostic, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        adjudicationHash: sha256File(adjPath),
        diagnosticHash: sha256File(diagPath),
        A_sacrificeDiscard: adjudication.sections.A_sacrificeDiscardAdjudication.summary,
        B_cast: adjudication.sections.B_castAdjudication.summary,
        C_policy: {
          reminderHeavy: policyStratumAdjudications.filter((p) => p.stratum === "policy_reminder_heavy").length,
          triggerCondition: policyStratumAdjudications.filter((p) => p.stratum === "policy_trigger_condition").length,
          goldDefect: policyStratumAdjudications.filter((r) => r.verdict === "gold_defect_remove_from_l2").length,
        },
        D_officialFp: adjudication.sections.D_officialFpAdjudication.summary,
        E_integrity: adjudication.sections.E_semanticIntegrityLedger.summary,
        genuineFailureCensus,
        policyCorrected: correctedDiagnostic.policyCorrected,
      },
      null,
      2,
    ),
  );
}

main();
