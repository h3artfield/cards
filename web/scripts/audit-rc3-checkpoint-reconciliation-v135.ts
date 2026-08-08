/**
 * RC3 checkpoint audit — action-level reconciliation, semanticInvalid, Omniscience,
 * persistent-permission cast gold scan. Evaluator-only; no parser tuning.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import {
  clearRC3PromotedFamilies,
  resetRC3PromotedFamiliesToDefault,
  setRC3PromotedFamilies,
} from "../src/lib/deck-builder/golden-catalog/oracle-rc3-promotion";
import { classifyTextRoleAt } from "../src/lib/deck-builder/golden-catalog/oracle-span-role-classifier";
import {
  evaluateCaseSemantic,
  matchGoldToSemanticActions,
  semanticActionsForMatch,
  sumSemanticMetrics,
} from "./oracle-action-semantic-matcher";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import type { ExpectedPrimitiveAction } from "./oracle-action-eval-shared";

type Case = OracleActionEvalCaseV2 & {
  coverageStratum?: string;
  spentV12Regression?: boolean;
  cardName?: string;
};

type ChangeClass =
  | "dataset_membership_change"
  | "gold_scoring_change"
  | "caseScope_change"
  | "parser_behavior_change"
  | "semantic_dedupe_change"
  | "promotion_source_precedence"
  | "evaluator_change"
  | "other";

type ActionSnapshot = {
  caseId: string;
  cardName?: string;
  coverageStratum?: string;
  spentV12Regression?: boolean;
  goldIndex: number;
  actionType: string;
  evidenceContains?: string;
  matched: boolean;
  matchedActionId?: string;
  extractionSource?: string;
  reviewStatus?: string;
};

type PassResult = {
  label: string;
  metrics: ReturnType<typeof sumSemanticMetrics>;
  unrelatedMetrics: ReturnType<typeof sumSemanticMetrics>;
  snapshots: ActionSnapshot[];
  fps: Array<{
    caseId: string;
    actionType: string;
    evidenceText: string;
    extractionSource?: string;
  }>;
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

function loadUnrelatedCatalog(): Case[] {
  return loadCombined().filter((c) => c.coverageStratum && !c.spentV12Regression && c.id.startsWith("rc3-pos"));
}

function goldKey(g: ExpectedPrimitiveAction, index: number): string {
  return `${g.actionType}|${(g.evidenceContains ?? "").toLowerCase()}|${index}`;
}

function evalPass(label: string, setup: () => void, cases: Case[]): PassResult {
  setup();
  const rows = cases.map((tc) =>
    evaluateCaseSemantic(tc, parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText, cardFace: tc.cardFace })),
  );
  const unrelatedRows = cases
    .filter((c) => c.coverageStratum && !c.spentV12Regression && c.id.startsWith("rc3-pos"))
    .map((tc) =>
      evaluateCaseSemantic(tc, parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText, cardFace: tc.cardFace })),
    );

  const snapshots: ActionSnapshot[] = [];
  const fps: PassResult["fps"] = [];

  for (const testCase of cases) {
    const parsed = parseOracleSemanticsRC3({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const outcome = matchGoldToSemanticActions({ expected, parse: parsed, tier: "accepted", oracleText: testCase.oracleText });

    expected.forEach((gold, goldIndex) => {
      const match = outcome.matches.find((m) => m.expectedIndex === goldIndex);
      const action =
        match?.actionIndex != null ? parsed.actions[match.actionIndex] : undefined;
      snapshots.push({
        caseId: testCase.id,
        cardName: testCase.cardName,
        coverageStratum: testCase.coverageStratum,
        spentV12Regression: testCase.spentV12Regression,
        goldIndex,
        actionType: gold.actionType,
        evidenceContains: gold.evidenceContains,
        matched: match?.matched ?? false,
        matchedActionId: action?.actionId,
        extractionSource: action
          ? (parsed.legacy.actions.find((a) => a.actionId === action.actionId) as { extractionSource?: string })
              ?.extractionSource
          : undefined,
        reviewStatus: action?.reviewStatus,
      });
    });

    for (const idx of outcome.unmatchedActionIndices) {
      const action = parsed.actions[idx];
      const legacy = parsed.legacy.actions.find((a) => a.actionId === action.actionId);
      fps.push({
        caseId: testCase.id,
        actionType: action.actionType,
        evidenceText: action.provenance.actionSpan.text,
        extractionSource: (legacy as { extractionSource?: string })?.extractionSource,
      });
    }
  }

  return {
    label,
    metrics: sumSemanticMetrics(rows),
    unrelatedMetrics: sumSemanticMetrics(unrelatedRows),
    snapshots,
    fps,
  };
}

function classifyChange(input: {
  before: ActionSnapshot;
  after: ActionSnapshot;
  beforePass: string;
  afterPass: string;
  promotedFamilies: string[];
}): ChangeClass {
  const { before, after, promotedFamilies } = input;
  if (before.matched && !after.matched) {
    if (after.coverageStratum && promotedFamilies.includes(after.coverageStratum)) {
      return "promotion_source_precedence";
    }
    if (before.extractionSource !== after.extractionSource && after.extractionSource) {
      return "promotion_source_precedence";
    }
    if (before.extractionSource !== after.extractionSource && !after.extractionSource) {
      return "parser_behavior_change";
    }
    return "parser_behavior_change";
  }
  if (!before.matched && after.matched) return "parser_behavior_change";
  return "other";
}

function comparePasses(before: PassResult, after: PassResult, promotedFamilies: string[] = []) {
  const beforeMap = new Map(before.snapshots.map((s) => [`${s.caseId}::${goldKey({ actionType: s.actionType, evidenceContains: s.evidenceContains }, s.goldIndex)}`, s]));
  const lostTp: Array<ActionSnapshot & { changeClass: ChangeClass }> = [];
  const gainedTp: Array<ActionSnapshot & { changeClass: ChangeClass }> = [];
  const fpChanges: Array<{ caseId: string; beforeFp: boolean; afterFp: boolean; detail: string }> = [];

  for (const afterSnap of after.snapshots) {
    const key = `${afterSnap.caseId}::${goldKey({ actionType: afterSnap.actionType, evidenceContains: afterSnap.evidenceContains }, afterSnap.goldIndex)}`;
    const beforeSnap = beforeMap.get(key);
    if (!beforeSnap) continue;
    if (beforeSnap.matched && !afterSnap.matched) {
      lostTp.push({
        ...afterSnap,
        changeClass: classifyChange({ before: beforeSnap, after: afterSnap, beforePass: before.label, afterPass: after.label, promotedFamilies }),
      });
    }
    if (!beforeSnap.matched && afterSnap.matched) {
      gainedTp.push({
        ...afterSnap,
        changeClass: classifyChange({ before: beforeSnap, after: afterSnap, beforePass: before.label, afterPass: after.label, promotedFamilies }),
      });
    }
  }

  const beforeFpSet = new Set(before.fps.map((f) => `${f.caseId}|${f.actionType}|${f.evidenceText}`));
  const afterFpSet = new Set(after.fps.map((f) => `${f.caseId}|${f.actionType}|${f.evidenceText}`));
  for (const fp of after.fps) {
    const k = `${fp.caseId}|${fp.actionType}|${fp.evidenceText}`;
    if (!beforeFpSet.has(k)) fpChanges.push({ caseId: fp.caseId, beforeFp: false, afterFp: true, detail: `${fp.actionType}: ${fp.evidenceText.slice(0, 60)}` });
  }
  for (const fp of before.fps) {
    const k = `${fp.caseId}|${fp.actionType}|${fp.evidenceText}`;
    if (!afterFpSet.has(k)) fpChanges.push({ caseId: fp.caseId, beforeFp: true, afterFp: false, detail: `${fp.actionType}: ${fp.evidenceText.slice(0, 60)}` });
  }

  return { lostTp, gainedTp, fpChanges, netTpDelta: gainedTp.length - lostTp.length, netFnDelta: lostTp.length - gainedTp.length };
}

function auditSemanticInvalid(cases: Case[]) {
  const records: Array<{
    caseId: string;
    cardName?: string;
    actionId: string;
    actionType: string;
    extractionSource?: string;
    validatorErrors: string[];
    evidenceText: string;
  }> = [];

  resetRC3PromotedFamiliesToDefault();
  for (const testCase of cases) {
    const parsed = parseOracleSemanticsRC3({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    for (const issue of parsed.semanticValidation.issues.filter((i) => i.severity === "invalid")) {
      const action = issue.actionId ? parsed.actions.find((a) => a.actionId === issue.actionId) : undefined;
      const legacy = action ? parsed.legacy.actions.find((a) => a.actionId === action.actionId) : undefined;
      records.push({
        caseId: testCase.id,
        cardName: testCase.cardName,
        actionId: issue.actionId ?? "unknown",
        actionType: action?.actionType ?? "unknown",
        extractionSource: (legacy as { extractionSource?: string })?.extractionSource,
        validatorErrors: [`${issue.code}: ${issue.message}`],
        evidenceText: action?.provenance.actionSpan.text ?? "",
      });
    }
  }
  return records;
}

const PERSISTENT_CAST_RE =
  /You may cast (?:spells )?from your (?:hand|graveyard|library)\b/i;

function isPersistentPermissionOracle(text: string, evidence: string): boolean {
  if (!PERSISTENT_CAST_RE.test(text)) return false;
  if (/You may cast (?:it|that card|the copy|that copy)\b/i.test(evidence)) return false;
  if (/without paying|this turn|for as long as/i.test(evidence) && !/cast spells from/i.test(evidence)) return false;
  return PERSISTENT_CAST_RE.test(evidence) || /cast spells from your (hand|graveyard)/i.test(evidence);
}

function adjudicateOmniscience() {
  const cases = loadCombined();
  const omni = cases.find((c) => c.id === "dev-v9-011");
  if (!omni) throw new Error("dev-v9-011 not found");
  const oracleText = omni.oracleText;
  const evidence = "You may cast spells from your hand";
  const idx = oracleText.indexOf(evidence);
  const role = classifyTextRoleAt({ paragraph: oracleText, localStart: idx >= 0 ? idx : 0, localEnd: idx >= 0 ? idx + evidence.length : oracleText.length });
  const castGold = omni.expectedPrimitiveActions.find((g) => g.actionType === "cast" && !g.negative);
  return {
    caseId: omni.id,
    cardName: omni.cardName,
    oracleText,
    parserBlindRole: role,
    policyPattern: "persistent_hand_cast_permission",
    currentGold: castGold,
    policyVerdict: "persistent_permission — Layer 1 static_permission; NO Layer-2 cast",
    expectedLayer1: "static_permission",
    expectedLayer2: "no cast primitive",
    goldDefect: castGold?.actionType === "cast",
    parserBlindNote:
      "classifyTextRoleAt returns effect on standalone enchantment ability line; policy adjudication overrides: continuous zone permission is Layer-1 only",
    recommendedCorrection: {
      removePrimitiveActions: castGold ? [{ actionType: castGold.actionType, evidenceContains: castGold.evidenceContains }] : [],
      addForbiddenPrimitiveActions: ["cast"],
      certifiedEmptyLayer2: true,
      layer1Annotation: { kind: "static_permission", evidenceContains: "You may cast spells from your hand" },
    },
  };
}

function isPersistentPermissionCastGold(gold: { actionType: string; evidenceContains?: string }): boolean {
  if (gold.actionType !== "cast") return false;
  const ev = gold.evidenceContains ?? "";
  if (/You may cast (?:it|that card|the copy|that copy)\b/i.test(ev)) return false;
  if (/for as long as it remains exiled/i.test(ev)) return false;
  return /cast spells from your (hand|graveyard|library)/i.test(ev);
}

function scanPersistentPermissionCastGold(cases: Case[]) {
  const defects: Array<{
    caseId: string;
    cardName?: string;
    oracleText: string;
    castGoldEvidence: string;
    policyClass: string;
    taxonomyVersion?: string;
    dataset: string;
  }> = [];

  for (const testCase of cases) {
    for (const gold of testCase.expectedPrimitiveActions) {
      if (gold.negative || !isPersistentPermissionCastGold(gold)) continue;
      defects.push({
        caseId: testCase.id,
        cardName: testCase.cardName,
        oracleText: testCase.oracleText.slice(0, 120),
        castGoldEvidence: gold.evidenceContains ?? "",
        policyClass: "persistent_static_permission",
        taxonomyVersion: (testCase as { taxonomyVersion?: string }).taxonomyVersion,
        dataset: testCase.id.startsWith("rc3-pos") ? "rc3-positive-catalog" : "legacy-v14-dev",
      });
    }
  }
  return defects;
}

function applyGoldMigrationOverlay(cases: Case[], migration: { records: Array<{ caseId: string; removeCastEvidence?: string }> }): Case[] {
  const removeByCase = new Map(migration.records.map((r) => [r.caseId, r.removeCastEvidence]));
  return cases.map((c) => {
    const evidence = removeByCase.get(c.id);
    if (!evidence) return c;
    const expectedPrimitiveActions = c.expectedPrimitiveActions.filter(
      (g) => !(g.actionType === "cast" && (g.evidenceContains ?? "").toLowerCase().includes(evidence.toLowerCase().slice(0, 20))),
    );
    const forbiddenPrimitiveActions = [...new Set([...(c.forbiddenPrimitiveActions ?? []), "cast"])];
    return {
      ...c,
      expectedPrimitiveActions,
      forbiddenPrimitiveActions,
      certifiedEmptyLayer2: true,
    };
  });
}

function main() {
  const combined = loadCombined();
  const unrelated = loadUnrelatedCatalog();

  const passSearchOnly = evalPass("search_only_promotion", () => {
    clearRC3PromotedFamilies();
    setRC3PromotedFamilies(["search_put_shuffle_chain"]);
  }, combined);

  const passDefault = evalPass("default_search_plus_activated", () => resetRC3PromotedFamiliesToDefault(), combined);

  const passNoPromotion = evalPass("shadow_no_default_promotion", () => clearRC3PromotedFamilies(), combined);

  const activatedDelta = comparePasses(passSearchOnly, passDefault, ["activated_post_colon_effect"]);
  const searchAndTransformDelta = comparePasses(passNoPromotion, passSearchOnly, ["search_put_shuffle_chain"]);

  const semanticInvalidRecords = auditSemanticInvalid(combined);
  const omniscience = adjudicateOmniscience();
  const permissionCastDefects = scanPersistentPermissionCastGold(combined);

  const migration = {
    migrationVersion: "persistent-permission-cast-gold-migration-v135",
    frozenAt: new Date().toISOString(),
    parserConsulted: false,
    reviewer: "rc3-checkpoint-audit-v135",
    rule: "Persistent/static 'You may cast spells from …' → Layer 1 static_permission; NO Layer-2 cast",
    records: permissionCastDefects.map((d) => ({
      caseId: d.caseId,
      cardName: d.cardName,
      removeCastEvidence: d.castGoldEvidence,
      policyReason: "Persistent zone cast permission is Layer-1 static_permission under taxonomy v1.4",
      policyClass: d.policyClass,
    })),
  };

  const migratedCombined = applyGoldMigrationOverlay(combined, migration);
  const passDefaultMigrated = evalPass("default_with_gold_migration_v135", () => resetRC3PromotedFamiliesToDefault(), migratedCombined);

  const unrelatedBefore = evalPass("unrelated_baseline_search_only", () => {
    clearRC3PromotedFamilies();
    setRC3PromotedFamilies(["search_put_shuffle_chain"]);
  }, unrelated);
  const unrelatedAfter = evalPass("unrelated_default", () => resetRC3PromotedFamiliesToDefault(), unrelated);
  const unrelatedMigrated = evalPass("unrelated_migrated", () => resetRC3PromotedFamiliesToDefault(), applyGoldMigrationOverlay(unrelated, migration));
  const unrelatedCompare = comparePasses(unrelatedBefore, unrelatedAfter);

  const report = {
    generatedAt: new Date().toISOString(),
    auditScope: "v135 checkpoint reconciliation — evaluator-only, no parser tuning, v13 not run",
    referenceCheckpoints: {
      priorAccepted: { tp: 578, fp: 5, fn: 77, recall: 0.882, source: "rc3-checkpoint-v132-report.json @ 6a757a73" },
      currentCommitted: { tp: 569, fp: 5, fn: 86, recall: 0.869, source: "rc3-checkpoint-v134-report.json @ HEAD" },
    },
    A_combinedReconciliation: {
      note: "Pass snapshots on current parser at HEAD. v132 baseline (578/5/77) requires separate v132-parser snapshot — see subprocess note.",
      passes: {
        shadow_no_promotion: passNoPromotion.metrics,
        search_only: passSearchOnly.metrics,
        default_search_plus_activated: passDefault.metrics,
      },
      decomposition: {
        shadow_to_search_only: comparePasses(passNoPromotion, passSearchOnly, ["search_put_shuffle_chain"]),
        search_only_to_default: activatedDelta,
        shadow_to_default: comparePasses(passNoPromotion, passDefault),
      },
      activatedIsolatedDelta: {
        tp: activatedDelta.netTpDelta,
        fn: activatedDelta.netFnDelta,
        lostTp: activatedDelta.lostTp,
        gainedTp: activatedDelta.gainedTp,
      },
    },
    B_unrelatedCatalogRecall: {
      before: unrelatedBefore.metrics,
      after: unrelatedAfter.metrics,
      migratedAfter: unrelatedMigrated.metrics,
      delta: unrelatedCompare,
      lostTp: unrelatedCompare.lostTp,
      gainedTp: unrelatedCompare.gainedTp,
    },
    C_semanticInvalid: {
      count: semanticInvalidRecords.length,
      records: semanticInvalidRecords,
    },
    D_omniscienceAndPermissionCastGold: {
      omniscience: omniscience,
      activeDevelopmentScan: permissionCastDefects,
      goldMigration: migration,
    },
    E_correctedBaselineWithGoldMigration: {
      combined: passDefaultMigrated.metrics,
      unrelated: passDefaultMigrated.unrelatedMetrics,
      note: "Metrics after applying immutable v135 gold migration overlay — does not mutate historical benchmark files",
    },
  };

  const outDir = resolve("data/milestones/rc3-development");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "checkpoint-reconciliation-audit-v135.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(
    resolve(outDir, "persistent-permission-cast-gold-migration-v135.json"),
    `${JSON.stringify(migration, null, 2)}\n`,
  );
  console.log(JSON.stringify(report, null, 2));
}

main();
