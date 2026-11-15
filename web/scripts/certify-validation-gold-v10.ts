/**
 * Independent 104/104 validation gold certification → validation_set_v10.
 * Does NOT consult RC1 output. Run: npx tsx scripts/certify-validation-gold-v10.ts
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import {
  computeDatasetContentHash,
  type CatalogEvalCase,
  type EvalDatasetEnvelope,
} from "./lib/eval-provenance-guard";
import { TAXONOMY_V13 } from "./lib/taxonomy-v13-shuffle-migration";
import {
  VALIDATION_GOLD_CERTIFIER_ID,
  certifyValidationCaseGold,
  type ValidationCertificationRecord,
} from "./lib/validation-gold-certifier";

loadEnvLocal();

const V9_HASH = "81676cb6270ea004d80aac23d2e945ce19fdf98bfbb3b46a4c96c397c0624433";

async function main() {
  const v9Path = resolve(process.cwd(), "data/oracle-action-eval-validation-v9.json");
  const v9 = JSON.parse(readFileSync(v9Path, "utf8")) as EvalDatasetEnvelope & {
    cases: CatalogEvalCase[];
    contentHash: string;
  };

  if (v9.contentHash !== V9_HASH) {
    throw new Error(`Expected validation v9 hash ${V9_HASH}, got ${v9.contentHash}`);
  }
  if (v9.cases.length !== 104) {
    throw new Error(`Expected 104 validation cases, got ${v9.cases.length}`);
  }

  const reviewedAt = new Date().toISOString();
  const certificationRecords: ValidationCertificationRecord[] = [];
  const changedCaseIds: string[] = [];
  let primitivesAdded = 0;
  let primitivesRemoved = 0;
  let evidenceCorrections = 0;
  let faceCorrections = 0;
  let incompleteCases = 0;

  const cases: CatalogEvalCase[] = v9.cases.map((c) => {
    const { testCase, record } = certifyValidationCaseGold({ v9Case: c, reviewedAt });
    certificationRecords.push(record);
    if (record.changed) changedCaseIds.push(c.id);
    primitivesAdded += record.primitivesAdded.length;
    primitivesRemoved += record.primitivesRemoved.length;
    evidenceCorrections += record.evidenceCorrections.length;
    faceCorrections += record.faceCorrections.length;
    if (record.goldCompletenessStatus !== "complete") incompleteCases += 1;
    return testCase;
  });

  const envelope: EvalDatasetEnvelope & { cases: CatalogEvalCase[] } = {
    ...v9,
    setClassification: "validation_set_v10",
    evaluationSetVersion: "validation-v10-oracle-gold-certification",
    taxonomyVersion: TAXONOMY_V13,
    parentClassification: "validation_set_v9",
    parentContentHash: V9_HASH,
    parentSetPath: "data/oracle-action-eval-validation-v9.json",
    contentHash: "",
    cases,
    goldCertification: {
      certifierId: VALIDATION_GOLD_CERTIFIER_ID,
      certifiedAt: reviewedAt,
      parentV9Hash: V9_HASH,
      casesReviewed: "104/104",
      casesChanged: changedCaseIds.length,
      changedCaseIds,
      primitivesAdded,
      primitivesRemoved,
      evidenceCorrections,
      faceCorrections,
      evaluatorCorrections: 0,
      taxonomy: TAXONOMY_V13,
      goldReviewStatus: "reviewed",
      goldCompletenessStatus: incompleteCases === 0 ? "complete" : "incomplete",
      incompleteCaseCount: incompleteCases,
      parserExecutionCount: 0,
      rc1OutputConsulted: false,
      policyNote:
        "Gold certified from catalog oracleId, canonical oracle text, faces/components, taxonomy three-layer-v1.3, and oracle-only policy adjudications. RC1 predictions were not consulted.",
    },
  };
  envelope.contentHash = computeDatasetContentHash(envelope.cases);

  const outPath = resolve(process.cwd(), "data/oracle-action-eval-validation-v10.json");
  writeFileSync(outPath, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");

  const manifestPath = resolve(process.cwd(), "data/milestones/validation-v10-certification/manifest.json");
  mkdirSync(resolve(manifestPath, ".."), { recursive: true });
  writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        validationSet: "validation_set_v10",
        validationV10Hash: envelope.contentHash,
        parentV9Hash: V9_HASH,
        casesReviewed: "104/104",
        casesChanged: changedCaseIds.length,
        changedCaseIds,
        primitivesAdded,
        primitivesRemoved,
        evidenceCorrections,
        faceCorrections,
        goldReviewStatus: "reviewed",
        goldCompletenessStatus: envelope.goldCertification?.goldCompletenessStatus,
        incompleteCaseCount: incompleteCases,
        taxonomy: TAXONOMY_V13,
        certifiedAt: reviewedAt,
        certificationRecords,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        outPath,
        validationV9Hash: V9_HASH,
        validationV10Hash: envelope.contentHash,
        casesChanged: changedCaseIds.length,
        primitivesAdded,
        primitivesRemoved,
        evidenceCorrections,
        goldCompletenessStatus: envelope.goldCertification?.goldCompletenessStatus,
        incompleteCaseCount: incompleteCases,
      },
      null,
      2,
    ),
  );

  if (incompleteCases > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
