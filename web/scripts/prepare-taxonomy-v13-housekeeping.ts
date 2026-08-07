/**
 * Taxonomy v1.3 migration housekeeping for validation/blind manifests.
 * Does NOT run parser on validation or expose blind set.
 * Run: npx tsx scripts/prepare-taxonomy-v13-housekeeping.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const MIGRATION_PATH = "data/oracle-action-taxonomy-v1.3-migration.json";
const VALIDATION_PATH = "data/oracle-action-eval-validation-v8.json";
const BLIND_MANIFEST_PATH = "data/oracle-action-eval-final-blind-v2-manifest.json";
const SETS_MANIFEST_PATH = "data/oracle-action-eval-sets-manifest.json";

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function main() {
  const migration = JSON.parse(readFileSync(resolve(process.cwd(), MIGRATION_PATH), "utf8"));
  const migrationHash = sha256(JSON.stringify(migration));

  const validation = JSON.parse(readFileSync(resolve(process.cwd(), VALIDATION_PATH), "utf8"));
  const validationNote = {
    goldTaxonomyVersion: "three-layer-v1.2",
    pendingMigrationTarget: "three-layer-v1.3",
    pendingMigrationHash: migrationHash,
    pendingMigrationPolicy: "shuffle_library for generic tutor shuffles (same as development v24)",
    parserExecutionBlocked: true,
    blockedReason: "Development must reach P>=98% R>=90% unsupported=0 before validation milestone",
    updatedAt: new Date().toISOString(),
  };

  const validationOut = {
    ...validation,
    taxonomyVersion: validation.taxonomyVersion ?? "three-layer-v1.2",
    taxonomyHousekeeping: validationNote,
  };
  writeFileSync(
    resolve(process.cwd(), VALIDATION_PATH),
    `${JSON.stringify(validationOut, null, 2)}\n`,
    "utf8",
  );

  const blindManifest = JSON.parse(readFileSync(resolve(process.cwd(), BLIND_MANIFEST_PATH), "utf8"));
  const blindOut = {
    ...blindManifest,
    goldTaxonomyVersion: blindManifest.taxonomyVersion ?? "three-layer-v1.2",
    pendingMigrationTarget: "three-layer-v1.3",
    pendingMigrationHash: migrationHash,
    pendingMigrationPolicy: "shuffle_library for generic tutor shuffles",
    parserExecutionCount: 0,
    parserAccessPolicy: "BLOCKED — sealed until RC gate; no parser tuning against blind",
    resealRequiredBeforeBlindRun: true,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(
    resolve(process.cwd(), BLIND_MANIFEST_PATH),
    `${JSON.stringify(blindOut, null, 2)}\n`,
    "utf8",
  );

  const setsManifest = JSON.parse(readFileSync(resolve(process.cwd(), SETS_MANIFEST_PATH), "utf8"));
  if (setsManifest.validationSet) {
    setsManifest.validationSet = {
      ...setsManifest.validationSet,
      goldTaxonomyVersion: "three-layer-v1.2",
      pendingMigrationTarget: "three-layer-v1.3",
      pendingMigrationHash: migrationHash,
    };
  }
  if (setsManifest.finalBlindTest) {
    setsManifest.finalBlindTest = {
      ...setsManifest.finalBlindTest,
      goldTaxonomyVersion: "three-layer-v1.2",
      pendingMigrationTarget: "three-layer-v1.3",
      pendingMigrationHash: migrationHash,
      parserExecutionCount: 0,
    };
  }
  setsManifest.developmentSetV25 = {
    path: "data/oracle-action-eval-development-v25.json",
    classification: "development_set_v25",
    taxonomyVersion: "three-layer-v1.3",
    parentClassification: "development_set_v24",
    purpose: "v1.19 precision-pass gold corrections on v24",
    usableForParserEvaluation: true,
  };
  writeFileSync(
    resolve(process.cwd(), SETS_MANIFEST_PATH),
    `${JSON.stringify(setsManifest, null, 2)}\n`,
    "utf8",
  );

  console.log("Taxonomy housekeeping complete.");
  console.log(`Migration hash: ${migrationHash}`);
  console.log("Validation: marked goldTaxonomyVersion=v1.2, pending v1.3 migration");
  console.log("Blind manifest: parserExecutionCount=0, reseal required before run");
}

main();
