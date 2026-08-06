/**
 * Create development_set_v3 from frozen development_set_v2.
 * Preserves v2 identity; v3 adds up-to expansion, legacy relabel adjudication,
 * and additional optionality category gold.
 * Run: npx tsx scripts/create-development-set-v3.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { applyLegacyOptionalAdjudications } from "./adjudicate-legacy-optional-labels";
import { computeContentHash, TAXONOMY_VERSION } from "./oracle-action-eval-shared";
import { OPTIONALITY_CONDITION_EVAL_CASES } from "./oracle-action-eval-optionality-condition-cases";

/** Cases beyond v2's 24 optionality/condition cases — up-to expansion + category gold. */
const V3_ADDITIONAL_CASES: OracleActionEvalCaseV2[] = OPTIONALITY_CONDITION_EVAL_CASES.filter((c) =>
  c.id.startsWith("dev-opt-0") && Number.parseInt(c.id.replace("dev-opt-", ""), 10) >= 13,
);

function main() {
  const v2Path = resolve(process.cwd(), "data", "oracle-action-eval-development-v2.json");
  const v3Path = resolve(process.cwd(), "data", "oracle-action-eval-development-v3.json");
  const manifestPath = resolve(process.cwd(), "data", "oracle-action-eval-sets-manifest.json");
  const adjudicationPath = resolve(process.cwd(), "reports", "oracle-action-legacy-optional-label-adjudication.json");

  const v2 = JSON.parse(readFileSync(v2Path, "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
    caseCount: number;
    setClassification: string;
  };

  const { cases: adjudicatedCases, adjudications } = applyLegacyOptionalAdjudications(v2.cases);
  const v3Cases = [...adjudicatedCases, ...V3_ADDITIONAL_CASES];
  const v3Hash = computeContentHash(v3Cases);
  const createdAt = new Date().toISOString();

  const upToGoldCount = v3Cases.filter((c) =>
    c.expectedPrimitiveActions.some((e) => e.targetMaximum !== undefined || /\bup to\b/i.test(e.evidenceContains)),
  ).length;

  const v3 = {
    setClassification: "development_set_v3",
    evaluationVersion: "development-v3",
    contentHash: v3Hash,
    taxonomyVersion: TAXONOMY_VERSION,
    caseCount: v3Cases.length,
    frozenAt: createdAt,
    usagePolicy: "Parser tuning set — may scope / optionality attachment (v1.5+).",
    parentClassification: "development_set_v2",
    parentContentHash: v2.contentHash,
    parentSetPath: "data/oracle-action-eval-development-v2.json",
    parentCaseCount: v2.caseCount,
    creationReason:
      "Expanded up-to gold (21 cases), formal legacy optional-label adjudication, and optionality category coverage for v1.5 development.",
    legacyOptionalAdjudications: adjudications.length,
    upToGoldCaseCount: upToGoldCount,
    additionalCasesFromV2: V3_ADDITIONAL_CASES.length,
    cases: v3Cases,
  };

  writeFileSync(v3Path, JSON.stringify(v3, null, 2), "utf8");
  writeFileSync(
    adjudicationPath,
    JSON.stringify(
      {
        generatedAt: createdAt,
        developmentSet: "development_set_v3",
        parentSet: "development_set_v2",
        parentContentHash: v2.contentHash,
        totalAdjudications: adjudications.length,
        byDecision: Object.fromEntries(
          [...new Set(adjudications.map((a) => a.decision))].map((d) => [
            d,
            adjudications.filter((a) => a.decision === d).length,
          ]),
        ),
        adjudications,
      },
      null,
      2,
    ),
    "utf8",
  );

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  manifest.developmentSetV2 = {
    path: "data/oracle-action-eval-development-v2.json",
    classification: "development_set_v2",
    contentHash: "51ae89777f0f67e6196671a90a7d3f3f79ea2d10a9847b692772399acbcc83ca",
    caseCount: 228,
    purpose: "Frozen at parser v1.4 — immutable, do not modify",
    frozenAt: "2026-08-06T14:48:01.736Z",
  };
  manifest.developmentSet = {
    path: "data/oracle-action-eval-development-v3.json",
    classification: "development_set_v3",
    contentHash: v3Hash,
    caseCount: v3Cases.length,
    purpose: "Parser tuning — may scope / optionality attachment (v1.5+)",
    upToGoldCaseCount: upToGoldCount,
    parentVersion: {
      classification: "development_set_v2",
      contentHash: v2.contentHash,
      caseCount: v2.caseCount,
      path: "data/oracle-action-eval-development-v2.json",
    },
    priorVersions: [
      {
        path: "data/oracle-action-eval-development-v2.json",
        classification: "development_set_v2",
        contentHash: v2.contentHash,
        caseCount: v2.caseCount,
        supersededAt: createdAt,
        reason: "Expanded to v3 with up-to gold and legacy optional relabel",
      },
    ],
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  console.log(`Created development_set_v3`);
  console.log(`  parent v2: ${v2.caseCount} cases, hash ${v2.contentHash.slice(0, 12)}…`);
  console.log(`  v3 cases: ${v3Cases.length}, hash ${v3Hash.slice(0, 12)}…`);
  console.log(`  legacy adjudications: ${adjudications.length}`);
  console.log(`  up-to gold cases: ${upToGoldCount}`);
  console.log(`  → ${v3Path}`);
}

main();
