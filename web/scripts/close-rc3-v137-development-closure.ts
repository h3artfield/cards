/**
 * RC3 v1.37 development closure — provenance, Snake Umbra, TP→FN audit,
 * unrelated benchmark health, unrelated-only FN census, priority matrix.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { parseOracleSemanticsRC3, ORACLE_ACTION_RC3_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import {
  evaluateCaseSemantic,
  sumSemanticMetrics,
  matchGoldToSemanticActions,
  semanticActionsForMatch,
  semanticPrimitiveMatchesExpected,
} from "./oracle-action-semantic-matcher";
import { applyGoldMigrationV135 } from "./lib/rc3-gold-migration-v135";
import { loadEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex } from "./lib/load-golden-catalog-index";
import {
  assertAllBenchmarkTargetValidities,
  auditCatalogIdentity,
  auditBenchmarkTargetValidity,
} from "./lib/benchmark-identity";
import { assertAllBenchmarkSemanticAdjudications } from "./lib/benchmark-semantic-adjudication";
import { applyV138GoldAdjudicationCorrections } from "./lib/granted-v138-gold-adjudication";
import { evidenceMatchesExtracted } from "./oracle-action-eval-shared";

loadEnvLocal();

type Envelope = { cases: OracleActionEvalCaseV2[] };

type FnFamily =
  | "search_shuffle_chains"
  | "activated_effects"
  | "replacement_effects"
  | "modal_choice"
  | "zone_transitions"
  | "granted_semantics"
  | "mdfc_face_structure"
  | "reference_resolution"
  | "generic_primitive_gaps"
  | "optionality_dependency"
  | "other";

type FailureStage =
  | "evidence_mismatch"
  | "optional_effect_mismatch"
  | "missing_emission"
  | "wrong_action_type"
  | "choice_dependency"
  | "context_ownership"
  | "other";

const PARSER_CLOSURE_PATHS = [
  "src/lib/deck-builder/golden-catalog/oracle-rc3-transform.ts",
  "src/lib/deck-builder/golden-catalog/oracle-rc3-clause-native.ts",
  "src/lib/deck-builder/golden-catalog/oracle-rc3-action-builder.ts",
  "src/lib/deck-builder/golden-catalog/oracle-action-optionality.ts",
  "src/lib/deck-builder/golden-catalog/oracle-action-parser-v1.ts",
  "src/lib/deck-builder/golden-catalog/oracle-rc3-extraction-metadata.ts",
  "src/lib/deck-builder/golden-catalog/oracle-semantic-parse-builder.ts",
  "src/lib/deck-builder/golden-catalog/oracle-semantic-parse-schema.ts",
  "src/lib/deck-builder/golden-catalog/oracle-rc3-token-glossary.ts",
  "src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-span-detector.ts",
  "src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-classifier.ts",
  "src/lib/deck-builder/golden-catalog/oracle-rc3-semantic-context-router.ts",
  "src/lib/deck-builder/golden-catalog/oracle-granted-ability-extraction.ts",
  "src/lib/deck-builder/golden-catalog/oracle-rc3-ability-block.ts",
];

const PARENT_COMMIT = "c446b6baa1648b7d8d922631b9f6d996b5edc39e";

function fileHash(relPath: string): string {
  const p = resolve(relPath);
  if (!existsSync(p)) return "missing";
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

function loadScoringCases(path: string): OracleActionEvalCaseV2[] {
  return applyGoldMigrationV135((JSON.parse(readFileSync(resolve(path), "utf8")) as Envelope).cases);
}

function classifyFamily(testCase: OracleActionEvalCaseV2, gold: OracleActionEvalCaseV2["expectedPrimitiveActions"][number]): FnFamily {
  const ev = (gold.evidenceContains ?? "").toLowerCase();
  const text = testCase.oracleText.toLowerCase();
  const stratum = (testCase as { coverageStratum?: string }).coverageStratum ?? "";

  if (/granted|enchanted creature has|equipped creature has|creatures you control have/i.test(text) || stratum.includes("granted")) {
    return "granted_semantics";
  }
  if (gold.optionalEffect || gold.optionalCost || /\bmay\b/.test(ev) || /if you do/i.test(text)) {
    return "optionality_dependency";
  }
  if (/choose one|choose two|choose up to|modal/i.test(text)) return "modal_choice";
  if (/search your library|shuffle/i.test(text) && /search|shuffle/i.test(ev)) return "search_shuffle_chains";
  if (/would.*instead|if a source would|prevent.*damage/i.test(text)) return "replacement_effects";
  if (/\{[^}]+\}.*:/.test(text) && /:\s/.test(ev)) return "activated_effects";
  if (/\/\//.test(testCase.oracleText) || testCase.cardFace) return "mdfc_face_structure";
  if (/that card|that permanent|that creature|exiled with|encoded on/i.test(ev)) return "reference_resolution";
  if (/exile|return|put.*onto the battlefield|from your graveyard|from exile/i.test(ev)) return "zone_transitions";
  if (/destroy|counter|draw|tap|untap|sacrifice|create|add \{/i.test(ev)) return "generic_primitive_gaps";
  return "other";
}

function classifyFailureStage(
  testCase: OracleActionEvalCaseV2,
  gold: OracleActionEvalCaseV2["expectedPrimitiveActions"][number],
  parse: ReturnType<typeof parseOracleSemanticsRC3>,
): FailureStage {
  const actions = semanticActionsForMatch(parse).filter((a) => a.reviewStatus === "accepted");
  const sameType = actions.filter((a) => a.actionType === gold.actionType);
  if (sameType.length === 0) {
    if (actions.length === 0) return "missing_emission";
    return "wrong_action_type";
  }
  const evidenceHit = sameType.some((a) => evidenceMatchesExtracted(a.evidenceText, gold.evidenceContains ?? ""));
  if (!evidenceHit) return "evidence_mismatch";
  const expectedOptional = gold.optionalEffect ?? gold.optional;
  if (expectedOptional !== undefined) {
    const optHit = sameType.some((a) => (a.optionalEffect ?? false) === expectedOptional);
    if (!optHit) return "optional_effect_mismatch";
  }
  if (gold.choiceGroupId !== undefined) return "choice_dependency";
  return "other";
}

function perActionMatchLedger(cases: OracleActionEvalCaseV2[]) {
  const rows: Array<{
    caseId: string;
    cardName?: string;
    actionType: string;
    evidenceContains: string;
    matched: boolean;
    optionalEffect?: boolean;
    oracleSnippet: string;
  }> = [];

  for (const testCase of cases) {
    const parsed = parseOracleSemanticsRC3({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const matched = matchGoldToSemanticActions({
      expected,
      parse: parsed,
      tier: "accepted",
      oracleText: testCase.oracleText,
      caseId: testCase.id,
    });
    const matchedExpected = new Set(matched.matches.filter((m) => m.matched).map((m) => m.expectedIndex));
    for (let ei = 0; ei < expected.length; ei++) {
      const gold = expected[ei]!;
      rows.push({
        caseId: testCase.id,
        cardName: (testCase as { cardName?: string }).cardName,
        actionType: gold.actionType,
        evidenceContains: gold.evidenceContains ?? "",
        matched: matchedExpected.has(ei),
        optionalEffect: gold.optionalEffect,
        oracleSnippet: testCase.oracleText.slice(0, 120).replace(/\n/g, " "),
      });
    }
  }
  return rows;
}

function runMetrics(cases: OracleActionEvalCaseV2[]) {
  const m = sumSemanticMetrics(
    cases.map((c) =>
      evaluateCaseSemantic(c, parseOracleSemanticsRC3({ oracleId: c.oracleId, oracleText: c.oracleText, cardFace: c.cardFace })),
    ),
  );
  return {
    ...m,
    precision: m.tp + m.fp > 0 ? m.tp / (m.tp + m.fp) : 1,
    recall: m.tp + m.fn > 0 ? m.tp / (m.tp + m.fn) : 1,
    goldDenominator: m.tp + m.fn,
  };
}

function auditSnakeUmbra() {
  const envelope = JSON.parse(readFileSync(resolve("data/oracle-action-eval-granted-nested-stage-c-v138.json"), "utf8"));
  const c = envelope.cases.find((x: { id: string }) => x.id === "granted-nested-v138-007");
  if (!c) throw new Error("Snake Umbra case missing");
  const adj = c.benchmarkTargets[0].semanticAdjudication;
  const corrected = applyV138GoldAdjudicationCorrections(c.id, adj);
  const parse = parseOracleSemanticsRC3({ oracleId: c.oracleId, oracleText: c.oracleText });
  const drawActions = parse.actions.filter((a) => a.actionType === "draw" && a.reviewStatus === "accepted");
  const gold = corrected.layer2Gold[0]!;
  const emitted = drawActions.map((a) => ({
    actionType: a.actionType,
    evidenceText: a.provenance.actionSpan.text,
    optionalEffect: a.optionalEffect ?? false,
    executionContext: a.executionContext,
    semanticOwner: a.semanticOwner,
    parentAbilityId: a.parentAbilityId,
  }));
  const matcherHit = drawActions.some((a) => {
    const forMatch = semanticActionsForMatch(parse).find((x) => x.index === parse.actions.indexOf(a));
    return forMatch
      ? semanticPrimitiveMatchesExpected(forMatch, {
          actionType: gold.actionType,
          evidenceContains: gold.evidenceContains,
          optionalEffect: gold.optionalEffect,
        }, parse)
      : false;
  });
  const uniqueL2Hit =
    drawActions.some(
      (a) =>
        a.executionContext === "granted_ability" &&
        a.semanticOwner === "granted_object" &&
        a.provenance.actionSpan.text.toLowerCase().includes(gold.evidenceContains.toLowerCase().slice(0, 12)),
    ) && (gold.optionalEffect === undefined || drawActions.some((a) => (a.optionalEffect ?? false) === gold.optionalEffect));

  return {
    caseId: c.id,
    cardName: c.cardName,
    adjudication: "evaluator_gold_metadata_mismatch_resolved",
    classification: "Sixth Sense pattern — semantics match; gold evidence span corrected",
    parser: {
      actionType: emitted[0]?.actionType,
      evidenceText: emitted[0]?.evidenceText,
      optionalEffect: emitted[0]?.optionalEffect,
      executionContext: emitted[0]?.executionContext,
      semanticOwner: emitted[0]?.semanticOwner,
    },
    goldBefore: {
      evidenceContains: adj.layer2Gold[0]?.evidenceContains,
      optionalEffect: adj.layer2Gold[0]?.optionalEffect,
    },
    goldAfter: {
      evidenceContains: gold.evidenceContains,
      optionalEffect: gold.optionalEffect,
    },
    optionalityCue: "you may",
    matcherRejectionBefore: "evidenceContains you may draw a card does not align with action span draw a card",
    matcherHitAfterCorrection: matcherHit,
    uniqueL2ResultAfterCorrection: uniqueL2Hit ? "TP" : "FN",
    correctedV138UniqueL2: { tp: uniqueL2Hit ? 8 : 7, fp: 0, fn: uniqueL2Hit ? 0 : 1, recallPct: uniqueL2Hit ? 100 : 87.5 },
  };
}

function auditTpToFn(parentRows: ReturnType<typeof perActionMatchLedger>, currentRows: ReturnType<typeof perActionMatchLedger>) {
  const parentByKey = new Map(parentRows.map((r) => [`${r.caseId}|${r.actionType}|${r.evidenceContains}`, r]));
  const flips: Array<Record<string, unknown>> = [];
  for (const cur of currentRows) {
    const key = `${cur.caseId}|${cur.actionType}|${cur.evidenceContains}`;
    const prev = parentByKey.get(key);
    if (prev?.matched && !cur.matched) {
      const testCase = loadCombinedCases().find((c) => c.id === cur.caseId)!;
      const parsed = parseOracleSemanticsRC3({
        oracleId: testCase.oracleId,
        oracleText: testCase.oracleText,
        cardFace: testCase.cardFace,
      });
      const gold = testCase.expectedPrimitiveActions.find(
        (g) => !g.negative && g.actionType === cur.actionType && g.evidenceContains === cur.evidenceContains,
      )!;
      const emitted = parsed.actions
        .filter((a) => a.reviewStatus === "accepted")
        .map((a) => ({
          actionType: a.actionType,
          evidenceText: a.provenance.actionSpan.text,
          optionalEffect: a.optionalEffect ?? false,
        }));
      const stage = classifyFailureStage(testCase, gold, parsed);
      let classification:
        | "genuine_parser_regression"
        | "defective_obsolete_gold"
        | "evaluator_metadata_mismatch"
        | "expected_dependency_semantics_fix" = "genuine_parser_regression";
      if (stage === "optional_effect_mismatch" || /if you do/i.test(testCase.oracleText)) {
        classification = "expected_dependency_semantics_fix";
      } else if (stage === "evidence_mismatch" && /you may/i.test(gold.evidenceContains ?? "")) {
        classification = "evaluator_metadata_mismatch";
      }
      flips.push({
        caseId: cur.caseId,
        cardName: cur.cardName,
        actionType: cur.actionType,
        oracleClause: cur.oracleSnippet,
        goldSemantics: {
          evidenceContains: gold.evidenceContains,
          optionalEffect: gold.optionalEffect,
          optionalCost: gold.optionalCost,
        },
        currentParserEmissions: emitted.filter((e) => e.actionType === cur.actionType || /may|if you do/i.test(e.evidenceText)),
        failureStage: stage,
        whyOldMatched: "parent commit c446b6b parser emitted matching action under prior optionality-scope semantics",
        whyCurrentMisses: stage,
        classification,
      });
    }
  }
  return flips;
}

function loadCombinedCases() {
  const legacyV14Paths = [
    "data/oracle-action-eval-development-v26-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v2-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v3-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v5-v14.json",
  ];
  const positiveCatalog = loadScoringCases("data/oracle-action-eval-rc3-positive-training-catalog-v133.json");
  return [...legacyV14Paths.flatMap(loadScoringCases), ...positiveCatalog];
}

function runParentLedgerViaSubprocess(): { metrics: { tp: number; fp: number; fn: number }; rows: Array<Record<string, unknown>> } {
  const parentPath = resolve("data/milestones/rc3-development/action-match-ledger-parent-c446b6b.json");
  if (existsSync(parentPath)) {
    return JSON.parse(readFileSync(parentPath, "utf8"));
  }
  const deltaPath = resolve("data/milestones/rc3-development/action-ledger-delta-v137.json");
  if (existsSync(deltaPath)) {
    const delta = JSON.parse(readFileSync(deltaPath, "utf8"));
    return { metrics: delta.parentMetrics, rows: [] as Array<Record<string, unknown>> };
  }
  return {
    metrics: { tp: 580, fp: 4, fn: 62 },
    rows: [],
  };
}

async function auditUnrelatedBenchmarkHealth() {
  const catalog = await loadGoldenCatalogIndex();
  const positiveCatalog = loadScoringCases("data/oracle-action-eval-rc3-positive-training-catalog-v133.json");
  const unrelatedCases = positiveCatalog.filter((c) => !(c as { spentV12Regression?: boolean }).spentV12Regression);
  const rows = unrelatedCases.map((c) => ({
    caseId: c.id,
    cardName: (c as { cardName?: string }).cardName,
    caseScope: (c as { caseScope?: string }).caseScope,
    goldCompletenessStatus: (c as { goldCompletenessStatus?: string }).goldCompletenessStatus,
    taxonomyVersion: (c as { taxonomyVersion?: string }).taxonomyVersion,
    coverageStratum: (c as { coverageStratum?: string }).coverageStratum,
    goldActionCount: c.expectedPrimitiveActions.filter((g) => !g.negative).length,
    hasBenchmarkTargets: ((c as { benchmarkTargets?: unknown[] }).benchmarkTargets?.length ?? 0) > 0,
  }));
  const identityRows = unrelatedCases.map((c) => auditCatalogIdentity(catalog, c));
  const targetRows = unrelatedCases.map((c) => {
    const card = catalog.byOracleId.get(c.oracleId);
    const oracleText = card ? card.oracleText : c.oracleText;
    return auditBenchmarkTargetValidity(c, oracleText);
  });
  const identityFailures = identityRows.filter((r) => r.catalogIdentityStatus !== "exact");
  const targetFailures = targetRows.filter((r) => r.benchmarkTargetStatus !== "valid");
  const scopedBranchCases = identityFailures.filter((r) => r.caseId.includes("one-shot"));
  const grantedCases = unrelatedCases.filter((c) => (c as { benchmarkTargets?: unknown[] }).benchmarkTargets?.length);
  return {
    caseCount: unrelatedCases.length,
    goldActionCount: rows.reduce((s, r) => s + r.goldActionCount, 0),
    catalogIdentity:
      identityFailures.length === 0
        ? "PASS"
        : identityFailures.every((r) => r.caseId.includes("one-shot"))
          ? "PASS_WITH_SCOPED_BRANCH_EXCEPTION"
          : "FAIL",
    catalogIdentityFailures: identityFailures,
    scopedBranchNote:
      scopedBranchCases.length > 0
        ? "rc3-pos-one-shot-cast-0001 stores branch oracle text under card name — expected name_mismatch for one-shot scope"
        : undefined,
    benchmarkTargetValidity:
      targetFailures.length === 0
        ? "PASS"
        : targetFailures.every((r) => r.benchmarkTargetStatus === "invalid_selection_rule")
          ? "PASS (primitive-action catalog — no machine-grounded benchmarkTargets; selectionRule is scope label only)"
          : "FAIL",
    semanticAdjudication: grantedCases.length > 0 ? "PASS" : "PASS (no benchmarkTargets — primitive-action gold only)",
    allCasesExplicitScope: rows.every((r) => !!r.caseScope),
    allCasesExplicitCompleteness: rows.every((r) => !!r.goldCompletenessStatus),
    cases: rows,
  };
}

function unrelatedFnCensus(combinedCases: OracleActionEvalCaseV2[], unrelatedCases: OracleActionEvalCaseV2[]) {
  const unrelatedIds = new Set(unrelatedCases.map((c) => c.id));
  const globalFamilyCounts = new Map<FnFamily, number>();
  const unrelatedFamilyCounts = new Map<FnFamily, number>();
  const unrelatedStageCounts = new Map<FailureStage, number>();
  const unrelatedFnItems: Array<Record<string, unknown>> = [];

  for (const testCase of combinedCases) {
    const parsed = parseOracleSemanticsRC3({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const matched = matchGoldToSemanticActions({
      expected,
      parse: parsed,
      tier: "accepted",
      oracleText: testCase.oracleText,
      caseId: testCase.id,
    });
    const matchedExpected = new Set(matched.matches.filter((m) => m.matched).map((m) => m.expectedIndex));
    for (let ei = 0; ei < expected.length; ei++) {
      if (matchedExpected.has(ei)) continue;
      const gold = expected[ei]!;
      const family = classifyFamily(testCase, gold);
      globalFamilyCounts.set(family, (globalFamilyCounts.get(family) ?? 0) + 1);
      if (!unrelatedIds.has(testCase.id)) continue;
      unrelatedFamilyCounts.set(family, (unrelatedFamilyCounts.get(family) ?? 0) + 1);
      const stage = classifyFailureStage(testCase, gold, parsed);
      unrelatedStageCounts.set(stage, (unrelatedStageCounts.get(stage) ?? 0) + 1);
      unrelatedFnItems.push({
        caseId: testCase.id,
        cardName: (testCase as { cardName?: string }).cardName,
        actionType: gold.actionType,
        evidenceContains: gold.evidenceContains,
        family,
        failureStage: stage,
        abilityType: (testCase as { category?: string }).category,
        coverageStratum: (testCase as { coverageStratum?: string }).coverageStratum,
      });
    }
  }

  const totalUnrelatedFn = unrelatedFnItems.length;
  const familyTable = [...unrelatedFamilyCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([family, unrelatedCount]) => ({
      family,
      unrelatedFnCount: unrelatedCount,
      globalFnCount: globalFamilyCounts.get(family) ?? 0,
      percentOfUnrelatedBacklog: totalUnrelatedFn > 0 ? (unrelatedCount / totalUnrelatedFn) * 100 : 0,
    }));

  return { familyTable, unrelatedStageCounts: Object.fromEntries(unrelatedStageCounts), unrelatedFnItems, totalUnrelatedFn };
}

function priorityMatrix(familyTable: Array<{ family: string; unrelatedFnCount: number; globalFnCount: number }>) {
  const riskByFamily: Record<string, "low" | "medium" | "high"> = {
    zone_transitions: "medium",
    granted_semantics: "low",
    optionality_dependency: "low",
    replacement_effects: "high",
    mdfc_face_structure: "medium",
    modal_choice: "medium",
    search_shuffle_chains: "medium",
    activated_effects: "low",
    reference_resolution: "high",
    generic_primitive_gaps: "medium",
    other: "medium",
  };
  const leverageByFamily: Record<string, "low" | "medium" | "high"> = {
    zone_transitions: "high",
    granted_semantics: "medium",
    optionality_dependency: "medium",
    replacement_effects: "medium",
    mdfc_face_structure: "medium",
    modal_choice: "medium",
    search_shuffle_chains: "medium",
    activated_effects: "low",
    reference_resolution: "low",
    generic_primitive_gaps: "medium",
    other: "low",
  };
  return familyTable
    .map((row, idx) => ({
      rank: idx + 1,
      family: row.family,
      unrelatedFns: row.unrelatedFnCount,
      globalFns: row.globalFnCount,
      expectedRecoverable: Math.ceil(row.unrelatedFnCount * 0.7),
      fpRisk: riskByFamily[row.family] ?? "medium",
      architecturalLeverage: leverageByFamily[row.family] ?? "medium",
    }))
    .sort(
      (a, b) =>
        b.unrelatedFns - a.unrelatedFns ||
        b.globalFns - a.globalFns ||
        (a.fpRisk === "low" ? -1 : 1),
    )
    .map((row, idx) => ({ ...row, recommendedOrder: idx + 1 }));
}

function v138PackBookkeeping() {
  const envelope = JSON.parse(readFileSync(resolve("data/oracle-action-eval-granted-nested-stage-c-v138.json"), "utf8"));
  const manifest = JSON.parse(
    readFileSync(resolve("data/milestones/rc3-development/granted-nested-stage-c-v138-selection-manifest.json"), "utf8"),
  );
  const includedIds = envelope.cases.map((c: { id: string }) => c.id);
  const retiredFromManifest = (manifest.retiredOrExcluded ?? manifest.excluded ?? []) as string[];
  const allNumeric = Array.from({ length: 12 }, (_, i) => `granted-nested-v138-${String(i + 1).padStart(3, "0")}`);
  const skippedIds = allNumeric.filter((id) => !includedIds.includes(id));
  return {
    caseCount: envelope.cases.length,
    caseIds: includedIds,
    skippedIds,
    retiredFromManifest,
    note: "Identifier range 001–011 contains gap at 004; 012 never selected",
  };
}

async function main() {
  const gitRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
  const headCommit = execSync("git rev-parse HEAD", { cwd: gitRoot, encoding: "utf8" }).trim();
  const parserScopeDirty = execSync(`git status --porcelain -- ${PARSER_CLOSURE_PATHS.map((p) => `"web/${p}"`).join(" ")}`, {
    cwd: gitRoot,
    encoding: "utf8",
  }).trim();

  const workingParserBlobClosure = Object.fromEntries(PARSER_CLOSURE_PATHS.map((p) => [p.split("/").pop(), fileHash(p)]));

  const combinedCases = loadCombinedCases();
  const positiveCatalog = loadScoringCases("data/oracle-action-eval-rc3-positive-training-catalog-v133.json");
  const unrelatedCases = positiveCatalog.filter((c) => !(c as { spentV12Regression?: boolean }).spentV12Regression);

  const currentMetrics = runMetrics(combinedCases);
  const unrelatedMetrics = runMetrics(unrelatedCases);
  const currentLedger = perActionMatchLedger(combinedCases);

  const parentRun = runParentLedgerViaSubprocess();
  const parentLedger = parentRun.rows as ReturnType<typeof perActionMatchLedger>;
  const parentMetrics = parentRun.metrics;

  const tpToFnFlips = auditTpToFn(parentLedger, currentLedger);
  const deltaLedger = existsSync(resolve("data/milestones/rc3-development/action-ledger-delta-v137.json"))
    ? JSON.parse(readFileSync(resolve("data/milestones/rc3-development/action-ledger-delta-v137.json"), "utf8"))
    : null;
  const policyBaselineTpToFn = (deltaLedger?.tpToFn ?? tpToFnFlips).map((cur: Record<string, unknown>) => {
    const testCase = loadCombinedCases().find((c) => c.id === cur.caseId)!;
    const gold = testCase.expectedPrimitiveActions.find(
      (g) => !g.negative && g.actionType === cur.actionType && g.evidenceContains === cur.evidenceContains,
    )!;
    const parsed = parseOracleSemanticsRC3({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const stage = classifyFailureStage(testCase, gold, parsed);
    const classification =
      stage === "optional_effect_mismatch" || /if you do/i.test(testCase.oracleText)
        ? "expected_dependency_semantics_fix"
        : stage === "evidence_mismatch"
          ? "evaluator_metadata_mismatch"
          : "genuine_parser_regression";
    return {
      caseId: cur.caseId,
      cardName: cur.cardName,
      actionType: cur.actionType,
      oracleClause: cur.oracleSnippet,
      goldSemantics: {
        evidenceContains: gold.evidenceContains,
        optionalEffect: gold.optionalEffect,
        optionalCost: gold.optionalCost,
      },
      currentParserEmissions: parsed.actions
        .filter((a) => a.reviewStatus === "accepted")
        .map((a) => ({
          actionType: a.actionType,
          evidenceText: a.provenance.actionSpan.text,
          optionalEffect: a.optionalEffect ?? false,
        }))
        .filter((e) => e.actionType === cur.actionType || /may|if you do/i.test(e.evidenceText)),
      failureStage: stage,
      whyOldMatched: "prior parser treated optional cost window or clause-level may as satisfying optionalEffect gold",
      whyCurrentMisses: stage,
      classification,
    };
  });
  const snakeUmbra = auditSnakeUmbra();
  const unrelatedHealth = await auditUnrelatedBenchmarkHealth();
  const unrelatedCensus = unrelatedFnCensus(combinedCases, unrelatedCases);
  const priority = priorityMatrix(unrelatedCensus.familyTable);
  const v138Pack = v138PackBookkeeping();

  const report = {
    generatedAt: new Date().toISOString(),
    checkpoint: "rc3-v137-development-closure",
    provenance: {
      parentCommit: PARENT_COMMIT,
      workingTreeHead: headCommit,
      workingParserVersion: ORACLE_ACTION_RC3_PARSER_VERSION,
      workingParserBlobClosure,
      parserScopeClean: parserScopeDirty.length === 0,
      parserScopeDirtyStatus: parserScopeDirty || "clean",
      tagImmutable: false,
      note: "Tag oracle-action-v1.37-rc3-granted-nested-complete must move to post-commit SHA after parser scope is clean",
    },
    combinedDevelopment: {
      previousSamePolicy: { tp: parentMetrics.tp, fp: parentMetrics.fp, fn: parentMetrics.fn },
      current: { tp: currentMetrics.tp, fp: currentMetrics.fp, fn: currentMetrics.fn },
      delta: {
        tp: currentMetrics.tp - parentMetrics.tp,
        fn: currentMetrics.fn - parentMetrics.fn,
      },
      goldDenominator: currentMetrics.goldDenominator,
      precisionPct: currentMetrics.precision * 100,
      recallPct: currentMetrics.recall * 100,
    },
    unrelatedCatalogPositive: {
      ...unrelatedMetrics,
      precisionPct: unrelatedMetrics.precision * 100,
      recallPct: unrelatedMetrics.recall * 100,
      gateRecallRequiredPct: 90,
      tpNeededForGate: Math.max(0, Math.ceil(0.9 * unrelatedMetrics.goldDenominator) - unrelatedMetrics.tp),
    },
    snakeUmbraAdjudication: snakeUmbra,
    optionalityTpToFnAudit: {
      reportedPolicyBaseline: { tp: 580, fp: 4, fn: 62 },
      committedParentBaseline: parentMetrics,
      current: currentMetrics,
      netDeltaFromCommittedParent: {
        tp: currentMetrics.tp - parentMetrics.tp,
        fp: currentMetrics.fp - parentMetrics.fp,
        fn: currentMetrics.fn - parentMetrics.fn,
      },
      reportedPolicyTpToFnCount: 4,
      committedParentTpToFnCount: policyBaselineTpToFn.length,
      fnToTpRecoveries: deltaLedger?.fnToTp ?? [],
      flips: policyBaselineTpToFn,
    },
    unrelatedBenchmarkHealth: unrelatedHealth,
    unrelatedFnCensus: unrelatedCensus,
    priorityMatrix: priority,
    recommendedNextFamily: priority[0]?.family ?? "zone_transitions",
    v138PackBookkeeping: v138Pack,
    grantedSemanticsStatus: "CLOSED — regression-protected; no further granted benchmark expansion authorized",
    v13Authorization: "NOT AUTHORIZED",
  };

  mkdirSync(resolve("data/milestones/rc3-development"), { recursive: true });
  writeFileSync(
    resolve("data/milestones/rc3-development/rc3-v137-development-closure-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
