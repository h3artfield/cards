/**
 * Taxonomy-only migration validation_set_v8 → validation_set_v9 (three-layer-v1.3).
 * Does NOT run parser. Run: npx tsx scripts/create-validation-set-v9.ts
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

const V8_HASH = "a1dc97477b2674ff0ca089e57233bf7d49f5226c49aa2cb6b9fd935e72d3852c";

async function main() {
  const v8Path = resolve(process.cwd(), "data/oracle-action-eval-validation-v8.json");
  const v8 = JSON.parse(readFileSync(v8Path, "utf8")) as EvalDatasetEnvelope & {
    cases: CatalogEvalCase[];
    contentHash: string;
  };

  if (v8.contentHash !== V8_HASH) {
    throw new Error(`Expected validation v8 hash ${V8_HASH}, got ${v8.contentHash}`);
  }

  const changedCaseIds: string[] = [];
  let shuffleLibraryAdded = 0;
  let shuffleIntoLibraryAdded = 0;
  let shuffleIntoLibraryRelabeled = 0;

  const cases = v8.cases.map((c) => {
    const result = applyTaxonomyV13ShuffleMigration(c);
    if (result.changed) changedCaseIds.push(c.id);
    if (result.shuffleLibraryAdded) shuffleLibraryAdded += 1;
    if (result.shuffleIntoLibraryAdded) shuffleIntoLibraryAdded += 1;
    if (result.shuffleIntoLibraryRelabeled) shuffleIntoLibraryRelabeled += 1;
    return result.case;
  });

  const migrationHash = migrationPolicyHash();
  const envelope: EvalDatasetEnvelope & { cases: CatalogEvalCase[] } = {
    ...v8,
    setClassification: "validation_set_v9",
    evaluationSetVersion: "validation-v9-taxonomy-v1.3-shuffle-policy",
    taxonomyVersion: TAXONOMY_V13,
    parentClassification: "validation_set_v8",
    parentContentHash: V8_HASH,
    parentSetPath: "data/oracle-action-eval-validation-v8.json",
    contentHash: "",
    cases,
    taxonomyMigration: {
      migrationId: MIGRATION_POLICY_ID,
      migrationHash,
      sourceTaxonomyVersion: "three-layer-v1.2",
      targetTaxonomyVersion: TAXONOMY_V13,
      parserExecutionCount: 0,
      changedCaseCount: changedCaseIds.length,
      changedCaseIds,
      shuffleLibraryLabelsAdded: shuffleLibraryAdded,
      shuffleIntoLibraryLabelsAdded: shuffleIntoLibraryAdded,
      shuffleIntoLibraryLabelsRelabeled: shuffleIntoLibraryRelabeled,
      migratedAt: new Date().toISOString(),
      policyNote: "Taxonomy-only migration from oracle text — no parser inspection.",
    },
  };
  envelope.contentHash = computeDatasetContentHash(envelope.cases);

  const outPath = resolve(process.cwd(), "data/oracle-action-eval-validation-v9.json");
  writeFileSync(outPath, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        outPath,
        validationV8Hash: V8_HASH,
        validationV9Hash: envelope.contentHash,
        casesChanged: changedCaseIds.length,
        shuffleLibraryLabelsAdded: shuffleLibraryAdded,
        shuffleIntoLibraryLabelsAdded: shuffleIntoLibraryAdded,
        shuffleIntoLibraryLabelsRelabeled: shuffleIntoLibraryRelabeled,
        migrationHash,
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
