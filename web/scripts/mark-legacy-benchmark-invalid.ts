/**
 * Mark legacy benchmark datasets as invalid_identity — preserve for audit history only.
 * Run: npx tsx scripts/mark-legacy-benchmark-invalid.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const LEGACY_PATHS = [
  "data/oracle-action-eval-development-v1.json",
  "data/oracle-action-eval-development-v2.json",
  "data/oracle-action-eval-development-v3.json",
  "data/oracle-action-eval-development-v4.json",
  "data/oracle-action-eval-development-v5.json",
  "data/oracle-action-eval-development-v6.json",
  "data/oracle-action-eval-development-v7.json",
  "data/oracle-action-eval-development-v8.json",
  "data/oracle-action-eval-development-v9.json",
  "data/oracle-action-eval-development-v10.json",
  "data/oracle-action-eval-validation-v1.json",
  "data/oracle-action-eval-validation-v2.json",
  "data/oracle-action-eval-validation-v3.json",
  "data/oracle-action-eval-validation-v4.json",
  "data/oracle-action-eval-validation-v5.json",
  "data/oracle-action-eval-final-blind-v1.json",
  "data/oracle-action-eval-cases.json",
  "data/oracle-action-eval-cases-v2.json",
  "data/oracle-action-eval-development-frozen.json",
];

const STAMP = {
  benchmarkStatus: "invalid_identity" as const,
  usableForParserEvaluation: false,
  invalidIdentityReason:
    "Synthetic oracleIds and/or hand-authored oracle text not joined to catalogOracleCards. Preserved for audit history only.",
  invalidIdentityMarkedAt: new Date().toISOString(),
};

function main() {
  for (const rel of LEGACY_PATHS) {
    const path = resolve(process.cwd(), rel);
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    } catch {
      console.warn(`skip missing: ${rel}`);
      continue;
    }
    Object.assign(payload, STAMP);
    writeFileSync(path, JSON.stringify(payload, null, 2), "utf8");
    console.log(`stamped ${rel}`);
  }

  const manifestPath = resolve(process.cwd(), "data", "oracle-action-eval-sets-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;

  for (const key of Object.keys(manifest)) {
    const entry = manifest[key];
    if (entry && typeof entry === "object") {
      Object.assign(entry as Record<string, unknown>, STAMP);
    }
  }

  manifest.benchmarkReconstruction = {
    activeDevelopmentSet: "development_set_v11",
    activeValidationSet: "validation_set_v6",
    activeBlindSet: "final_blind_test_v2",
    legacyPolicy: "invalid_identity datasets must not be used for parser quality claims",
    markedAt: STAMP.invalidIdentityMarkedAt,
  };

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  console.log("Updated oracle-action-eval-sets-manifest.json");
}

main();
