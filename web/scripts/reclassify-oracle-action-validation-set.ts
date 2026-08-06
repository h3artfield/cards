/**
 * Reclassify former held-out set as validation_set_v1.
 * Run: npx tsx scripts/reclassify-oracle-action-validation-set.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { computeContentHash, TAXONOMY_VERSION } from "./oracle-action-eval-shared";

function main() {
  const heldPath = resolve(process.cwd(), "data", "oracle-action-eval-held-out.json");
  const validationPath = resolve(process.cwd(), "data", "oracle-action-eval-validation-v1.json");
  const manifestPath = resolve(process.cwd(), "data", "oracle-action-eval-sets-manifest.json");

  const held = JSON.parse(readFileSync(heldPath, "utf8")) as {
    caseCount: number;
    cases: unknown[];
    contentHash?: string;
  };

  const validation = {
    setClassification: "validation_set_v1",
    evaluationVersion: "validation-v1",
    contentHash: computeContentHash(held.cases as never[]),
    taxonomyVersion: TAXONOMY_VERSION,
    caseCount: held.caseCount,
    frozenAt: new Date().toISOString(),
    usagePolicy:
      "May be used occasionally to measure generalization. Do not tune individual parser rules directly against specific cases.",
    priorClassification: "held-out-test",
    reclassifiedAt: new Date().toISOString(),
    reclassifiedReason:
      "Parser results and failure modes from these 104 cases were inspected during v4 baseline; no longer an untouched final test set.",
    categoryCounts: (held as { categoryCounts?: Record<string, number> }).categoryCounts,
    cases: held.cases,
  };

  writeFileSync(validationPath, JSON.stringify(validation, null, 2), "utf8");

  const manifest = {
    developmentSet: {
      path: "data/oracle-action-eval-development-frozen.json",
      classification: "development",
      purpose: "Parser iteration and rule development",
    },
    validationSet: {
      path: "data/oracle-action-eval-validation-v1.json",
      classification: "validation_set_v1",
      contentHash: validation.contentHash,
      caseCount: validation.caseCount,
      purpose: "Occasional generalization measurement — no case-specific rule tuning",
    },
    finalBlindTest: {
      path: "data/oracle-action-eval-final-blind-v1.json",
      classification: "final_blind_test_v1",
      purpose: "Sealed until release candidate passes dev + validation gates",
    },
    gateSequence: [
      "improve parser on development set",
      "pass development gates",
      "evaluate on manually reviewed validation set",
      "freeze release candidate",
      "run once against sealed final blind set",
      "begin 500-card pilot",
    ],
  };

  mkdirSync(resolve(manifestPath, ".."), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  console.log(`Reclassified ${validation.caseCount} cases → validation_set_v1`);
  console.log(`  contentHash: ${validation.contentHash}`);
  console.log(`  → ${validationPath}`);
}

main();
