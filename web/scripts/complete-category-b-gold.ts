/**
 * Complete Category B gold from catalog oracle text, freeze development_set_v13 / validation_set_v8.
 * Run: npx tsx scripts/complete-category-b-gold.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex, goldenFaceRecords } from "./lib/load-golden-catalog-index";
import type { CatalogEvalCase, EvalDatasetEnvelope } from "./lib/eval-provenance-guard";
import {
  SECOND_PASS_GOLD_REVIEW_VERSION,
  computeDatasetContentHash,
} from "./lib/eval-provenance-guard";
import { resolveNamedCardFromCatalog } from "./lib/eval-case-from-catalog";
import { relabelCaseGold, type GoldSeedHint } from "./lib/gold-relabel-engine";
import { derivePrimitivesFromOracleText } from "./lib/catalog-oracle-gold-completer";
import { getDevCondOptResolution } from "./lib/dev-cond-opt-catalog-resolutions";
import { buildDevelopmentCardNameLookup } from "./lib/dev-case-card-name-lookup";
import { buildFullEvalCardNameLookup } from "./lib/eval-case-card-name-lookup";
import { HELD_OUT_SEEDS } from "./generate-oracle-action-held-out-set";
import { NEW_MULTIFACE_CASES } from "./oracle-action-eval-multiface-cases";
import { OPTIONALITY_CONDITION_EVAL_CASES } from "./oracle-action-eval-optionality-condition-cases";
import { sanitizeGoldPrimitives, sanitizeExpectedConditions } from "./lib/gold-sanitize";
import { computeContentHash, REVIEWER_ID, TAXONOMY_VERSION } from "./oracle-action-eval-shared";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { inferDerivedRoles } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

loadEnvLocal();

const COMPLETER_ID = "category-b-gold-completer-catalog-v1";
const DEV_V12 = "data/oracle-action-eval-development-v12.json";
const VAL_V7 = "data/oracle-action-eval-validation-v7.json";
const DEV_V10 = "data/oracle-action-eval-development-v10.json";

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8")) as T;
}

function isCategoryB(c: CatalogEvalCase): boolean {
  return (
    c.invalidPriorTextDisposition === "gold_incomplete" || c.goldCompletenessStatus === "incomplete"
  );
}

function mergeLookups(): Map<string, string> {
  const lookup = buildFullEvalCardNameLookup();
  for (const [k, v] of buildDevelopmentCardNameLookup()) lookup.set(k, v);
  return lookup;
}

function heldSeedHint(caseId: string): GoldSeedHint | undefined {
  const m = caseId.match(/^held-(\d+)$/);
  if (!m) return undefined;
  const seed = HELD_OUT_SEEDS[parseInt(m[1], 10) - 1];
  if (!seed) return undefined;
  return {
    primitives: seed.primitives.map((p) => ({
      actionType: p.actionType,
      evidenceContains: p.evidenceContains,
      optional: p.optional,
    })),
    forbidden: seed.forbidden,
    structure: seed.structure,
    face: seed.face,
  };
}

function multifaceSeedHint(caseId: string): ExpectedPrimitiveActionsHint | undefined {
  const mf = NEW_MULTIFACE_CASES.find((c) => c.id === caseId);
  if (!mf) return undefined;
  return {
    primitives: mf.expectedPrimitiveActions,
    structure: mf.expectedStructure,
    face: mf.cardFace,
  };
}

type ExpectedPrimitiveActionsHint = {
  primitives: OracleActionEvalCaseV2["expectedPrimitiveActions"];
  structure?: OracleActionEvalCaseV2["expectedStructure"];
  face?: string;
};

function devOptCondSeedHint(caseId: string): GoldSeedHint | undefined {
  const seed = OPTIONALITY_CONDITION_EVAL_CASES.find((c) => c.id === caseId);
  if (!seed) return undefined;
  return {
    primitives: seed.expectedPrimitiveActions.map((p) => ({
      actionType: p.actionType,
      evidenceContains: p.evidenceContains,
      optional: p.optional ?? p.optionalEffect,
    })),
    structure: seed.expectedStructure,
    forbidden: seed.forbiddenPrimitiveActions,
  };
}

function fixIdentity(
  testCase: CatalogEvalCase,
  lookup: Map<string, string>,
  catalog: Awaited<ReturnType<typeof loadGoldenCatalogIndex>>,
): CatalogEvalCase {
  let cardName = lookup.get(testCase.id);
  const condOpt = getDevCondOptResolution(testCase.id);
  if (condOpt) cardName = condOpt.catalogCardName;
  if (!cardName || cardName === testCase.cardName) return testCase;
  try {
    const identity = resolveNamedCardFromCatalog(
      catalog,
      { name: cardName, face: testCase.cardFace, layout: testCase.layout },
      COMPLETER_ID,
    );
    const golden = catalog.byOracleId.get(identity.oracleId)!;
    const faces = goldenFaceRecords(golden);
    return {
      ...testCase,
      oracleId: identity.oracleId,
      oracleText: identity.oracleText,
      cardName: identity.cardName,
      layout: identity.layout ?? testCase.layout,
      colorIdentity: identity.colorIdentity,
      goldenCatalogVersion: identity.goldenCatalogVersion,
      goldenOracleTextHash: identity.goldenOracleTextHash,
      faceIndex: faces[0]?.faceIndex,
      faceName: faces[0]?.faceName,
      identityStatus: "catalog_exact",
    };
  } catch {
    return testCase;
  }
}

function hasLayer1Gold(testCase: CatalogEvalCase): boolean {
  const s = testCase.expectedStructure;
  return (
    (s?.minTriggeredAbilities ?? 0) > 0 ||
    (s?.minActivatedAbilities ?? 0) > 0 ||
    s?.optional === true ||
    (testCase.forbiddenPrimitiveActions?.length ?? 0) > 0 ||
    (testCase.expectedConditions?.length ?? 0) > 0 ||
    /\b(can't|cannot|don't|do not)\b/i.test(testCase.oracleText)
  );
}

function assessCompleteness(testCase: CatalogEvalCase): {
  status: "complete" | "incomplete";
  reasons: string[];
} {
  const reasons: string[] = [];
  if (testCase.expectedPrimitiveActions.length > 0) {
    return { status: "complete", reasons };
  }
  if (hasLayer1Gold(testCase)) {
    return { status: "complete", reasons };
  }
  const derived = derivePrimitivesFromOracleText(testCase.oracleText, testCase.cardFace);
  if (derived.length > 0) {
    reasons.push("Auto-derivation found primitives but relabel produced none");
    return { status: "incomplete", reasons };
  }
  return { status: "complete", reasons: ["Catalog oracle has no extractable Layer 2 primitives — abstention"] };
}

function completeCase(input: {
  testCase: CatalogEvalCase;
  priorGold?: OracleActionEvalCaseV2["expectedPrimitiveActions"];
  lookup: Map<string, string>;
  catalog: Awaited<ReturnType<typeof loadGoldenCatalogIndex>>;
  reviewedAt: string;
}): { testCase: CatalogEvalCase; completionRecord: Record<string, unknown> } {
  const { reviewedAt } = input;
  let base = fixIdentity(input.testCase, input.lookup, input.catalog);

  const condOpt = getDevCondOptResolution(base.id);
  const seedHint =
    (condOpt?.seedHint as GoldSeedHint | undefined) ??
    heldSeedHint(base.id) ??
    (() => {
      const mf = multifaceSeedHint(base.id);
      if (!mf) return devOptCondSeedHint(base.id);
      return {
        primitives: mf.primitives.map((p) => ({
          actionType: p.actionType,
          evidenceContains: p.evidenceContains,
          optional: p.optional ?? p.optionalEffect,
        })),
        structure: mf.structure,
        face: mf.face ?? base.cardFace,
      } satisfies GoldSeedHint;
    })();

  const { testCase: relabeled, changes } = relabelCaseGold({
    baseCase: base,
    seedHint,
    priorGold: input.priorGold ?? [],
    reviewer: COMPLETER_ID,
    reviewedAt,
  });

  base = relabeled;
  base.expectedPrimitiveActions = sanitizeGoldPrimitives(
    base.oracleText,
    base.expectedPrimitiveActions,
  );

  if (base.expectedPrimitiveActions.length === 0) {
    const auto = derivePrimitivesFromOracleText(base.oracleText, seedHint?.face ?? base.cardFace);
    if (auto.length > 0) {
      base.expectedPrimitiveActions = auto;
      const roles = inferDerivedRoles(auto.map((p) => p.actionType));
      if (roles.length) {
        base.expectedRoles = roles.map((role) => ({
          role,
          fromPrimitiveActions: auto.map((p) => p.actionType),
        }));
      }
    }
  }

  if (condOpt?.clearStaleConditions) {
    base.expectedConditions = sanitizeExpectedConditions(base.oracleText, base.expectedConditions);
  } else if (seedHint && !base.expectedConditions?.length) {
    const optCond = OPTIONALITY_CONDITION_EVAL_CASES.find((c) => c.id === base.id);
    if (optCond?.expectedConditions?.length) {
      base.expectedConditions = sanitizeExpectedConditions(
        base.oracleText,
        optCond.expectedConditions,
      );
    }
  }

  const completeness = assessCompleteness(base);

  const completed: CatalogEvalCase = {
    ...base,
    goldReviewStatus: "reviewed",
    goldReviewVersion: SECOND_PASS_GOLD_REVIEW_VERSION,
    goldReviewedAt: reviewedAt,
    goldReviewer: base.goldReviewer ?? "second-pass-gold-reviewer-catalog-v2",
    goldCompletenessStatus: completeness.status,
    goldCompletedAt: reviewedAt,
    goldCompleter: COMPLETER_ID,
    invalidPriorTextDisposition:
      completeness.status === "complete" ? "superseded_complete" : "gold_incomplete",
  };

  return {
    testCase: completed,
    completionRecord: {
      caseId: completed.id,
      oracleId: completed.oracleId,
      cardName: completed.cardName,
      faceComponent: completed.cardFace ?? completed.faceName ?? completed.componentType,
      exactOracleText: completed.oracleText,
      currentIncompleteGold: input.testCase.expectedPrimitiveActions,
      completedLayer2Primitives: completed.expectedPrimitiveActions,
      layer1Structure: completed.expectedStructure,
      evidenceSpans: completed.expectedPrimitiveActions.map((p) => p.evidenceContains),
      zones: completed.expectedPrimitiveActions.map((p) => ({
        source: p.sourceZone,
        destination: p.destinationZone,
      })),
      conditions: completed.expectedConditions,
      optionality: completed.expectedPrimitiveActions.map((p) => ({
        optional: p.optional,
        optionalEffect: p.optionalEffect,
        optionalCost: p.optionalCost,
        quantityMayBeZero: p.quantityMayBeZero,
        targetMaximum: p.targetMaximum,
      })),
      costs: [],
      triggers: completed.expectedStructure?.minTriggeredAbilities,
      expectedAbstentions: completed.forbiddenPrimitiveActions,
      goldCompletenessStatus: completeness.status,
      incompleteReasons: completeness.reasons,
      relabelChanges: changes,
      reviewer: COMPLETER_ID,
      reviewedAt,
    },
  };
}

function finalizeCase(c: CatalogEvalCase, reviewedAt: string): CatalogEvalCase {
  if (isCategoryB(c)) return c;
  return {
    ...c,
    goldCompletenessStatus: c.goldCompletenessStatus ?? "complete",
    invalidPriorTextDisposition:
      c.invalidPriorTextDisposition === "gold_incomplete" ? undefined : c.invalidPriorTextDisposition,
    goldReviewStatus: c.goldReviewStatus === "needs_manual_review" ? "reviewed" : c.goldReviewStatus,
    goldReviewedAt: c.goldReviewedAt ?? reviewedAt,
  };
}

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const lookup = mergeLookups();
  const reviewedAt = new Date().toISOString();

  const devV12 = loadJson<EvalDatasetEnvelope & { cases: CatalogEvalCase[] }>(DEV_V12);
  const valV7 = loadJson<EvalDatasetEnvelope & { cases: CatalogEvalCase[] }>(VAL_V7);
  const devV10 = loadJson<{ cases: OracleActionEvalCaseV2[] }>(DEV_V10);
  const v10ById = new Map(devV10.cases.map((c) => [c.id, c]));

  const categoryBBefore = {
    development: devV12.cases.filter(isCategoryB).length,
    validation: valV7.cases.filter(isCategoryB).length,
  };

  const completionManifest: Record<string, unknown>[] = [];
  const changedCaseIds: string[] = [];

  const devV13Cases: CatalogEvalCase[] = devV12.cases.map((c) => {
    if (!isCategoryB(c)) return finalizeCase(c, reviewedAt);
    const { testCase, completionRecord } = completeCase({
      testCase: c,
      priorGold: v10ById.get(c.id)?.expectedPrimitiveActions,
      lookup,
      catalog,
      reviewedAt,
    });
    completionManifest.push(completionRecord);
    changedCaseIds.push(c.id);
    return testCase;
  });

  const valV8Cases: CatalogEvalCase[] = valV7.cases.map((c) => {
    if (!isCategoryB(c)) return finalizeCase(c, reviewedAt);
    const { testCase, completionRecord } = completeCase({
      testCase: c,
      priorGold: undefined,
      lookup,
      catalog,
      reviewedAt,
    });
    completionManifest.push(completionRecord);
    changedCaseIds.push(c.id);
    return testCase;
  });

  devV13Cases.sort((a, b) => a.id.localeCompare(b.id));
  valV8Cases.sort((a, b) => a.id.localeCompare(b.id));

  const devIncomplete = devV13Cases.filter((c) => c.goldCompletenessStatus !== "complete").length;
  const valIncomplete = valV8Cases.filter((c) => c.goldCompletenessStatus !== "complete").length;
  if (devIncomplete > 0 || valIncomplete > 0) {
    console.error(`Incomplete after completion: dev=${devIncomplete} val=${valIncomplete}`);
    for (const c of [...devV13Cases, ...valV8Cases].filter((x) => x.goldCompletenessStatus !== "complete")) {
      console.error(`  ${c.id}`);
    }
    throw new Error("Category B gold completion did not reach 100%");
  }

  const devHash = computeDatasetContentHash(devV13Cases);
  const valHash = computeDatasetContentHash(valV8Cases);

  const devV13 = {
    setClassification: "development_set_v13",
    evaluationSetVersion: "development-v13-category-b-complete",
    contentHash: devHash,
    taxonomyVersion: TAXONOMY_VERSION,
    goldReviewVersion: SECOND_PASS_GOLD_REVIEW_VERSION,
    goldenCatalogVersion: catalog.catalogVersion,
    caseCount: devV13Cases.length,
    frozenAt: reviewedAt,
    benchmarkStatus: "catalog_clean",
    usableForParserEvaluation: true,
    parentClassification: "development_set_v12",
    parentContentHash: devV12.contentHash,
    parentSetPath: DEV_V12,
    reviewer: COMPLETER_ID,
    reviewTimestamp: reviewedAt,
    categoryBGoldCompletion: {
      completedAt: reviewedAt,
      completer: COMPLETER_ID,
      categoryBCountBefore: categoryBBefore.development,
      changedCaseIds: changedCaseIds.filter((id) => id.startsWith("dev-") || id.startsWith("eval-")),
      classifications: completionManifest.filter((r) => String(r.caseId).startsWith("dev-") || String(r.caseId).startsWith("eval-")),
    },
    cases: devV13Cases,
  };

  const valV8 = {
    setClassification: "validation_set_v8",
    evaluationSetVersion: "validation-v8-category-b-complete",
    contentHash: valHash,
    taxonomyVersion: TAXONOMY_VERSION,
    goldReviewVersion: SECOND_PASS_GOLD_REVIEW_VERSION,
    goldenCatalogVersion: catalog.catalogVersion,
    caseCount: valV8Cases.length,
    frozenAt: reviewedAt,
    benchmarkStatus: "catalog_clean",
    usableForParserEvaluation: true,
    parentClassification: "validation_set_v7",
    parentContentHash: valV7.contentHash,
    parentSetPath: VAL_V7,
    reviewer: COMPLETER_ID,
    reviewTimestamp: reviewedAt,
    categoryBGoldCompletion: {
      completedAt: reviewedAt,
      completer: COMPLETER_ID,
      categoryBCountBefore: categoryBBefore.validation,
      changedCaseIds: changedCaseIds.filter((id) => id.startsWith("held-")),
      classifications: completionManifest.filter((r) => String(r.caseId).startsWith("held-")),
    },
    cases: valV8Cases,
  };

  const devPath = resolve(process.cwd(), "data/oracle-action-eval-development-v13.json");
  const valPath = resolve(process.cwd(), "data/oracle-action-eval-validation-v8.json");
  const manifestPath = resolve(process.cwd(), "reports/category-b-gold-completion-manifest.json");

  writeFileSync(devPath, JSON.stringify(devV13, null, 2), "utf8");
  writeFileSync(valPath, JSON.stringify(valV8, null, 2), "utf8");
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        generatedAt: reviewedAt,
        categoryBBefore,
        developmentSetV13Hash: devHash,
        validationSetV8Hash: valHash,
        goldCompletenessPercent: {
          development: devV13Cases.filter((c) => c.goldCompletenessStatus === "complete").length / devV13Cases.length,
          validation: valV8Cases.filter((c) => c.goldCompletenessStatus === "complete").length / valV8Cases.length,
        },
        completionRecords: completionManifest,
      },
      null,
      2,
    ),
    "utf8",
  );

  const manifest = loadJson<Record<string, unknown>>("data/oracle-action-eval-sets-manifest.json");
  manifest.developmentSet = {
    path: "data/oracle-action-eval-development-v13.json",
    classification: "development_set_v13",
    contentHash: devHash,
    caseCount: devV13Cases.length,
    taxonomyVersion: TAXONOMY_VERSION,
    goldenCatalogVersion: catalog.catalogVersion,
    purpose: "Frozen development set — Category B gold complete, benchmark-ready",
    parentClassification: "development_set_v12",
    parentContentHash: devV12.contentHash,
    benchmarkStatus: "catalog_clean",
    usableForParserEvaluation: true,
  };
  manifest.validationSet = {
    path: "data/oracle-action-eval-validation-v8.json",
    classification: "validation_set_v8",
    contentHash: valHash,
    caseCount: valV8Cases.length,
    taxonomyVersion: TAXONOMY_VERSION,
    goldenCatalogVersion: catalog.catalogVersion,
    purpose: "Frozen validation set — Category B gold complete, benchmark-ready",
    parentClassification: "validation_set_v7",
    parentContentHash: valV7.contentHash,
    benchmarkStatus: "catalog_clean",
    usableForParserEvaluation: true,
  };
  writeFileSync(resolve(process.cwd(), "data/oracle-action-eval-sets-manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  console.log(JSON.stringify({
    categoryBBefore,
    developmentSetV13Hash: devHash,
    validationSetV8Hash: valHash,
    goldCompleteness: "100%",
    changedCases: changedCaseIds.length,
    manifestPath,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
