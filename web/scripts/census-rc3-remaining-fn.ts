/**
 * Global remaining-FN census for RC3 development gate — classify accepted-tier FNs by family.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { parseOracleSemanticsRC3, ORACLE_ACTION_RC3_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { evaluateCaseSemantic, sumSemanticMetrics, matchGoldToSemanticActions } from "./oracle-action-semantic-matcher";
import { applyGoldMigrationV135 } from "./lib/rc3-gold-migration-v135";
import { loadEnvLocal } from "./lib/script-env";

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

function loadScoringCases(path: string): OracleActionEvalCaseV2[] {
  return applyGoldMigrationV135((JSON.parse(readFileSync(path, "utf8")) as Envelope).cases);
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

function main() {
  const legacyV14Paths = [
    "data/oracle-action-eval-development-v26-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v2-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v3-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v5-v14.json",
  ];
  const positiveCatalog = loadScoringCases("data/oracle-action-eval-rc3-positive-training-catalog-v133.json");
  const combinedCases = [...legacyV14Paths.flatMap(loadScoringCases), ...positiveCatalog];
  const unrelatedCatalog = positiveCatalog.filter((c) => !(c as { spentV12Regression?: boolean }).spentV12Regression);

  const fnItems: Array<Record<string, unknown>> = [];
  const familyCounts = new Map<FnFamily, number>();

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
      familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1);
      fnItems.push({
        caseId: testCase.id,
        cardName: (testCase as { cardName?: string }).cardName,
        actionType: gold.actionType,
        evidenceContains: gold.evidenceContains,
        family,
        coverageStratum: (testCase as { coverageStratum?: string }).coverageStratum,
      });
    }
  }

  const combinedMetricsRaw = sumSemanticMetrics(
    combinedCases.map((c) =>
      evaluateCaseSemantic(
        c,
        parseOracleSemanticsRC3({ oracleId: c.oracleId, oracleText: c.oracleText, cardFace: c.cardFace }),
      ),
    ),
  );
  const combinedMetrics = {
    ...combinedMetricsRaw,
    precision: combinedMetricsRaw.tp + combinedMetricsRaw.fp > 0 ? combinedMetricsRaw.tp / (combinedMetricsRaw.tp + combinedMetricsRaw.fp) : 1,
    recall: combinedMetricsRaw.tp + combinedMetricsRaw.fn > 0 ? combinedMetricsRaw.tp / (combinedMetricsRaw.tp + combinedMetricsRaw.fn) : 1,
  };
  const unrelatedMetricsRaw = sumSemanticMetrics(
    unrelatedCatalog.map((c) =>
      evaluateCaseSemantic(
        c,
        parseOracleSemanticsRC3({ oracleId: c.oracleId, oracleText: c.oracleText, cardFace: c.cardFace }),
      ),
    ),
  );
  const unrelatedMetrics = {
    ...unrelatedMetricsRaw,
    precision: unrelatedMetricsRaw.tp + unrelatedMetricsRaw.fp > 0 ? unrelatedMetricsRaw.tp / (unrelatedMetricsRaw.tp + unrelatedMetricsRaw.fp) : 1,
    recall: unrelatedMetricsRaw.tp + unrelatedMetricsRaw.fn > 0 ? unrelatedMetricsRaw.tp / (unrelatedMetricsRaw.tp + unrelatedMetricsRaw.fn) : 1,
  };

  const sortedFamilies = [...familyCounts.entries()].sort((a, b) => b[1] - a[1]);
  const gitRoot = execSync("git rev-parse --show-toplevel", { cwd: resolve("."), encoding: "utf8" }).trim();
  const commit = execSync("git rev-parse HEAD", { cwd: gitRoot, encoding: "utf8" }).trim();

  const report = {
    generatedAt: new Date().toISOString(),
    checkpoint: "rc3-remaining-fn-census-post-v138",
    parserVersion: ORACLE_ACTION_RC3_PARSER_VERSION,
    parserCommitSha: commit,
    combinedDevelopment: {
      ...combinedMetrics,
      goldDenominator: combinedMetrics.tp + combinedMetrics.fn,
      precisionPct: combinedMetrics.precision * 100,
      recallPct: combinedMetrics.recall * 100,
      gateCombined: {
        precisionRequired: 0.98,
        recallRequired: 0.92,
        precisionPass: combinedMetrics.precision >= 0.98,
        recallPass: combinedMetrics.recall >= 0.92,
        recallGapTpNeeded: Math.max(0, Math.ceil(0.92 * (combinedMetrics.tp + combinedMetrics.fn)) - combinedMetrics.tp),
      },
    },
    unrelatedCatalogPositive: {
      caseCount: unrelatedCatalog.length,
      ...unrelatedMetrics,
      goldDenominator: unrelatedMetrics.tp + unrelatedMetrics.fn,
      precisionPct: unrelatedMetrics.precision * 100,
      recallPct: unrelatedMetrics.recall * 100,
      gate: {
        precisionRequired: 0.95,
        recallRequired: 0.9,
        precisionPass: unrelatedMetrics.precision >= 0.95,
        recallPass: unrelatedMetrics.recall >= 0.9,
      },
    },
    remainingFnByFamily: Object.fromEntries(sortedFamilies),
    totalRemainingFn: fnItems.length,
    fnItems,
    highestYieldFamilies: sortedFamilies.slice(0, 5).map(([family, count]) => ({ family, count })),
  };

  mkdirSync(resolve("data/milestones/rc3-development"), { recursive: true });
  writeFileSync(
    resolve("data/milestones/rc3-development/rc3-remaining-fn-census.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report, null, 2));
}

main();
