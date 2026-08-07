/**
 * Sealed blind benchmark taxonomy v1.3 migration — no parser execution.
 * Run: npx tsx scripts/migrate-blind-benchmark-taxonomy-v13.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  computeDatasetContentHash,
  type EvalDatasetEnvelope,
  type CatalogEvalCase,
} from "./lib/eval-provenance-guard";
import {
  applyTaxonomyV13ShuffleMigration,
  migrationPolicyHash,
  MIGRATION_POLICY_ID,
  TAXONOMY_V13,
} from "./lib/taxonomy-v13-shuffle-migration";

const BLIND_V2_HASH = "86bbcb07701f1084962c039597f072341c9e89a18561354b16a62e2f663e6962";

async function main() {
  const blindPath = resolve(process.cwd(), "data/oracle-action-eval-final-blind-v2.json");
  const blind = JSON.parse(readFileSync(blindPath, "utf8")) as EvalDatasetEnvelope & {
    cases: CatalogEvalCase[];
    contentHash: string;
  };

  if (blind.contentHash !== BLIND_V2_HASH) {
    throw new Error(`Expected blind v2 hash ${BLIND_V2_HASH}, got ${blind.contentHash}`);
  }

  const changedCaseIds: string[] = [];
  let shuffleLibraryAdded = 0;
  let shuffleIntoLibraryAdded = 0;

  const cases = blind.cases.map((c) => {
    const result = applyTaxonomyV13ShuffleMigration(c);
    if (result.changed) changedCaseIds.push(c.id);
    if (result.shuffleLibraryAdded) shuffleLibraryAdded += 1;
    if (result.shuffleIntoLibraryAdded) shuffleIntoLibraryAdded += 1;
    return result.case;
  });

  const migrationHash = migrationPolicyHash();
  const contentHash = computeDatasetContentHash(cases);

  const envelope: EvalDatasetEnvelope & { cases: CatalogEvalCase[] } = {
    ...blind,
    taxonomyVersion: TAXONOMY_V13,
    contentHash,
    cases,
    taxonomyMigration: {
      migrationId: MIGRATION_POLICY_ID,
      migrationHash,
      sourceTaxonomyVersion: "three-layer-v1.2",
      targetTaxonomyVersion: TAXONOMY_V13,
      parentContentHash: BLIND_V2_HASH,
      parserExecutionCount: 0,
      changedCaseCount: changedCaseIds.length,
      shuffleLibraryLabelsAdded: shuffleLibraryAdded,
      shuffleIntoLibraryLabelsAdded: shuffleIntoLibraryAdded,
      migratedAt: new Date().toISOString(),
      sealedBenchmarkMaintenance: true,
    },
  };

  writeFileSync(blindPath, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");

  const manifestPath = resolve(process.cwd(), "data/oracle-action-eval-final-blind-v2-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        ...manifest,
        contentHash,
        taxonomyVersion: TAXONOMY_V13,
        goldTaxonomyVersion: TAXONOMY_V13,
        migrationId: MIGRATION_POLICY_ID,
        migrationHash,
        parentContentHash: BLIND_V2_HASH,
        parserExecutionCount: 0,
        sealed: true,
        parserAccessPolicy: "BLOCKED — sealed until final candidate; RC1 did not execute blind",
        resealedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        blindPath,
        parentHash: BLIND_V2_HASH,
        newHash: contentHash,
        casesChanged: changedCaseIds.length,
        shuffleLibraryLabelsAdded: shuffleLibraryAdded,
        shuffleIntoLibraryLabelsAdded: shuffleIntoLibraryAdded,
        migrationHash,
        parserExecutionCount: 0,
        sealed: true,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
