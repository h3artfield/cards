/**
 * Seed/backfill holdout execution registry from preserved execution records.
 * Run: cd web && npx tsx scripts/seed-holdout-execution-registry-v1.ts
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  readHoldoutExecutionRegistry,
  recordHoldoutExecution,
  writeHoldoutExecutionRegistry,
} from "./lib/holdout-execution-registry-v1";

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
}

const BACKFILLS = [
  {
    validationSet: "validation_set_v18",
    benchmarkPath: "data/oracle-action-eval-validation-v18.json",
    executionRecordPath: "data/milestones/validation-v18-certification/validation-v18-rc8-execution-record.json",
    candidateLabel: "rc8-candidate-v152",
    candidateManifestHash: "024510858ee3d1dadb4f8908f6aa06d4168e21502041c3f83201ba959af2101c",
    candidateGitCommitSha: "2b0bb6d1eed52bf3c1ca860d0e2d68c0fe1265fb",
    parserBlobClosure: "e5c2f7054cda29cb512a0d6be133661f85ce9eee444d6b60884ecc4739df32b3",
    policyStackCompositeHash: "bff641dc3be90e053e243c6c30da8f05e22450eeba10edf0d0cbdec87398062a",
    certificatePath: "data/milestones/validation-v18-certification/validation-v18-gold-policy-certificate-v2-rc8.json",
    aggregatePath: "data/milestones/validation-v18-certification/validation-v18-rc8-execution-1-aggregate.json",
    rawPath: "data/milestones/validation-v18-certification/validation-v18-rc8-execution-1-raw.json",
  },
];

function main() {
  const registry = readHoldoutExecutionRegistry();
  for (const row of BACKFILLS) {
    const envelope = JSON.parse(readFileSync(resolve(row.benchmarkPath), "utf8")) as { contentHash: string };
    if (registry.entries[envelope.contentHash]?.executionCount) {
      console.log(`skip ${row.validationSet} — already registered`);
      continue;
    }
    const record = JSON.parse(readFileSync(resolve(row.executionRecordPath), "utf8")) as {
      timestamp: string;
    };
    recordHoldoutExecution({
      benchmarkHash: envelope.contentHash,
      benchmarkPath: row.benchmarkPath,
      validationSet: row.validationSet,
      candidateLabel: row.candidateLabel,
      candidateManifestHash: row.candidateManifestHash,
      candidateGitCommitSha: row.candidateGitCommitSha,
      parserBlobClosure: row.parserBlobClosure,
      policyStackCompositeHash: row.policyStackCompositeHash,
      certificateHash: sha256File(row.certificatePath),
      executionRecordHash: sha256File(row.executionRecordPath),
      executionRecordPath: row.executionRecordPath,
      aggregateHash: sha256File(row.aggregatePath),
      rawOutputHash: sha256File(row.rawPath),
      timestamp: record.timestamp,
      note: "Backfilled from preserved official execution record.",
    });
    console.log(`registered ${row.validationSet} @ ${envelope.contentHash.slice(0, 16)}`);
  }
  console.log(JSON.stringify(readHoldoutExecutionRegistry(), null, 2));
}

main();
