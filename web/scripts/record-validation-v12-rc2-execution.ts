/**
 * Record immutable validation v12 execution metadata separately from RC2 freeze manifest.
 * Run once after validation execution; does not modify RC2 manifest.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const RC2_MANIFEST_PATH = "data/milestones/rc2-development-planning/rc2-freeze-manifest.json";
const AGGREGATE_PATH = "data/milestones/validation-v12-fresh-certification/validation-v12-rc2-execution-1-aggregate.json";
const RAW_PATH = "data/milestones/validation-v12-fresh-certification/validation-v12-rc2-execution-1-raw.json";

function main() {
  const manifestBody = readFileSync(RC2_MANIFEST_PATH, "utf8");
  const manifestHash = createHash("sha256").update(manifestBody).digest("hex");
  const aggregate = JSON.parse(readFileSync(AGGREGATE_PATH, "utf8"));
  const rawBody = readFileSync(RAW_PATH, "utf8");
  const rawHash = createHash("sha256").update(rawBody).digest("hex");
  const aggregateBody = readFileSync(AGGREGATE_PATH, "utf8");
  const aggregateHash = createHash("sha256").update(aggregateBody).digest("hex");

  const record = {
    recordType: "ValidationExecution",
    candidateManifestHash: manifestHash,
    candidateLabel: "oracle-action-rc2",
    sourceParser: "oracle-action-v1.29-structural-pass-dev",
    parserCommit: "87916b12acb2fed8151981bdb893f4eefb144d09",
    parserBlobSha: "9f59114912a350dbd7b3cef5fcf975713f8075a9",
    dataset: "validation_set_v12_fresh",
    datasetHash: "e4ca33f217044a86ba50cba88455aa0320a14c63a8515b6d8c67c51cefb25523",
    datasetPath: "data/oracle-action-eval-validation-v12-fresh.json",
    executionNumber: 1,
    timestamp: aggregate.generatedAt,
    holdoutStatus: "spent_for_development",
    rawOutputHash: rawHash,
    rawOutputRef: "validation-v12-rc2-execution-1-raw.json",
    aggregateHash,
    aggregateRef: "validation-v12-rc2-execution-1-aggregate.json",
    result: {
      accepted: aggregate.accepted,
      needsReview: aggregate.needsReview,
      allEmission: aggregate.allEmission,
      unsupported: aggregate.unsupported,
      invariants: aggregate.invariants,
      releaseGatePass: aggregate.releaseGatePass,
    },
    rc2ManifestRef: RC2_MANIFEST_PATH,
    note: "Immutable execution record; RC2 freeze manifest remains pre-execution",
  };

  const outPath = resolve(
    process.cwd(),
    "data/milestones/validation-v12-fresh-certification/validation-v12-rc2-execution-record.json",
  );
  const body = `${JSON.stringify(record, null, 2)}\n`;
  writeFileSync(outPath, body, "utf8");
  const executionRecordHash = createHash("sha256").update(body).digest("hex");

  console.log(
    JSON.stringify(
      {
        rc2FreezeManifestHash: manifestHash,
        validationExecutionRecordHash: executionRecordHash,
        rawOutputHash: rawHash,
        aggregateHash,
      },
      null,
      2,
    ),
  );
}

main();
