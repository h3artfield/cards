/**
 * Second-pass catalog-backed gold review for active development + validation sets.
 * Marks each case goldReviewStatus, identityStatus, goldReviewVersion.
 * Run: npx tsx scripts/second-pass-gold-review.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex } from "./lib/load-golden-catalog-index";
import type { CatalogEvalCase } from "./lib/eval-provenance-guard";
import { classifyInvalidPriorText } from "./lib/invalid-prior-text-classifier";
import {
  applyGoldReviewToCase,
  reviewCaseGoldSecondPass,
  SECOND_PASS_GOLD_REVIEW_VERSION,
  summarizeGoldReview,
} from "./lib/gold-review-engine";
import { relabelCaseGold, type GoldRelabelChange } from "./lib/gold-relabel-engine";
import { buildDevelopmentCardNameLookup } from "./lib/dev-case-card-name-lookup";
import { buildFullEvalCardNameLookup } from "./lib/eval-case-card-name-lookup";
import { HELD_OUT_SEEDS } from "./generate-oracle-action-held-out-set";
import { repairCaseForGoldReview } from "./lib/gold-sanitize";
import { computeContentHash, REVIEWER_ID } from "./oracle-action-eval-shared";

loadEnvLocal();

const REVIEWER = "second-pass-gold-reviewer-catalog-v2";

function loadJson(path: string) {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8"));
}

async function reviewDataset(input: {
  envelopePath: string;
  outPath: string;
  diffPath: string;
  cardNameLookup: Map<string, string>;
  seedHintsByCaseId?: Map<string, Parameters<typeof relabelCaseGold>[0]["seedHint"]>;
  setClassification: string;
  evaluationSetVersion: string;
}) {
  const catalog = await loadGoldenCatalogIndex();
  const envelope = loadJson(input.envelopePath) as {
    cases: CatalogEvalCase[];
    contentHash: string;
    goldRelabelStatistics?: Record<string, number>;
    caseRelabelEntries?: Array<{ caseId: string; changes: GoldRelabelChange[] }>;
  };
  const reviewedAt = new Date().toISOString();
  const reviewResults = [];
  const updatedCases: CatalogEvalCase[] = [];
  const invalidPriorClassifications = [];

  const relabelByCase = new Map(
    (envelope.caseRelabelEntries ?? []).map((e) => [e.caseId, e.changes]),
  );

  for (const testCase of envelope.cases) {
    const repaired = repairCaseForGoldReview({
      testCase,
      catalog,
      reviewer: REVIEWER,
      reviewedAt,
    });
    const priorIssues = [];
    const relabelChanges = relabelByCase.get(testCase.id);
    if (testCase.invalidPriorTextDisposition === "gold_incomplete") {
      priorIssues.push({
        field: "invalidPriorText",
        message: "Category B: prior invalid and current gold incomplete",
        severity: "error" as const,
      });
    }

    const review = reviewCaseGoldSecondPass({
      testCase: repaired,
      catalog,
      cardName: input.cardNameLookup.get(repaired.id),
      reviewer: REVIEWER,
      reviewedAt,
      priorIssues,
    });

    let updated = applyGoldReviewToCase(repaired, review);

    if (relabelChanges) {
      const invalidClass = classifyInvalidPriorText({
        caseId: repaired.id,
        oracleText: repaired.oracleText,
        cardFace: repaired.cardFace,
        changes: relabelChanges,
        currentGold: updated.expectedPrimitiveActions,
        expectedStructure: updated.expectedStructure,
        forbiddenPrimitiveActions: updated.forbiddenPrimitiveActions,
      });
      updated.invalidPriorTextDisposition = invalidClass.disposition;
      invalidPriorClassifications.push(invalidClass);
      if (invalidClass.disposition === "gold_incomplete") {
        updated.goldReviewStatus = "needs_manual_review";
      }
    }

    updated.evaluationSetVersion = input.evaluationSetVersion;
    reviewResults.push(review);
    updatedCases.push(updated);
  }

  const goldSummary = summarizeGoldReview(reviewResults);
  const allReviewed = goldSummary.reviewed === goldSummary.total;
  const anyGoldIncomplete = invalidPriorClassifications.some((c) => c.disposition === "gold_incomplete");

  const contentHash = computeContentHash(updatedCases);
  const out = {
    ...envelope,
    setClassification: input.setClassification,
    evaluationSetVersion: input.evaluationSetVersion,
    contentHash,
    goldReviewVersion: SECOND_PASS_GOLD_REVIEW_VERSION,
    secondPassGoldReview: {
      reviewer: REVIEWER,
      reviewedAt,
      goldReviewVersion: SECOND_PASS_GOLD_REVIEW_VERSION,
      summary: goldSummary,
      invalidPriorText: {
        definitions: {
          invalid_prior_text:
            "Prior-gold evidence not in catalog text — NOT automatically low-precision cause.",
          superseded_complete_A: "Prior invalid; current catalog gold complete.",
          gold_incomplete_B: "Current gold incomplete — blocks parser evaluation.",
        },
        classifications: invalidPriorClassifications,
        supersededComplete: invalidPriorClassifications.filter((c) => c.disposition === "superseded_complete").length,
        goldIncomplete: invalidPriorClassifications.filter((c) => c.disposition === "gold_incomplete").length,
      },
    },
    usableForParserEvaluation: allReviewed && !anyGoldIncomplete,
    cases: updatedCases,
  };

  writeFileSync(resolve(process.cwd(), input.outPath), JSON.stringify(out, null, 2), "utf8");
  writeFileSync(
    resolve(process.cwd(), input.diffPath),
    JSON.stringify(
      {
        generatedAt: reviewedAt,
        sourcePath: input.envelopePath,
        outputPath: input.outPath,
        goldReviewVersion: SECOND_PASS_GOLD_REVIEW_VERSION,
        summary: goldSummary,
        invalidPriorText: out.secondPassGoldReview.invalidPriorText,
        needsManualReviewCaseIds: reviewResults
          .filter((r) => r.goldReviewStatus === "needs_manual_review")
          .map((r) => r.caseId),
        caseReviews: reviewResults,
      },
      null,
      2,
    ),
    "utf8",
  );

  return { out, goldSummary, allReviewed, anyGoldIncomplete };
}

async function main() {
  const devLookup = buildDevelopmentCardNameLookup();
  const valLookup = buildFullEvalCardNameLookup();
  const valDiff = loadJson("data/oracle-action-eval-validation-v6-diff.json") as {
    caseRelabelEntries: Array<{ caseId: string; changes: GoldRelabelChange[] }>;
  };

  const seedHints = new Map<string, Parameters<typeof relabelCaseGold>[0]["seedHint"]>();
  for (let i = 0; i < HELD_OUT_SEEDS.length; i++) {
    const id = `held-${String(i + 1).padStart(4, "0")}`;
    const seed = HELD_OUT_SEEDS[i];
    seedHints.set(id, {
      primitives: seed.primitives,
      forbidden: seed.forbidden,
      structure: seed.structure,
      face: seed.face,
    });
  }

  const devDiff = loadJson("data/oracle-action-eval-development-v11-diff.json") as {
    caseRelabelEntries: Array<{ caseId: string; changes: GoldRelabelChange[] }>;
  };
  const devV12Diff = loadJson("data/oracle-action-eval-development-v12-diff.json") as {
    newlyResolvedRelabelEntries: Array<{ caseId: string; changes: GoldRelabelChange[] }>;
  };
  const devRelabelEntries = [
    ...devDiff.caseRelabelEntries,
    ...devV12Diff.newlyResolvedRelabelEntries,
  ];
  writeFileSync(
    resolve(process.cwd(), "data/oracle-action-eval-development-v12.json"),
    JSON.stringify({ ...loadJson("data/oracle-action-eval-development-v12.json"), caseRelabelEntries: devRelabelEntries }, null, 2),
    "utf8",
  );

  const devResult = await reviewDataset({
    envelopePath: "data/oracle-action-eval-development-v12.json",
    outPath: "data/oracle-action-eval-development-v12.json",
    diffPath: "data/oracle-action-eval-development-v12-gold-review.json",
    cardNameLookup: devLookup,
    setClassification: "development_set_v12",
    evaluationSetVersion: "development-v12-gold-review-v2",
  });

  const valEnvelope = loadJson("data/oracle-action-eval-validation-v6.json");
  valEnvelope.caseRelabelEntries = valDiff.caseRelabelEntries;

  const catalog = await loadGoldenCatalogIndex();

  const reviewedAt = new Date().toISOString();
  const valReviewResults = [];
  const valUpdated: CatalogEvalCase[] = [];
  const valInvalidPrior = [];
  const relabelByCase = new Map(valDiff.caseRelabelEntries.map((e) => [e.caseId, e.changes]));

  for (const testCase of valEnvelope.cases as CatalogEvalCase[]) {
    const heldIdx = testCase.id.match(/^held-(\d+)$/)?.[1];
    const seedHint = heldIdx
      ? {
          primitives: HELD_OUT_SEEDS[parseInt(heldIdx, 10) - 1]?.primitives,
          forbidden: HELD_OUT_SEEDS[parseInt(heldIdx, 10) - 1]?.forbidden,
          structure: HELD_OUT_SEEDS[parseInt(heldIdx, 10) - 1]?.structure,
          face: HELD_OUT_SEEDS[parseInt(heldIdx, 10) - 1]?.face,
        }
      : undefined;
    const repaired = repairCaseForGoldReview({
      testCase,
      catalog,
      reviewer: REVIEWER,
      reviewedAt,
      seedHint,
    });
    const priorIssues = [];
    if (repaired.invalidPriorTextDisposition === "gold_incomplete") {
      priorIssues.push({
        field: "invalidPriorText",
        message: "Category B: prior invalid and current gold incomplete",
        severity: "error" as const,
      });
    }
    const review = reviewCaseGoldSecondPass({
      testCase: repaired,
      catalog,
      cardName: valLookup.get(repaired.id),
      reviewer: REVIEWER,
      reviewedAt,
      priorIssues,
    });
    let updated = applyGoldReviewToCase(repaired, review);
    const changes = relabelByCase.get(repaired.id);
    if (changes) {
      const invalidClass = classifyInvalidPriorText({
        caseId: repaired.id,
        oracleText: repaired.oracleText,
        cardFace: repaired.cardFace,
        changes,
        currentGold: updated.expectedPrimitiveActions,
        expectedStructure: updated.expectedStructure,
        forbiddenPrimitiveActions: updated.forbiddenPrimitiveActions,
      });
      updated.invalidPriorTextDisposition = invalidClass.disposition;
      valInvalidPrior.push(invalidClass);
      if (invalidClass.disposition === "gold_incomplete") {
        updated.goldReviewStatus = "needs_manual_review";
      }
    }
    updated.evaluationSetVersion = "validation-v7-gold-review-v2";
    valReviewResults.push(review);
    valUpdated.push(updated);
  }

  const valGoldSummary = summarizeGoldReview(valReviewResults);
  const valAllReviewed = valGoldSummary.reviewed === valGoldSummary.total;
  const valAnyIncomplete = valUpdated.some((c) => c.invalidPriorTextDisposition === "gold_incomplete");
  const valHash = computeContentHash(valUpdated);

  const valOut = {
    ...valEnvelope,
    setClassification: "validation_set_v7",
    evaluationSetVersion: "validation-v7-gold-review-v2",
    contentHash: valHash,
    goldReviewVersion: SECOND_PASS_GOLD_REVIEW_VERSION,
    parentClassification: "validation_set_v6",
    secondPassGoldReview: {
      reviewer: REVIEWER,
      reviewedAt,
      goldReviewVersion: SECOND_PASS_GOLD_REVIEW_VERSION,
      summary: valGoldSummary,
      invalidPriorText: {
        supersededComplete: valInvalidPrior.filter((c) => c.disposition === "superseded_complete").length,
        goldIncomplete: valInvalidPrior.filter((c) => c.disposition === "gold_incomplete").length,
        classifications: valInvalidPrior,
      },
    },
    usableForParserEvaluation: valAllReviewed && !valAnyIncomplete,
    cases: valUpdated,
  };

  writeFileSync(
    resolve(process.cwd(), "data/oracle-action-eval-validation-v7.json"),
    JSON.stringify(valOut, null, 2),
    "utf8",
  );
  writeFileSync(
    resolve(process.cwd(), "data/oracle-action-eval-validation-v7-gold-review.json"),
    JSON.stringify(
      {
        generatedAt: reviewedAt,
        summary: valGoldSummary,
        invalidPriorText: valOut.secondPassGoldReview.invalidPriorText,
        needsManualReviewCaseIds: valReviewResults
          .filter((r) => r.goldReviewStatus === "needs_manual_review")
          .map((r) => r.caseId),
        caseReviews: valReviewResults,
      },
      null,
      2,
    ),
    "utf8",
  );

  // Blind v2 — identity + gold review only, no parser execution
  const blindPath = resolve(process.cwd(), "data/oracle-action-eval-final-blind-v2.json");
  const blind = loadJson("data/oracle-action-eval-final-blind-v2.json") as {
    cases: CatalogEvalCase[];
    contentHash: string;
  };
  const blindLookup = new Map(blind.cases.map((c, i) => [c.id, c.cardName ?? `blind-${i}`]));
  const blindReviews = [];
  const blindUpdated: CatalogEvalCase[] = [];
  for (const testCase of blind.cases) {
    const review = reviewCaseGoldSecondPass({
      testCase,
      catalog,
      cardName: blindLookup.get(testCase.id),
      reviewer: REVIEWER,
      reviewedAt,
    });
    blindUpdated.push({
      ...applyGoldReviewToCase(testCase, review),
      identityStatus: review.identityExact ? "catalog_exact" : "identity_mismatch",
    });
    blindReviews.push(review);
  }
  const blindSummary = summarizeGoldReview(blindReviews);
  const blindHash = computeContentHash(blindUpdated);
  const blindOut = {
    ...blind,
    contentHash: blindHash,
    goldReviewVersion: SECOND_PASS_GOLD_REVIEW_VERSION,
    identityStatus: "catalog_exact",
    goldReviewStatus: blindSummary.reviewed === blindSummary.total ? "reviewed" : "needs_manual_review",
    parserExecutionCount: 0,
    sealed: true,
    usableForParserEvaluation: false,
    secondPassGoldReview: { reviewer: REVIEWER, reviewedAt, summary: blindSummary },
    cases: blindUpdated,
  };
  writeFileSync(blindPath, JSON.stringify(blindOut, null, 2), "utf8");

  // Stamp v11/v6 as not usable
  for (const [path, field] of [
    ["data/oracle-action-eval-development-v11.json", "development_set_v11"],
    ["data/oracle-action-eval-validation-v6.json", "validation_set_v6"],
  ] as const) {
    const env = loadJson(path);
    env.usableForParserEvaluation = false;
    env.supersededBy =
      field === "development_set_v11" ? "development_set_v12" : "validation_set_v7";
    writeFileSync(resolve(process.cwd(), path), JSON.stringify(env, null, 2), "utf8");
  }

  const manifest = loadJson("data/oracle-action-eval-sets-manifest.json") as Record<string, unknown>;
  manifest.developmentSet = {
    path: "data/oracle-action-eval-development-v12.json",
    classification: "development_set_v12",
    contentHash: devResult.out.contentHash,
    caseCount: devResult.out.cases.length,
    goldReviewVersion: SECOND_PASS_GOLD_REVIEW_VERSION,
    benchmarkStatus: "catalog_clean",
    usableForParserEvaluation: devResult.out.usableForParserEvaluation,
  };
  manifest.validationSet = {
    path: "data/oracle-action-eval-validation-v7.json",
    classification: "validation_set_v7",
    contentHash: valHash,
    caseCount: valUpdated.length,
    goldReviewVersion: SECOND_PASS_GOLD_REVIEW_VERSION,
    benchmarkStatus: "catalog_clean",
    usableForParserEvaluation: valOut.usableForParserEvaluation,
  };
  manifest.finalBlindTestV2 = {
    path: "data/oracle-action-eval-final-blind-v2.json",
    contentHash: blindHash,
    sealed: true,
    parserExecutionCount: 0,
    goldReviewStatus: blindOut.goldReviewStatus,
    identityStatus: "catalog_exact",
  };
  writeFileSync(
    resolve(process.cwd(), "data/oracle-action-eval-sets-manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  console.log("Second-pass gold review complete");
  console.log(
    `  dev v12: ${devResult.goldSummary.reviewed}/${devResult.goldSummary.total} reviewed, usable=${devResult.out.usableForParserEvaluation}`,
  );
  console.log(
    `  val v7:  ${valGoldSummary.reviewed}/${valGoldSummary.total} reviewed, usable=${valOut.usableForParserEvaluation}`,
  );
  console.log(
    `  blind v2: ${blindSummary.reviewed}/${blindSummary.total} reviewed, sealed=true, parserExecutionCount=0`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
