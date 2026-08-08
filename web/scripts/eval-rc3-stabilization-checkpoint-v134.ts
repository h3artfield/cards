/**
 * RC3 v1.34 stabilization checkpoint — dual metric lanes, confusion matrix, adjudications.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { parseOracleSemanticsRC3, ORACLE_ACTION_RC3_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { resetRC3PromotedFamiliesToDefault } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-promotion";
import {
  evaluateCaseSemantic,
  matchGoldToSemanticActions,
  semanticActionsForMatch,
  sumSemanticMetrics,
} from "./oracle-action-semantic-matcher";
import { evidenceMatchesExtracted, classifyUnmatchedAction, type ExpectedPrimitiveAction } from "./oracle-action-eval-shared";
import { countParserFalsePositives, type ExtractedActionForMatch } from "./oracle-action-unified-matcher";
import { applyGoldMigrationV135 } from "./lib/rc3-gold-migration-v135";
import { sortIndicesByKey, stableGoldKey, stableActionKey } from "./lib/semantic-action-identity";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

type Case = OracleActionEvalCaseV2 & {
  coverageStratum?: string;
  spentV12Regression?: boolean;
  cardName?: string;
};

type FrozenAction = {
  stableKey: string;
  actionKey: string;
  actionType: string;
  evidenceText: string;
  extractionSource?: string;
};

type FrozenCase = {
  caseId: string;
  emittedActions: FrozenAction[];
  semanticInvalidActionCount: number;
  semanticValidatorViolationCount: number;
};

type FrozenOutput = {
  label: string;
  lineage: Record<string, unknown>;
  contentHash: string;
  cases: FrozenCase[];
};

function loadCombined(): Case[] {
  const paths = [
    "data/oracle-action-eval-development-v26-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v2-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v3-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v5-v14.json",
    "data/oracle-action-eval-rc3-positive-training-catalog-v133.json",
  ];
  const all: Case[] = [];
  for (const p of paths) all.push(...(JSON.parse(readFileSync(p, "utf8")) as { cases: Case[] }).cases);
  return all;
}

function loadFrozen(name: string): FrozenOutput {
  return JSON.parse(readFileSync(resolve(`data/milestones/rc3-development/frozen-parse-output-${name}.json`), "utf8")) as FrozenOutput;
}

function frozenMatchesGold(emitted: FrozenAction, gold: ExpectedPrimitiveAction): boolean {
  if (emitted.actionType !== gold.actionType) return false;
  return evidenceMatchesExtracted(emitted.evidenceText, gold.evidenceContains);
}

function frozenToExtracted(frozen: FrozenCase): ExtractedActionForMatch[] {
  return frozen.emittedActions.map((a, index) => ({
    index,
    primitive: a.actionType,
    evidenceText: a.evidenceText,
    evidenceStart: (a as { evidenceStart?: number }).evidenceStart ?? 0,
    evidenceEnd: ((a as { evidenceStart?: number }).evidenceStart ?? 0) + a.evidenceText.length,
    cardFaceId: "front",
    abilityIndex: 0,
    reviewStatus: "accepted" as const,
  }));
}

function policyFalsePositiveIndices(testCase: Case, frozen: FrozenCase, matchedEmitted: Set<number>): number[] {
  const extracted = frozenToExtracted(frozen);
  const unmatched: number[] = [];
  for (let i = 0; i < frozen.emittedActions.length; i++) {
    if (!matchedEmitted.has(i)) unmatched.push(i);
  }
  return unmatched.filter((idx) => {
    const action = extracted[idx]!;
    return (
      classifyUnmatchedAction({
        testCase,
        primitive: action.primitive,
        evidenceText: action.evidenceText,
        evidenceStart: action.evidenceStart,
        evidenceEnd: action.evidenceEnd,
        cardFaceId: action.cardFaceId,
        abilityIndex: action.abilityIndex,
      }) === "parser_false_positive"
    );
  });
}

function scoreFrozenCase(testCase: Case, frozen: FrozenCase) {
  const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
  const matchedEmitted = new Set<number>();
  let tp = 0;
  const expectedOrder = sortIndicesByKey(expected, (exp, idx) => stableGoldKey(testCase.id, exp, idx));
  const emittedOrder = sortIndicesByKey(frozen.emittedActions, (a) => a.actionKey);

  for (const goldIdx of expectedOrder) {
    const gold = expected[goldIdx]!;
    let hit = false;
    for (const emIdx of emittedOrder) {
      if (matchedEmitted.has(emIdx)) continue;
      if (frozenMatchesGold(frozen.emittedActions[emIdx]!, gold)) {
        matchedEmitted.add(emIdx);
        tp++;
        hit = true;
        break;
      }
    }
    if (!hit) {
      // fn
    }
  }
  const unmatchedIndices: number[] = [];
  for (let i = 0; i < frozen.emittedActions.length; i++) {
    if (!matchedEmitted.has(i)) unmatchedIndices.push(i);
  }
  const extractedForFp = frozen.emittedActions.map((a, index) => ({
    index,
    primitive: a.actionType,
    evidenceText: a.evidenceText,
    evidenceStart: (a as { evidenceStart?: number }).evidenceStart ?? 0,
    evidenceEnd: ((a as { evidenceStart?: number }).evidenceStart ?? 0) + a.evidenceText.length,
    cardFaceId: "front",
    abilityIndex: 0,
    reviewStatus: "accepted" as const,
  })) as ExtractedActionForMatch[];
  const fp = countParserFalsePositives(testCase, unmatchedIndices, extractedForFp);
  return { tp, fp, fn: expected.length - tp };
}

function scoreFrozenCorpus(cases: Case[], frozen: FrozenOutput) {
  const byId = new Map(frozen.cases.map((c) => [c.caseId, c]));
  const rows = cases.map((tc) => {
    const f = byId.get(tc.id)!;
    const m = scoreFrozenCase(tc, f);
    return { caseId: tc.id, accepted: m };
  });
  return sumSemanticMetrics(rows);
}

function metricsFromTpFpFn(tp: number, fp: number, fn: number) {
  return {
    tp,
    fp,
    fn,
    precision: tp + fp > 0 ? tp / (tp + fp) : 1,
    recall: tp + fn > 0 ? tp / (tp + fn) : 1,
  };
}

function rescoreLane(cases: Case[], frozen: FrozenOutput, label: string) {
  const metrics = scoreFrozenCorpus(cases, frozen);
  const unrelatedCases = cases.filter((c) => c.coverageStratum && !c.spentV12Regression && c.id.startsWith("rc3-pos"));
  const unrelatedFrozen = { ...frozen, cases: frozen.cases.filter((c) => unrelatedCases.some((u) => u.id === c.caseId)) };
  return {
    label,
    combined: metrics,
    unrelated: scoreFrozenCorpus(unrelatedCases, unrelatedFrozen),
    semanticInvalidActionCount: frozen.cases.reduce((n, c) => n + c.semanticInvalidActionCount, 0),
    semanticValidatorViolationCount: frozen.cases.reduce((n, c) => n + c.semanticValidatorViolationCount, 0),
  };
}

function confusionMatrix(cases: Case[], prior: FrozenOutput, current: FrozenOutput) {
  const transitions = {
    priorTp_to_currentTp: 0,
    priorTp_to_currentFn: 0,
    priorFp_to_currentFp: 0,
    priorFp_to_removed: 0,
    priorFn_to_currentTp: 0,
    priorFn_to_currentFn: 0,
    newlyEmittedUnmatched: 0,
  };
  const details: Array<Record<string, unknown>> = [];

  for (const testCase of cases) {
    const p = prior.cases.find((c) => c.caseId === testCase.id)!;
    const c = current.cases.find((x) => x.caseId === testCase.id)!;
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);

    const priorMatch = new Map<number, boolean>();
    const currMatch = new Map<number, boolean>();
    const usedPrior = new Set<number>();
    const usedCurr = new Set<number>();
    const goldOrder = sortIndicesByKey(expected, (exp, idx) => stableGoldKey(testCase.id, exp, idx));
    const priorOrder = sortIndicesByKey(p.emittedActions, (a) => a.actionKey);
    const currOrder = sortIndicesByKey(c.emittedActions, (a) => a.actionKey);

    for (const gi of goldOrder) {
      const gold = expected[gi]!;
      let pHit: number | null = null;
      for (const pi of priorOrder) {
        if (usedPrior.has(pi)) continue;
        if (frozenMatchesGold(p.emittedActions[pi]!, gold)) {
          pHit = pi;
          usedPrior.add(pi);
          break;
        }
      }
      let cHit: number | null = null;
      for (const ci of currOrder) {
        if (usedCurr.has(ci)) continue;
        if (frozenMatchesGold(c.emittedActions[ci]!, gold)) {
          cHit = ci;
          usedCurr.add(ci);
          break;
        }
      }
      priorMatch.set(gi, pHit !== null);
      currMatch.set(gi, cHit !== null);
      const pOk = pHit !== null;
      const cOk = cHit !== null;
      if (pOk && cOk) transitions.priorTp_to_currentTp++;
      else if (pOk && !cOk) {
        transitions.priorTp_to_currentFn++;
        details.push({ caseId: testCase.id, gold: gold.actionType, evidence: gold.evidenceContains, transition: "priorTp_to_currentFn" });
      } else if (!pOk && cOk) {
        transitions.priorFn_to_currentTp++;
        details.push({ caseId: testCase.id, gold: gold.actionType, evidence: gold.evidenceContains, transition: "priorFn_to_currentTp" });
      } else transitions.priorFn_to_currentFn++;
    }

    const priorFpIndices = policyFalsePositiveIndices(testCase, p, usedPrior);
    const currFpIndices = policyFalsePositiveIndices(testCase, c, usedCurr);
    const priorFpKeys = new Map(priorFpIndices.map((i) => [p.emittedActions[i]!.stableKey, i]));
    const currFpKeys = new Map(currFpIndices.map((i) => [c.emittedActions[i]!.stableKey, i]));
    const matchedPriorFp = new Set<string>();

    for (const key of priorFpKeys.keys()) {
      if (currFpKeys.has(key)) {
        transitions.priorFp_to_currentFp++;
        matchedPriorFp.add(key);
      } else {
        transitions.priorFp_to_removed++;
      }
    }
    for (const key of currFpKeys.keys()) {
      if (!matchedPriorFp.has(key)) transitions.newlyEmittedUnmatched++;
    }
  }

  const priorMetrics = scoreFrozenCorpus(cases, prior);
  const currMetrics = scoreFrozenCorpus(cases, current);
  const netTp = currMetrics.tp - priorMetrics.tp;
  const netFn = currMetrics.fn - priorMetrics.fn;
  const netFp = currMetrics.fp - priorMetrics.fp;

  const transitionTpDelta =
    transitions.priorFn_to_currentTp - transitions.priorTp_to_currentFn;
  const transitionFpDelta = transitions.newlyEmittedUnmatched - transitions.priorFp_to_removed;

  return {
    transitions,
    note: "FP transitions use policy-classified parser_false_positive only (not raw unmatched emissions)",
    reconciles: {
      netTpDelta: netTp,
      netFnDelta: netFn,
      netFpDelta: netFp,
      tpDeltaFromGoldTransitions: transitionTpDelta,
      fpDeltaFromFpTransitions: transitionFpDelta,
      tpReconciles: transitionTpDelta === netTp,
      fpReconciles: transitionFpDelta === netFp,
    },
    details: details.slice(0, 50),
  };
}

function classifyLostTp(
  testCase: Case,
  gold: ExpectedPrimitiveAction,
): { classification: string; goldValidUnderV14: boolean; restore: boolean } {
  if (gold.actionType === "cast" && /cast spells from your (hand|graveyard)/i.test(gold.evidenceContains ?? "")) {
    return { classification: "old_gold_defect", goldValidUnderV14: false, restore: false };
  }
  if (/^rc3-pos-cat-000[1-4]$/.test(testCase.id) && gold.actionType === "add_mana") {
    return { classification: "genuine_parser_regression", goldValidUnderV14: true, restore: true };
  }
  if (testCase.id === "rc3-pos-cat-0020" && gold.actionType === "sacrifice") {
    return { classification: "genuine_parser_regression", goldValidUnderV14: true, restore: true };
  }
  if (testCase.id === "rc3-pos-v12-0148") {
    return { classification: "genuine_parser_regression", goldValidUnderV14: true, restore: true };
  }
  if (["eval-0047", "eval-0141", "eval-0161", "eval-0191", "eval-0203", "dev-v9-027"].includes(testCase.id)) {
    return { classification: "genuine_parser_regression", goldValidUnderV14: true, restore: true };
  }
  if (gold.actionType === "play" && /play lands/i.test(gold.evidenceContains ?? "")) {
    if (/^dev-v9-012$|^eval-0062$/.test(testCase.id)) {
      return { classification: "policy_gold_defect_play_permission", goldValidUnderV14: false, restore: false };
    }
  }
  return { classification: "genuine_parser_regression", goldValidUnderV14: true, restore: true };
}

function adjudicateLostTps(cases: Case[], prior: FrozenOutput, current: FrozenOutput) {
  const rows: Array<Record<string, unknown>> = [];
  for (const testCase of cases) {
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const p = prior.cases.find((c) => c.caseId === testCase.id)!;
    const c = current.cases.find((x) => x.caseId === testCase.id)!;
    const goldOrder = sortIndicesByKey(expected, (exp, idx) => stableGoldKey(testCase.id, exp, idx));
    const priorOrder = sortIndicesByKey(p.emittedActions, (a) => a.actionKey);
    const currOrder = sortIndicesByKey(c.emittedActions, (a) => a.actionKey);
    const usedPrior = new Set<number>();
    const usedCurr = new Set<number>();

    for (const gi of goldOrder) {
      const gold = expected[gi]!;
      let pHit = false;
      for (const pi of priorOrder) {
        if (usedPrior.has(pi)) continue;
        if (frozenMatchesGold(p.emittedActions[pi]!, gold)) {
          usedPrior.add(pi);
          pHit = true;
          break;
        }
      }
      let cHit = false;
      for (const ci of currOrder) {
        if (usedCurr.has(ci)) continue;
        if (frozenMatchesGold(c.emittedActions[ci]!, gold)) {
          usedCurr.add(ci);
          cHit = true;
          break;
        }
      }
      if (!pHit || cHit) continue;
      const verdict = classifyLostTp(testCase, gold);
      rows.push({
        caseId: testCase.id,
        cardName: testCase.cardName,
        actionType: gold.actionType,
        evidenceContains: gold.evidenceContains,
        classification: verdict.classification,
        goldValidUnderV14: verdict.goldValidUnderV14,
        restore: verdict.restore,
        v134Restored: false,
      });
    }
  }
  for (const row of rows) {
    const testCase = cases.find((c) => c.id === row.caseId)!;
    const gold = testCase.expectedPrimitiveActions.find(
      (g) => !g.negative && g.actionType === row.actionType && g.evidenceContains === row.evidenceContains,
    );
    if (!gold) continue;
    const c = current.cases.find((x) => x.caseId === testCase.id)!;
    row.v134Restored = c.emittedActions.some((a) => frozenMatchesGold(a, gold));
  }
  return rows;
}

const ORIGINAL_V132_TO_V133_REGRESSIONS = [
  "rc3-pos-cat-0001",
  "rc3-pos-cat-0002",
  "rc3-pos-cat-0003",
  "rc3-pos-cat-0004",
  "rc3-pos-cat-0020",
  "rc3-pos-v12-0148",
  "eval-0047",
  "eval-0141",
  "eval-0161",
  "eval-0191",
  "eval-0203",
  "dev-v9-027",
] as const;

function originalRegressionRestoration(cases: Case[], current: FrozenOutput) {
  return ORIGINAL_V132_TO_V133_REGRESSIONS.map((caseId) => {
    const diff = loadJson<{ lostTp: Array<{ caseId: string; actionType: string; evidenceContains: string }> }>(
      "data/milestones/rc3-development/v132-to-v134-classified-diff.json",
    ).lostTp.find((r) => r.caseId === caseId);
    const testCase = cases.find((c) => c.id === caseId)!;
    const gold = testCase.expectedPrimitiveActions.find(
      (g) => !g.negative && g.actionType === diff?.actionType && g.evidenceContains === diff?.evidenceContains,
    );
    const frozen = current.cases.find((c) => c.caseId === caseId)!;
    const restored = gold ? frozen.emittedActions.some((a) => frozenMatchesGold(a, gold)) : false;
    return {
      caseId,
      actionType: diff?.actionType,
      evidenceContains: diff?.evidenceContains,
      restoredInV134Working: restored,
    };
  });
}

function policyGoldDefects() {
  return loadJson<{ records: Array<{ caseId: string; removeLayer2Actions: Array<{ actionType: string; evidenceContains: string }> }> }>(
    "data/milestones/rc3-development/persistent-permission-gold-migration-v135.json",
  ).records.flatMap((r) =>
    r.removeLayer2Actions.map((a) => ({
      caseId: r.caseId,
      actionType: a.actionType,
      evidenceContains: a.evidenceContains,
      classification: "policy_gold_defect",
      removedFromLayer2Gold: true,
    })),
  );
}

function liveMetrics(cases: Case[]) {
  resetRC3PromotedFamiliesToDefault();
  const rows = cases.map((tc) =>
    evaluateCaseSemantic(tc, parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText, cardFace: tc.cardFace })),
  );
  let invalidActions = 0;
  let invalidViolations = 0;
  for (const tc of cases) {
    const p = parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText, cardFace: tc.cardFace });
    invalidActions += p.semanticValidation.invalidActionCount;
    invalidViolations += p.semanticValidation.invalidCount;
  }
  return { combined: sumSemanticMetrics(rows), invalidActions, invalidViolations };
}

function loadJson<T>(relPath: string): T {
  return JSON.parse(readFileSync(resolve(relPath), "utf8")) as T;
}

function main() {
  const repoRoot = resolve(process.cwd(), "..");
  const parentCommit = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
  const transformBlobSha = execSync("git hash-object web/src/lib/deck-builder/golden-catalog/oracle-rc3-transform.ts", {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  const clauseNativeBlobSha = execSync("git hash-object web/src/lib/deck-builder/golden-catalog/oracle-rc3-clause-native.ts", {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  const workingTreeDirty =
    execSync("git status --porcelain web/src/lib/deck-builder/golden-catalog/", { cwd: repoRoot, encoding: "utf8" }).trim().length > 0;

  const cases = loadCombined();
  const rawCases = cases;
  const migratedCases = applyGoldMigrationV135(cases);

  const priorFrozen = loadFrozen("v132-working");
  const currentFrozen = loadFrozen("v134-stabilization");
  const reconciliation = loadJson<Record<string, unknown>>(
    "data/milestones/rc3-development/frozen-vs-live-reconciliation-v134.json",
  );

  const original12 = originalRegressionRestoration(rawCases, currentFrozen);
  const original12RestoredCount = original12.filter((r) => r.restoredInV134Working).length;

  const report = {
    generatedAt: new Date().toISOString(),
    checkpoint: "rc3-stabilization-v134-checkpoint-1",
    checkpointStatus: "NOT_IMMUTABLE — awaiting new git commit after pre-commit gates close",
    parser: {
      workingParserVersion: ORACLE_ACTION_RC3_PARSER_VERSION,
      parentCommit,
      parentLabel: "immutable v1.33 — NOT v1.34",
      v133CommittedBlobs: {
        transformBlobSha: "2d0097ab4fb5665cf0481b451dc6271e335d7797",
        clauseNativeBlobSha: "17e6f9ed7f85a5f2fadb05e55c9926fb93ec24ac",
      },
      workingTree: {
        dirty: workingTreeDirty,
        transformBlobSha,
        clauseNativeBlobSha,
      },
    },
    lineageLanguage: {
      immutableV131Commit: "6a757a736dfda9004860bb38d5e677880590882c",
      immutableV133Commit: parentCommit,
      v132WorkingState: "uncommitted development on v1.31 parent; frozen v132-working captures executed blobs",
      v134WorkingState: "uncommitted development on v1.33 parent; NOT yet an immutable commit",
      priorFrozenHash: priorFrozen.contentHash,
      currentFrozenHash: currentFrozen.contentHash,
      warning: "Do not tag rc3-stabilization-v134-checkpoint-1 until a new commit contains working blobs",
    },
    dualMetricLanes: {
      historicalParserDiff_rawGold: {
        v132Working: rescoreLane(rawCases, priorFrozen, "v132_working_raw_gold"),
        v134Stabilization: rescoreLane(rawCases, currentFrozen, "v134_raw_gold"),
        parserRegression: {
          tp: rescoreLane(rawCases, currentFrozen, "").combined.tp - rescoreLane(rawCases, priorFrozen, "").combined.tp,
          fn: rescoreLane(rawCases, currentFrozen, "").combined.fn - rescoreLane(rawCases, priorFrozen, "").combined.fn,
        },
      },
      policyCorrected_v135Overlay: {
        v132Working: rescoreLane(migratedCases, priorFrozen, "v132_working_corrected"),
        v134FrozenLooseRescore: {
          ...rescoreLane(migratedCases, currentFrozen, "v134_frozen_loose_rescore"),
          note: "Frozen export rescored with actionType+evidence matcher only — NOT authoritative",
        },
      },
    },
    frozenVsLiveReconciliation: reconciliation,
    authoritativeBaseline: {
      designation: "live_reparse + full semantic matcher + v135 gold overlay",
      source: "eval-rc3-dev-gate combinedDevelopment",
      metrics: liveMetrics(migratedCases).combined,
    },
    originalV132ToV133ParserRegressions: {
      count: 12,
      restoredInV134Working: original12RestoredCount,
      allRestored: original12RestoredCount === 12,
      actions: original12,
    },
    policyGoldDefectsSeparate: {
      count: policyGoldDefects().length,
      actions: policyGoldDefects(),
      yawgmothPlayAdjudication: loadJson("data/milestones/rc3-development/yawgmoth-play-permission-adjudication-v135.json"),
    },
    deterministicConfusionMatrix: confusionMatrix(rawCases, priorFrozen, currentFrozen),
    lostTpAdjudications: adjudicateLostTps(rawCases, priorFrozen, currentFrozen),
    historicalLostTpFromV132ToV133: loadJson("data/milestones/rc3-development/v132-to-v134-classified-diff.json").lostTp,
    grantedMetrics: {
      defaultGrantedPipeline: loadJson("data/milestones/rc3-development/granted-split-metrics-v134.json"),
      clauseNativeGrantedStages: loadJson("data/milestones/rc3-development/granted-stage-metrics-v135.json"),
      distinction:
        "defaultGrantedPipeline = full parser output (transform/V1/default path); clauseNativeGrantedStages = span detector → classifier → nested extraction pipeline only",
    },
    liveV134WithMigration: liveMetrics(migratedCases),
    promotions: {
      search: { status: "provisionally_accepted", isolatedDelta: "+1 TP / 0 FP" },
      activated: { status: "provisionally_accepted", isolatedDelta: "+2 TP / 0 FP" },
    },
    v13Execution: "NOT_RUN",
  };

  const outDir = resolve("data/milestones/rc3-development");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "rc3-stabilization-v134-checkpoint-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main();
