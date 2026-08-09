/**
 * RC3 v1.37 gate closure — FP ledger, unrelated FN reconciliation,
 * granted-FN semantic grounding census, benchmark identity audit.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { parseOracleSemanticsRC3, ORACLE_ACTION_RC3_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import type { OracleSemanticParse } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-schema";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import {
  evaluateCaseSemantic,
  sumSemanticMetrics,
  matchGoldToSemanticActions,
  semanticActionsForMatch,
  semanticPrimitiveMatchesExpected,
  type SemanticActionForMatch,
} from "./oracle-action-semantic-matcher";
import {
  countParserFalsePositives,
  type ExtractedActionForMatch,
} from "./oracle-action-unified-matcher";
import {
  classifyUnmatchedAction,
  evidenceMatchesExtracted,
  inferSupportedPrimitiveFromEvidence,
} from "./oracle-action-eval-shared";
import { applyGoldMigrationV135 } from "./lib/rc3-gold-migration-v135";
import { loadEnvLocal } from "./lib/script-env";
import {
  auditCatalogIdentity,
  auditBenchmarkTargetValidity,
  spanFromRange,
  type TextSpan,
} from "./lib/benchmark-identity";
import { loadGoldenCatalogIndex } from "./lib/load-golden-catalog-index";

loadEnvLocal();

type Envelope = { cases: OracleActionEvalCaseV2[] };

type FpClassification =
  | "genuine_over_extraction"
  | "wrong_primitive"
  | "wrong_optionality_dependency"
  | "context_leakage"
  | "duplicate_dedupe"
  | "scope_issue"
  | "incomplete_defective_gold"
  | "evaluator_defect";

type PipelineFailureStage =
  | "A0_candidate"
  | "A1_context_router"
  | "B_classifier"
  | "ability_structure"
  | "clause_segmentation"
  | "primitive_extraction"
  | "referent_resolution"
  | "semantic_action_builder"
  | "dedupe"
  | "evaluator";

type ErrorClass =
  | "missing_emission"
  | "wrong_action_type"
  | "wrong_args"
  | "wrong_optionality"
  | "wrong_context"
  | "wrong_owner"
  | "wrong_evidence"
  | "choice_dependency"
  | "other";

type FnFamily =
  | "granted_semantics"
  | "zone_transitions"
  | "replacement_effects"
  | "optionality_dependency"
  | "other"
  | "mdfc_face_structure"
  | "search_shuffle_chains"
  | "activated_effects";

const OUT_DIR = resolve("data/milestones/rc3-development");
const PARENT_LEDGER = resolve(OUT_DIR, "action-match-ledger-parent-c446b6b.json");
const STABLE_BASELINE_FP_COUNT = 4;
const STABLE_BASELINE_NOTE = "580/4/62 same-policy v135 development overlay";
/** Accepted-tier FPs at v135 same-policy overlay (580/4/62) — keys verified against v135 promotion baseline. */
const STABLE_FP_KEYS = new Set([
  fpKey("dev-v9-018", "search_library", "search their library"),
  fpKey("eval-0158", "deal_damage", "deals 1 damage to any target"),
  fpKey("dev-exp-v1-012", "search_library", "Search your library for a basic land card, reveal it, put it into your hand, then shuffle"),
  fpKey("rc3-pos-cat-0025", "deal_damage", "deals damage equal to the number of o's in name stickers on this enchantment to any target"),
]);

function loadScoringCases(path: string): OracleActionEvalCaseV2[] {
  return applyGoldMigrationV135((JSON.parse(readFileSync(resolve(path), "utf8")) as Envelope).cases);
}

function loadCombinedCases(): OracleActionEvalCaseV2[] {
  const legacyV14Paths = [
    "data/oracle-action-eval-development-v26-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v2-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v3-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v5-v14.json",
  ];
  const positiveCatalog = loadScoringCases("data/oracle-action-eval-rc3-positive-training-catalog-v133.json");
  return [...legacyV14Paths.flatMap(loadScoringCases), ...positiveCatalog];
}

function fpKey(caseId: string, actionType: string, evidence: string): string {
  return `${caseId}\u001f${actionType}\u001f${evidence}`;
}

function extractedForFpFromParse(parse: OracleSemanticParse): ExtractedActionForMatch[] {
  return semanticActionsForMatch(parse).map((a) => ({
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
  }));
}

function classifyFp(
  testCase: OracleActionEvalCaseV2,
  parse: OracleSemanticParse,
  action: SemanticActionForMatch,
): FpClassification {
  const evidence = action.evidenceText;
  const primitive = action.actionType;
  const supported = inferSupportedPrimitiveFromEvidence(testCase.oracleText, evidence);
  if (!supported) return "genuine_over_extraction";
  if (supported !== primitive) return "wrong_primitive";

  const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
  const forbidden = testCase.forbiddenPrimitiveActions ?? [];
  if (forbidden.includes(primitive as never)) return "genuine_over_extraction";

  const dup = parse.actions.filter(
    (a, i) =>
      i !== action.index &&
      a.reviewStatus === "accepted" &&
      a.actionType === primitive &&
      a.provenance.actionSpan.text === evidence,
  );
  if (dup.length > 0) return "duplicate_dedupe";

  const goldSame = expected.some(
    (e) => e.actionType === primitive && evidenceMatchesExtracted(evidence, e.evidenceContains),
  );
  if (!goldSame && testCase.oracleText.toLowerCase().includes(evidence.toLowerCase().slice(0, Math.min(12, evidence.length)))) {
    return "incomplete_defective_gold";
  }
  if (!goldSame) return "genuine_over_extraction";

  if (testCase.cardFace && action.faceId !== testCase.cardFace) return "scope_issue";

  const partialGold = expected.some((e) => e.actionType === primitive);
  if (partialGold) {
    const exp = expected.find((e) => e.actionType === primitive)!;
    const expectedOptional = exp.optionalEffect ?? exp.optional;
    if (expectedOptional !== undefined && (action.optionalEffect ?? false) !== expectedOptional) {
      return "wrong_optionality_dependency";
    }
    if (action.executionContext === "granted_ability" || action.semanticOwner === "granted_object") {
      return "context_leakage";
    }
    return "evaluator_defect";
  }
  return "evaluator_defect";
}

function collectFpLedger(cases: OracleActionEvalCaseV2[]) {
  const entries: Array<Record<string, unknown>> = [];
  for (const testCase of cases) {
    const parse = parseOracleSemanticsRC3({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const match = matchGoldToSemanticActions({
      expected,
      parse,
      tier: "accepted",
      oracleText: testCase.oracleText,
      caseId: testCase.id,
    });
    const actions = semanticActionsForMatch(parse);
    const extracted = extractedForFpFromParse(parse);

    for (const idx of match.unmatchedActionIndices) {
      const action = actions[idx]!;
      if (action.reviewStatus !== "accepted") continue;
      if (action.cardNativeLayer2Eligible === false) continue;
      if (countParserFalsePositives(testCase, [idx], extracted) === 0) continue;

      const raw = parse.actions[idx]!;
      const ext = raw as { extractionSource?: string };
      const extractionSource =
        ext.extractionSource ??
        (raw.clauseId?.includes("granted") ? "rc3_clause_native" : "rc3_transform_or_legacy");
      entries.push({
        caseId: testCase.id,
        canonicalCard: (testCase as { cardName?: string }).cardName ?? testCase.id,
        actionType: action.actionType,
        evidence: action.evidenceText,
        extractionSource,
        executionContext: action.executionContext ?? "immediate",
        semanticOwner: action.semanticOwner ?? "source_card",
        cardNativeLayer2Eligible: action.cardNativeLayer2Eligible ?? true,
        caseScope: (testCase as { caseScope?: string }).caseScope ?? "full_card",
        goldExpectation: "none — unmatched accepted emission",
        fpClassification: classifyFp(testCase, parse, action),
        optionalEffect: action.optionalEffect ?? false,
        parentAbilityId: raw.parentAbilityId,
        clauseId: raw.clauseId,
      });
    }
  }
  return entries;
}

function loadParentFpKeys(): Set<string> {
  if (!existsSync(PARENT_LEDGER)) return new Set();
  const ledger = JSON.parse(readFileSync(PARENT_LEDGER, "utf8")) as {
    fpRows?: Array<{ caseId: string; actionType: string; evidence: string }>;
  };
  if (ledger.fpRows?.length) {
    return new Set(ledger.fpRows.map((r) => fpKey(r.caseId, r.actionType, r.evidence)));
  }
  return new Set();
}

function classifyFamily(testCase: OracleActionEvalCaseV2, gold: OracleActionEvalCaseV2["expectedPrimitiveActions"][number]): FnFamily {
  const ev = (gold.evidenceContains ?? "").toLowerCase();
  const text = testCase.oracleText.toLowerCase();
  const stratum = (testCase as { coverageStratum?: string }).coverageStratum ?? "";
  const category = (testCase as { category?: string }).category ?? "";
  if (
    /would.*instead|if a source would|prevent.*damage/i.test(text) ||
    /exile it instead/i.test(ev) ||
    category.includes("replacement")
  ) {
    return "replacement_effects";
  }
  if (/granted|enchanted creature has|equipped creature has|creatures you control have/i.test(text) || stratum.includes("granted")) {
    return "granted_semantics";
  }
  if (gold.optionalEffect || gold.optionalCost || /\bmay\b/.test(ev) || /if you do/i.test(text)) return "optionality_dependency";
  if (/search your library|shuffle/i.test(text) && /search|shuffle/i.test(ev)) return "search_shuffle_chains";
  if (/\{[^}]+\}.*:/.test(text) && /:\s/.test(ev)) return "activated_effects";
  if (/\/\//.test(testCase.oracleText) || testCase.cardFace) return "mdfc_face_structure";
  if (/exile|return|put.*onto the battlefield|from your graveyard|from exile/i.test(ev)) return "zone_transitions";
  return "other";
}

function diagnoseFnFailure(
  testCase: OracleActionEvalCaseV2,
  gold: OracleActionEvalCaseV2["expectedPrimitiveActions"][number],
  parse: OracleSemanticParse,
): { failureStage: PipelineFailureStage; errorClass: ErrorClass } {
  const actions = semanticActionsForMatch(parse).filter((a) => a.reviewStatus === "accepted");
  const sameType = actions.filter((a) => a.actionType === gold.actionType);
  const evidenceHit = sameType.some((a) => evidenceMatchesExtracted(a.evidenceText, gold.evidenceContains ?? ""));

  if (actions.length === 0) {
    return { failureStage: "semantic_action_builder", errorClass: "missing_emission" };
  }
  if (sameType.length === 0) {
    const partialType = actions.filter((a) =>
      semanticPrimitiveMatchesExpected(a, gold, parse, { ignoreOptionalEffect: true }),
    );
    if (partialType.length === 0) {
      const anyEvidence = actions.some((a) => evidenceMatchesExtracted(a.evidenceText, gold.evidenceContains ?? ""));
      if (!anyEvidence) return { failureStage: "primitive_extraction", errorClass: "wrong_action_type" };
      return { failureStage: "semantic_action_builder", errorClass: "wrong_action_type" };
    }
    return { failureStage: "semantic_action_builder", errorClass: "wrong_action_type" };
  }
  if (!evidenceHit) {
    return { failureStage: "referent_resolution", errorClass: "wrong_evidence" };
  }

  const expectedOptional = gold.optionalEffect ?? gold.optional;
  if (expectedOptional !== undefined) {
    const optHit = sameType.some((a) => (a.optionalEffect ?? false) === expectedOptional);
    if (!optHit) return { failureStage: "semantic_action_builder", errorClass: "wrong_optionality" };
  }

  if (gold.choiceGroupId !== undefined) {
    return { failureStage: "semantic_action_builder", errorClass: "choice_dependency" };
  }

  const matched = sameType.find((a) => semanticPrimitiveMatchesExpected(a, gold, parse));
  if (matched) {
    if (matched.executionContext === "granted_ability" && matched.semanticOwner !== "granted_object") {
      return { failureStage: "semantic_action_builder", errorClass: "wrong_owner" };
    }
    if (matched.executionContext !== "granted_ability" && /cast from exile|cast .* remains exiled/i.test(gold.evidenceContains ?? "")) {
      return { failureStage: "semantic_action_builder", errorClass: "wrong_context" };
    }
    return { failureStage: "evaluator", errorClass: "other" };
  }

  return { failureStage: "evaluator", errorClass: "other" };
}

function reconcileUnrelatedFns(unrelatedCases: OracleActionEvalCaseV2[]) {
  const items: Array<Record<string, unknown>> = [];
  for (const testCase of unrelatedCases) {
    const parse = parseOracleSemanticsRC3({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const matched = matchGoldToSemanticActions({
      expected,
      parse,
      tier: "accepted",
      oracleText: testCase.oracleText,
      caseId: testCase.id,
    });
    const matchedExpected = new Set(matched.matches.filter((m) => m.matched).map((m) => m.expectedIndex));
    for (let ei = 0; ei < expected.length; ei++) {
      if (matchedExpected.has(ei)) continue;
      const gold = expected[ei]!;
      const family = classifyFamily(testCase, gold);
      const { failureStage, errorClass } = diagnoseFnFailure(testCase, gold, parse);
      const emitted = parse.actions
        .filter((a) => a.reviewStatus === "accepted")
        .map((a) => ({
          actionType: a.actionType,
          evidence: a.provenance.actionSpan.text,
          executionContext: a.executionContext,
          semanticOwner: a.semanticOwner,
        }));
      items.push({
        caseId: testCase.id,
        cardName: (testCase as { cardName?: string }).cardName,
        family,
        expectedActionType: gold.actionType,
        expectedEvidence: gold.evidenceContains,
        failureStage,
        errorClass,
        emittedAcceptedActions: emitted.filter(
          (e) => e.actionType === gold.actionType || /cast|exile|add_mana/i.test(String(e.evidence)),
        ),
      });
    }
  }
  return items;
}

function buildGrantedFnGrounding(unrelatedCases: OracleActionEvalCaseV2[]) {
  const grantedFnItems = reconcileUnrelatedFns(unrelatedCases).filter((i) => i.family === "granted_semantics");
  const caseById = new Map(unrelatedCases.map((c) => [c.id, c]));
  const grounded: Array<Record<string, unknown>> = [];

  for (const item of grantedFnItems) {
    const testCase = caseById.get(String(item.caseId))!;
    const parse = parseOracleSemanticsRC3({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const gold = testCase.expectedPrimitiveActions.find(
      (g) => !g.negative && g.actionType === item.expectedActionType && g.evidenceContains === item.expectedEvidence,
    )!;
    const oracle = testCase.oracleText;
    const evidenceNeedle = gold.evidenceContains ?? "";
    const evidenceStart = oracle.toLowerCase().indexOf(evidenceNeedle.toLowerCase().slice(0, Math.min(20, evidenceNeedle.length)));
    const evidenceSpan: TextSpan | undefined =
      evidenceStart >= 0
        ? spanFromRange(oracle, evidenceStart, evidenceStart + evidenceNeedle.length)
        : undefined;

    let grantedRegionSpan: TextSpan | undefined;
    let grantingAbilitySpan: TextSpan | undefined;
    const gainsMatch = oracle.match(/Target land gains "([^"]+)"/i);
    if (gainsMatch?.index !== undefined) {
      grantingAbilitySpan = spanFromRange(oracle, gainsMatch.index, gainsMatch.index + gainsMatch[0].length);
      const inner = gainsMatch[1] ?? "";
      grantedRegionSpan = spanFromRange(oracle, gainsMatch.index + gainsMatch[0].indexOf(inner), gainsMatch.index + gainsMatch[0].indexOf(inner) + inner.length);
    }
    const insteadMatch = oracle.match(/exile it instead/i);
    if (insteadMatch?.index !== undefined) {
      evidenceSpan && (evidenceSpan);
      grantingAbilitySpan = spanFromRange(oracle, insteadMatch.index, insteadMatch.index + insteadMatch[0].length);
    }

    const sameType = semanticActionsForMatch(parse).filter(
      (a) => a.reviewStatus === "accepted" && a.actionType === gold.actionType,
    );
    const bestEmission = sameType[0];

    const checks = {
      grantedRegionFound: Boolean(gainsMatch || insteadMatch),
      contextCorrect: bestEmission?.executionContext === "granted_ability",
      semanticOwnerCorrect: bestEmission?.semanticOwner === "granted_object",
      nestedAbilityBlockCorrect: Boolean(bestEmission?.parentAbilityId?.includes("granted")),
      clauseSegmentationCorrect: sameType.some((a) => evidenceMatchesExtracted(a.evidenceText, evidenceNeedle)),
      primitiveExtractionCorrect: sameType.length > 0,
      optionalityCorrect:
        gold.optionalEffect === undefined
          ? true
          : sameType.some((a) => (a.optionalEffect ?? false) === gold.optionalEffect),
      choiceDependencyCorrect: gold.choiceGroupId === undefined,
      evidenceProvenanceCorrect: sameType.some((a) => evidenceMatchesExtracted(a.evidenceText, evidenceNeedle)),
    };

    let subfamily = "other_granted";
    if (/cast from exile|cast .* for as long as it remains exiled/i.test(evidenceNeedle)) {
      subfamily = "granted_land_mana_activated_cast_permission";
    } else if (/exile it instead/i.test(evidenceNeedle)) {
      subfamily = "replacement_exile_instead_misclassified_as_granted";
    } else if (checks.primitiveExtractionCorrect && checks.optionalityCorrect && !checks.contextCorrect) {
      subfamily = "granted_trigger_context_propagation";
    } else if (!checks.primitiveExtractionCorrect) {
      subfamily = "granted_activated_primitive_extraction";
    }

    grounded.push({
      caseId: item.caseId,
      card: (testCase as { cardName?: string }).cardName,
      oracleClause: oracle.slice(0, 160).replace(/\n/g, " "),
      expectedPrimitive: gold.actionType,
      actualPrimitive: bestEmission?.actionType ?? null,
      actualEmission: bestEmission?.evidenceText ?? null,
      expectedAction: {
        actionType: gold.actionType,
        evidenceContains: gold.evidenceContains,
        optionalEffect: gold.optionalEffect,
        executionContext: "granted_ability",
        semanticOwner: "granted_object",
      },
      actionEvidenceSpan: evidenceSpan,
      owningGrantedAbilitySpan: grantingAbilitySpan,
      grantedRegionSpan,
      executionContextExpected: "granted_ability",
      executionContextActual: bestEmission?.executionContext ?? null,
      semanticOwnerExpected: "granted_object",
      semanticOwnerActual: bestEmission?.semanticOwner ?? null,
      caseScope: (testCase as { caseScope?: string }).caseScope ?? "full_card",
      structuralChecks: checks,
      subfamily,
      failureStage: item.failureStage,
      errorClass: item.errorClass,
    });
  }

  return grounded;
}

function inferFirstParserVersionFpAppears(
  entry: Record<string, unknown>,
  parentFpKeys: Set<string>,
): string {
  const key = fpKey(String(entry.caseId), String(entry.actionType), String(entry.evidence));
  if (STABLE_FP_KEYS.has(key)) return "v135 same-policy overlay (580/4/62) or earlier";
  if (parentFpKeys.has(key)) return "c446b6b (v1.36 parent) or earlier";
  return "7050c75 (v1.37-rc3-granted-nested-complete) — new vs parent c446b6b";
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const cases = loadCombinedCases();
  const positiveCatalog = loadScoringCases("data/oracle-action-eval-rc3-positive-training-catalog-v133.json");
  const unrelatedCases = positiveCatalog.filter((c) => !(c as { spentV12Regression?: boolean }).spentV12Regression);
  const unrelatedCaseIds = new Set(unrelatedCases.map((c) => c.id));

  const combinedMetricsRaw = sumSemanticMetrics(
    cases.map((c) =>
      evaluateCaseSemantic(c, parseOracleSemanticsRC3({ oracleId: c.oracleId, oracleText: c.oracleText, cardFace: c.cardFace })),
    ),
  );
  const unrelatedMetricsRaw = sumSemanticMetrics(
    unrelatedCases.map((c) =>
      evaluateCaseSemantic(c, parseOracleSemanticsRC3({ oracleId: c.oracleId, oracleText: c.oracleText, cardFace: c.cardFace })),
    ),
  );

  const fpLedger = collectFpLedger(cases);
  const parentFpKeys = loadParentFpKeys();

  const fpWithProvenance = fpLedger.map((e) => {
    const key = fpKey(String(e.caseId), String(e.actionType), String(e.evidence));
    return {
      ...e,
      firstParserVersionWhereFpAppears: inferFirstParserVersionFpAppears(e, parentFpKeys),
      inStable4Baseline: STABLE_FP_KEYS.has(key),
      inParentBaseline: parentFpKeys.has(key),
    };
  });

  const additionalVsStable4 = fpWithProvenance.filter((e) => !e.inStable4Baseline);
  const persistedFromStable4 = fpWithProvenance.filter((e) => e.inStable4Baseline);
  const newVsParent = fpWithProvenance.filter((e) => !e.inParentBaseline);

  const unrelatedFnReconciliation = reconcileUnrelatedFns(cases).filter((i) => unrelatedCaseIds.has(String(i.caseId)));
  const grantedGrounding = buildGrantedFnGrounding(unrelatedCases);

  const subfamilyCounts: Record<string, number> = {};
  for (const g of grantedGrounding) {
    const sf = String(g.subfamily);
    subfamilyCounts[sf] = (subfamilyCounts[sf] ?? 0) + 1;
  }

  let catalogIdentityAudit: Record<string, unknown> = { status: "skipped_no_catalog" };
  try {
    const catalog = await loadGoldenCatalogIndex();
    const oneShot = unrelatedCases.find((c) => c.id === "rc3-pos-one-shot-cast-0001");
    if (oneShot) {
      const idRow = auditCatalogIdentity(catalog, oneShot as never);
      const oracleText = idRow.catalogOracleText ?? oneShot.oracleText;
      const targetRow = auditBenchmarkTargetValidity(oneShot as never, oracleText);
      catalogIdentityAudit = {
        caseId: oneShot.id,
        catalogIdentityStatus: idRow.catalogIdentityStatus,
        assertBenchmarkIdentity: idRow.catalogIdentityStatus === "exact" ? "PASS" : "FAIL",
        benchmarkTargetValidity: targetRow.benchmarkTargetStatus,
        caseScope: (oneShot as { caseScope?: string }).caseScope,
      };
    }
  } catch (err) {
    catalogIdentityAudit = { status: "firestore_unavailable", error: String(err) };
  }

  const failureStageCounts: Record<string, number> = {};
  const errorClassCounts: Record<string, number> = {};
  for (const item of unrelatedFnReconciliation) {
    failureStageCounts[String(item.failureStage)] = (failureStageCounts[String(item.failureStage)] ?? 0) + 1;
    errorClassCounts[String(item.errorClass)] = (errorClassCounts[String(item.errorClass)] ?? 0) + 1;
  }

  const contextPropagationCluster = grantedGrounding.filter(
    (g) =>
      (g.structuralChecks as { primitiveExtractionCorrect?: boolean }).primitiveExtractionCorrect &&
      (g.structuralChecks as { optionalityCorrect?: boolean }).optionalityCorrect &&
      !(g.structuralChecks as { contextCorrect?: boolean }).contextCorrect,
  );

  const commit = execSync("git rev-parse HEAD", { cwd: resolve(".."), encoding: "utf8" }).trim();

  const report = {
    generatedAt: new Date().toISOString(),
    checkpoint: "rc3-v137-gate-closure-audit",
    parserVersion: ORACLE_ACTION_RC3_PARSER_VERSION,
    parserCommitSha: commit,
    combinedMetrics: {
      ...combinedMetricsRaw,
      precision: combinedMetricsRaw.tp / (combinedMetricsRaw.tp + combinedMetricsRaw.fp),
      recall: combinedMetricsRaw.tp / (combinedMetricsRaw.tp + combinedMetricsRaw.fn),
    },
    unrelatedMetrics: {
      ...unrelatedMetricsRaw,
      precision: unrelatedMetricsRaw.tp / (unrelatedMetricsRaw.tp + unrelatedMetricsRaw.fp),
      recall: unrelatedMetricsRaw.tp / (unrelatedMetricsRaw.tp + unrelatedMetricsRaw.fn),
    },
    sectionA_fpLedger: {
      totalFp: fpLedger.length,
      stableBaseline: { tp: 580, fp: STABLE_BASELINE_FP_COUNT, fn: 62, note: STABLE_BASELINE_NOTE },
      parentBaseline: { tp: 575, fp: 7, fn: 74, commit: "c446b6b" },
      current: { tp: combinedMetricsRaw.tp, fp: combinedMetricsRaw.fp, fn: combinedMetricsRaw.fn },
      additionalVsStable4Count: additionalVsStable4.length,
      persistedFromStable4Count: persistedFromStable4.length,
      newVsParentCount: newVsParent.length,
      fpClassificationCounts: fpWithProvenance.reduce(
        (acc, e) => {
          const c = String(e.fpClassification);
          acc[c] = (acc[c] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
      entries: fpWithProvenance,
      persistedFromStable4,
      additionalVsStable4,
      newVsParent,
    },
    sectionB_unrelatedFnReconciliation: {
      totalFn: unrelatedFnReconciliation.length,
      failureStageCounts,
      errorClassCounts,
      accounted: unrelatedFnReconciliation.length === 26,
      items: unrelatedFnReconciliation,
    },
    sectionC_benchmarkIdentity: catalogIdentityAudit,
    sectionD_grantedFnGrounding: {
      count: grantedGrounding.length,
      identityTargetSemanticGates: "run after catalog patch + benchmarkTargets embed",
      entries: grantedGrounding,
    },
    sectionE_grantedSubfamilyCensus: {
      subfamilyCounts,
      contextPropagationClusterSize: contextPropagationCluster.length,
      contextPropagationCases: contextPropagationCluster.map((g) => g.caseId),
      recommendedFirstSubfamily: "granted_land_mana_activated_cast_permission",
      expectedUnrelatedTpRecovery: 8,
      expectedGlobalTpRecovery: 8,
      rationale:
        "Eight cast-permission FNs share one grammar (Target land gains activated mana + cast-from-exile permission); rc3-pos-cat-0020 exile-instead is replacement semantics mis-bucketed",
    },
  };

  const outPath = resolve(OUT_DIR, "rc3-v137-gate-closure-audit.json");
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

  writeFileSync(
    resolve(OUT_DIR, "rc3-fp-ledger-v137.json"),
    `${JSON.stringify({ parserVersion: ORACLE_ACTION_RC3_PARSER_VERSION, entries: fpWithProvenance }, null, 2)}\n`,
  );

  writeFileSync(
    resolve(OUT_DIR, "rc3-unrelated-fn-reconciliation-v137.json"),
    `${JSON.stringify(
      {
        totalFn: unrelatedFnReconciliation.length,
        failureStageCounts,
        errorClassCounts,
        items: unrelatedFnReconciliation,
      },
      null,
      2,
    )}\n`,
  );

  writeFileSync(
    resolve(OUT_DIR, "rc3-granted-unrelated-fn-grounding-v137.json"),
    `${JSON.stringify({ count: grantedGrounding.length, entries: grantedGrounding, subfamilyCounts }, null, 2)}\n`,
  );

  console.log(
    JSON.stringify(
      {
        outPath,
        fp: fpLedger.length,
        unrelatedFn: unrelatedFnReconciliation.length,
        grantedFnGrounded: grantedGrounding.length,
        newVsParent: newVsParent.length,
        additionalVsStable4: Math.max(0, fpLedger.length - STABLE_BASELINE_FP_COUNT),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
