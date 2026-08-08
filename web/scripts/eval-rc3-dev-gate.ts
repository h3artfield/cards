/**
 * RC3 development gate — reports metrics by corpus slice. Never executes on v13.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { parseOracleSemanticsRC3, ORACLE_ACTION_RC3_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { verifySemanticParseIntegrity } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-integrity";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { evaluateCaseSemantic, sumSemanticMetrics, type SemanticCaseMetrics } from "./oracle-action-semantic-matcher";

type Envelope = { cases: OracleActionEvalCaseV2[]; contentHash?: string };

function evalSlice(cases: OracleActionEvalCaseV2[], label: string) {
  const rows: SemanticCaseMetrics[] = [];
  let semanticInvalid = 0;
  let idViolations = 0;
  let provenanceViolations = 0;
  let costLeakage = 0;
  let reminderLeakage = 0;
  let triggerEventLeakage = 0;
  let permissionLeakage = 0;
  let needsReviewTp = 0;
  let needsReviewFp = 0;

  for (const testCase of cases) {
    const parsed = parseOracleSemanticsRC3({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    semanticInvalid += parsed.semanticValidation.invalidCount;
    rows.push(evaluateCaseSemantic(testCase, parsed));

    const integrity = verifySemanticParseIntegrity(parsed, testCase.oracleText);
    idViolations += integrity.idViolations.length;
    provenanceViolations += integrity.provenanceViolations.length;

    for (const action of parsed.actions) {
      if (action.reviewStatus === "needs_review") {
        const matched = testCase.expectedPrimitiveActions.some(
          (g) => !g.negative && g.actionType === action.actionType,
        );
        if (matched) needsReviewTp++;
        else needsReviewFp++;
      }
      const ev = action.provenance.actionSpan.text;
      if (action.actionType === "sacrifice" && /^\{[^}]+\}/.test(testCase.oracleText) && testCase.oracleText.indexOf(":") > 0) {
        const colon = testCase.oracleText.indexOf(":");
        if (action.provenance.actionSpan.cardStart < colon) costLeakage++;
      }
      if (/\([^)]{20,}\)/.test(ev) && /Flashback|Discover|Cycling/i.test(ev)) reminderLeakage++;
      if (action.actionType === "cast" && /Whenever you cast|When you cast|If you cast/i.test(ev)) triggerEventLeakage++;
      if (action.actionType === "cast" && /can't cast|You may cast.*from your graveyard/i.test(testCase.oracleText)) {
        permissionLeakage++;
      }
    }
  }

  const accepted = sumSemanticMetrics(rows);
  return {
    label,
    caseCount: cases.length,
    accepted,
    needsReview: { tp: needsReviewTp, fp: needsReviewFp },
    semanticInvalid,
    invariants: {
      idViolations,
      provenanceViolations,
      costLeakage,
      reminderLeakage,
      triggerEventLeakage,
      permissionLeakage,
    },
  };
}

function evalGuardrails(path: string) {
  const envelope = JSON.parse(readFileSync(path, "utf8")) as Envelope & {
    cases: Array<OracleActionEvalCaseV2 & { forbiddenPrimitiveActions?: string[] }>;
  };
  let forbiddenEmitted = 0;
  let acceptedViolations = 0;
  let needsReviewViolations = 0;

  for (const testCase of envelope.cases) {
    const parsed = parseOracleSemanticsRC3({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const forbidden = new Set(testCase.forbiddenPrimitiveActions ?? []);
    for (const action of parsed.actions.filter((a) => a.reviewStatus === "accepted")) {
      if (forbidden.has(action.actionType)) {
        forbiddenEmitted++;
        acceptedViolations++;
      }
    }
    for (const action of parsed.actions.filter((a) => a.reviewStatus === "needs_review")) {
      if (forbidden.has(action.actionType)) needsReviewViolations++;
    }
  }

  return {
    label: "policy_guardrail",
    path,
    caseCount: envelope.cases.length,
    forbiddenActionsEmitted: forbiddenEmitted,
    acceptedViolations,
    needsReviewViolations,
  };
}

function load(path: string): OracleActionEvalCaseV2[] {
  return (JSON.parse(readFileSync(path, "utf8")) as Envelope).cases;
}

function main() {
  const repoRoot = resolve(process.cwd(), "..");
  const parserCommit = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
  const parserBlob = execSync(`git hash-object web/src/lib/deck-builder/golden-catalog/oracle-action-parser-rc3.ts`, {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();

  const legacyV14Paths = [
    { path: "data/oracle-action-eval-development-v26-v14.json", label: "legacy_dev_v26_v14" },
    { path: "data/oracle-action-eval-development-generalization-expansion-v2-v14.json", label: "legacy_exp_v2_v14" },
    { path: "data/oracle-action-eval-development-generalization-expansion-v3-v14.json", label: "legacy_exp_v3_v14" },
    { path: "data/oracle-action-eval-development-generalization-expansion-v5-v14.json", label: "legacy_exp_v5_v14" },
  ];

  const legacySlices = legacyV14Paths.map((p) => evalSlice(load(p.path), p.label));

  const positiveAll = load("data/oracle-action-eval-rc3-positive-training-v130.json");
  const v12Regression = positiveAll.filter((c) => (c as { spentV12Regression?: boolean }).spentV12Regression);
  const unrelatedPositive = positiveAll.filter((c) => !(c as { spentV12Regression?: boolean }).spentV12Regression);

  const v12Slice = evalSlice(v12Regression, "v12_regression_slice");
  const unrelatedSlice = evalSlice(unrelatedPositive, "unrelated_positive_slice");
  const positiveCombined = evalSlice(positiveAll, "positive_training_combined");
  const guardrails = evalGuardrails("data/oracle-action-eval-rc3-policy-guardrail-v130.json");

  const combinedCases = [
    ...legacyV14Paths.flatMap((p) => load(p.path)),
    ...positiveAll,
  ];
  const combined = evalSlice(combinedCases, "combined_development");

  const putIntoHandAudit = {
    wrongDrawBefore: "RC2 mapped put-into-hand phrases to draw",
    rc3Reclassified: combinedCases.filter((c) => {
      const p = parseOracleSemanticsRC3({ oracleId: c.oracleId, oracleText: c.oracleText, cardFace: c.cardFace });
      return p.actions.some((a) => a.actionType === "put_into_hand");
    }).length,
    remainingDrawForPutPhrases: combinedCases.filter((c) => {
      const p = parseOracleSemanticsRC3({ oracleId: c.oracleId, oracleText: c.oracleText, cardFace: c.cardFace });
      return p.actions.some(
        (a) => a.actionType === "draw" && /put\b[^.]*into\b[^.]*hand/i.test(a.provenance.actionSpan.text),
      );
    }).length,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    checkpoint: "rc3-structural-v130-checkpoint-1",
    parser: {
      version: ORACLE_ACTION_RC3_PARSER_VERSION,
      commit: parserCommit,
      blobSha: parserBlob,
      lineage: "RC3 — separate from frozen oracle-action-rc2",
    },
    taxonomyV14: {
      put_into_hand: "implemented",
      distinctFromDraw: true,
      distinctFromReturnToHand: true,
    },
    semanticValidator: {
      status: "implemented",
      releaseGate: "structural invalid only — inferSupportedPrimitiveFromEvidence removed from gating",
    },
    structuralFamilies: {
      granted_ability: { status: "rc3_supplemental_extraction", note: "Recursive granted-quote pass added" },
      search_put_shuffle: { status: "rc3_chain_synthesis", note: "search→put_into_hand→shuffle sequence" },
      mdfc_transform: { status: "partial", note: "Inherited v1; dedicated transform structure pending" },
      activated_post_colon: { status: "rc3_cost_suppression + effect_extraction", note: "Cost-region L2 suppressed" },
      replacement: { status: "inherited_v1_instead_clause", note: "Replacement effect pass inherited" },
      put_into_hand: putIntoHandAudit,
    },
    metrics: {
      legacyV14Corpora: legacySlices,
      v12RegressionSlice: v12Slice,
      unrelatedPositiveSlice: unrelatedSlice,
      positiveTrainingCombined: positiveCombined,
      policyGuardrails: guardrails,
      combinedDevelopment: combined,
    },
    gates: {
      combinedDevelopment: {
        precisionTarget: 0.98,
        recallTarget: 0.92,
        pass:
          combined.accepted.precision >= 0.98 &&
          combined.accepted.recall >= 0.92 &&
          combined.semanticInvalid === 0,
      },
      unrelatedPositive: {
        precisionTarget: 0.95,
        recallTarget: 0.9,
        pass:
          unrelatedSlice.accepted.precision >= 0.95 && unrelatedSlice.accepted.recall >= 0.9,
      },
      policyGuardrails: {
        acceptedForbiddenEmissionsTarget: 0,
        pass: guardrails.acceptedViolations === 0,
      },
    },
    v13Execution: "NOT_RUN — parserExecutionCount remains 0",
  };

  const outDir = resolve("data/milestones/rc3-development");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "rc3-checkpoint-v130-report.json");
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ outPath, report }, null, 2));
}

main();
