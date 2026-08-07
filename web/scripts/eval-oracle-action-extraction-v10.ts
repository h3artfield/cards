/**
 * Oracle-action evaluation v10 — development_set_v6 full report with cast/play audit.
 * Run: npx tsx scripts/eval-oracle-action-extraction-v10.ts
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ORACLE_ACTION_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { TAXONOMY_VERSION } from "./oracle-action-eval-shared";
import { runNeedsReviewCalibration } from "./calibrate-needs-review-v6";

const V5_HASH = "319ef3f9fce2f2637da8582055d99ebbdf6e46f7e51763059493888e1742abbe";

const CAST_PLAY_AUDIT = [
  {
    caseId: "eval-0062",
    oracleText: "Until end of turn, you may play lands and cast spells from your graveyard.",
    evidenceSpans: [
      { span: "play lands", primitive: "play" },
      { span: "cast spells from your graveyard", primitive: "cast" },
    ],
    previousGoldPrimitive: "play (compound: play lands and cast spells from your graveyard) + cast",
    currentGoldBeforeV6: "play + cast (misaligned play evidence span)",
    correctPrimitive: "play + cast (split by verb)",
    justification: "Same compound permission taxonomy as eval-0063.",
  },
  {
    caseId: "eval-0063",
    oracleText:
      "Each nonland card in your graveyard has escape. The escape cost is equal to the card's mana cost plus exile three other cards from your graveyard.\nDuring each of your turns, you may play lands and cast spells from your graveyard.",
    evidenceSpans: [
      { span: "play lands", primitive: "play" },
      { span: "cast spells from your graveyard", primitive: "cast" },
    ],
    previousGoldPrimitive: "play (single label: play lands and cast spells from your graveyard)",
    currentGoldBeforeV6: "play",
    correctPrimitive: "play + cast (split by verb)",
    justification:
      "Oracle uses distinct verbs: play lands → play; cast spells from → cast. Zone permission does not collapse cast into play.",
  },
  {
    caseId: "dev-opt-040",
    oracleText: "Until end of turn, you may play lands and cast spells from your graveyard.",
    evidenceSpans: [
      { span: "play lands", primitive: "play" },
      { span: "cast spells from your graveyard", primitive: "cast" },
    ],
    previousGoldPrimitive: "play (single label: play lands and cast spells from your graveyard)",
    currentGoldBeforeV6: "play",
    correctPrimitive: "play + cast (split by verb)",
    justification:
      "Same compound permission; cast spells from is literally cast per taxonomy rule.",
  },
];

function main() {
  const devPath = resolve(process.cwd(), "data", "oracle-action-eval-development-v6.json");
  const dev = JSON.parse(readFileSync(devPath, "utf8")) as {
    cases: { id: string }[];
    contentHash: string;
    caseCount: number;
    reviewer: string;
    reviewTimestamp: string;
  };

  const calibration = runNeedsReviewCalibration(dev.cases as never);

  const castPlayExtractions = CAST_PLAY_AUDIT.map((row) => {
    const c = (dev.cases as { id: string; oracleId: string; oracleText: string }[]).find(
      (x) => x.id === row.caseId,
    )!;
    const extracted = extractOracleActionsV1({
      oracleId: c.oracleId,
      oracleText: c.oracleText,
    }).actions.filter((a) => a.actionType === "play" || a.actionType === "cast");
    return { ...row, extracted };
  });

  let v8Multiface: Record<string, unknown> = {};
  try {
    v8Multiface = JSON.parse(
      readFileSync(resolve(process.cwd(), "reports", "oracle-action-eval-development-v8-multiface.json"), "utf8"),
    );
  } catch {
    v8Multiface = {};
  }

  const report = {
    generatedAt: new Date().toISOString(),
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    taxonomyVersion: TAXONOMY_VERSION,
    developmentSet: "development_set_v6",
    developmentDatasetHash: dev.contentHash,
    parentDataset: "development_set_v5",
    parentContentHash: V5_HASH,
    caseCount: dev.caseCount,
    reviewer: dev.reviewer,
    reviewTimestamp: dev.reviewTimestamp,
    castPlayAudit: castPlayExtractions,
    fullSetAcceptedMetrics: calibration.acceptedAfterPromotion,
    needsReviewCalibration: {
      beforePromotion: calibration.needsReviewBeforePromotion,
      safelyPromoted: calibration.safelyPromoted,
      afterPromotion: calibration.needsReviewAfterPromotion,
      categoryCounts: calibration.needsReviewCategoryCounts,
      actions: calibration.needsReviewClassifications,
    },
    allEmissionMetrics: calibration.allEmission,
    emissionFalseNegativeClusters: calibration.emissionFnClusters,
    emissionFalseNegatives: calibration.emissionFalseNegatives,
    abstainedExpectedActionCount: calibration.abstainedExpectedActionCount,
    multifaceFaceSafety: (v8Multiface as { developmentGates?: unknown }).developmentGates,
    validationAccessed: false,
    finalBlindAccessed: false,
    validationGateStatus: {
      acceptedPrecisionTarget: 0.98,
      acceptedRecallTarget: 0.9,
      acceptedPrecisionCurrent: calibration.acceptedAfterPromotion.precision,
      acceptedRecallCurrent: calibration.acceptedAfterPromotion.recall,
      genuinelyUnsupportedAccepted: calibration.acceptedAfterPromotion.falsePositives === 0,
      readyForValidation:
        calibration.acceptedAfterPromotion.precision >= 0.98 &&
        calibration.acceptedAfterPromotion.recall >= 0.9 &&
        calibration.acceptedAfterPromotion.falsePositives === 0,
    },
  };

  const outPath = resolve(process.cwd(), "reports", "oracle-action-eval-development-v10-fullset.json");
  mkdirSync(resolve(process.cwd(), "reports"), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log("Eval v10 — development_set_v6");
  console.log(`  hash: ${dev.contentHash.slice(0, 12)}…`);
  console.log(
    `  accepted TP/FP/FN: ${report.fullSetAcceptedMetrics.truePositives}/${report.fullSetAcceptedMetrics.falsePositives}/${report.fullSetAcceptedMetrics.falseNegatives}`,
  );
  console.log(
    `  accepted P/R: ${(report.fullSetAcceptedMetrics.precision * 100).toFixed(1)}% / ${(report.fullSetAcceptedMetrics.recall * 100).toFixed(1)}%`,
  );
  console.log(
    `  all-emission P/R: ${(report.allEmissionMetrics.precision * 100).toFixed(1)}% / ${(report.allEmissionMetrics.recall * 100).toFixed(1)}%`,
  );
  console.log(`  ready for validation: ${report.validationGateStatus.readyForValidation}`);
  console.log(`  → ${outPath}`);
}

main();
