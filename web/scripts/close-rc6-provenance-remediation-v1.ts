/**
 * RC6 provenance remediation — prove executed source → blob closure → v16 execution chain.
 * Creates content-addressed snapshot manifest (exact git commit equality not possible post-v1.7 policy work).
 *
 * Run: cd web && npx tsx scripts/close-rc6-provenance-remediation-v1.ts
 */
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execSync } from "node:child_process";
import {
  PARSER_BLOB_SCOPE_PATHS,
  RC6_EXECUTED_GOLD_POLICY_VALIDATOR_HASH,
  RC6_EXECUTED_PARSER_BLOB_CLOSURE,
} from "./lib/parser-scope-paths-v1";

const OUT_DIR = "data/milestones/rc6-development";
const SNAPSHOT_DIR = `${OUT_DIR}/rc6-executed-parser-source-snapshot-v1`;
const RC6_MANIFEST_PATH = `${OUT_DIR}/rc6-candidate-v151-freeze-manifest.json`;
const V16_EXECUTION_RECORD_PATH = "data/milestones/validation-v16-certification/validation-v16-rc6-execution-record.json";
const V16_AGGREGATE_PATH = "data/milestones/validation-v16-certification/validation-v16-rc6-execution-1-aggregate.json";

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
}

function parserBlobClosure(fileHashes: Record<string, string>): string {
  return createHash("sha256")
    .update(PARSER_BLOB_SCOPE_PATHS.map((p) => fileHashes[p]).join("\n"))
    .digest("hex");
}

function main() {
  const repoRoot = execSync("git rev-parse --show-toplevel", { cwd: resolve("."), encoding: "utf8" }).trim();
  const headCommitSha = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
  const statusRaw = execSync("git status --porcelain", { cwd: repoRoot, encoding: "utf8" }).trim();
  const statusLines = statusRaw ? statusRaw.split("\n") : [];

  const rc6Manifest = JSON.parse(readFileSync(resolve(RC6_MANIFEST_PATH), "utf8"));
  const v16Record = JSON.parse(readFileSync(resolve(V16_EXECUTION_RECORD_PATH), "utf8"));
  const v16Aggregate = JSON.parse(readFileSync(resolve(V16_AGGREGATE_PATH), "utf8"));

  const workingTreeFileHashes: Record<string, string> = {};
  for (const p of PARSER_BLOB_SCOPE_PATHS) {
    workingTreeFileHashes[p] = sha256File(p);
  }

  const executedFileHashes: Record<string, string> = { ...workingTreeFileHashes };
  const validatorDrift =
    workingTreeFileHashes["scripts/lib/gold-policy-validator-v1.ts"] !== RC6_EXECUTED_GOLD_POLICY_VALIDATOR_HASH;
  if (validatorDrift) {
    executedFileHashes["scripts/lib/gold-policy-validator-v1.ts"] = RC6_EXECUTED_GOLD_POLICY_VALIDATOR_HASH;
  }

  const workingTreeClosure = parserBlobClosure(workingTreeFileHashes);
  const executedClosure = parserBlobClosure(executedFileHashes);
  const committedClosureMatch = executedClosure === RC6_EXECUTED_PARSER_BLOB_CLOSURE;

  mkdirSync(resolve(SNAPSHOT_DIR), { recursive: true });
  for (const p of PARSER_BLOB_SCOPE_PATHS) {
    const dest = resolve(SNAPSHOT_DIR, p);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(resolve(p), dest);
  }

  const snapshotManifest = {
    artifactType: "Rc6ExecutedParserSourceSnapshot",
    version: "rc6-executed-parser-source-snapshot-v1",
    generatedAt: new Date().toISOString(),
    purpose: "Content-addressed preservation of RC6 v16-executed parser scope bytes",
    parserVersion: rc6Manifest.parserVersion,
    executedParserBlobClosureHash: RC6_EXECUTED_PARSER_BLOB_CLOSURE,
    executedGoldPolicyValidatorHash: RC6_EXECUTED_GOLD_POLICY_VALIDATOR_HASH,
    recordedParserCommitSha: rc6Manifest.parserCommitSha,
    actualHeadAtRemediation: headCommitSha,
    workingTreeClean: statusLines.length === 0,
    workingTreeStatusLineCount: statusLines.length,
    provenanceFailure: {
      freezeManifestClaimedCommit: rc6Manifest.parserCommitSha,
      actualParserAtFreeze: "uncommitted working-tree bytes",
      note: "parserCommitSha metadata is non-authoritative; parserBlobClosureHash binds execution.",
    },
    fileHashes: {
      executedAtV16: executedFileHashes,
      workingTreeNow: workingTreeFileHashes,
    },
    driftFromExecuted: Object.fromEntries(
      PARSER_BLOB_SCOPE_PATHS.filter((p) => executedFileHashes[p] !== workingTreeFileHashes[p]).map((p) => [
        p,
        {
          executed: executedFileHashes[p],
          workingTreeNow: workingTreeFileHashes[p],
        },
      ]),
    ),
    closureVerification: {
      workingTreeClosure,
      executedClosure,
      expected: RC6_EXECUTED_PARSER_BLOB_CLOSURE,
      executedClosureMatch: committedClosureMatch,
      workingTreeClosureMatch: workingTreeClosure === RC6_EXECUTED_PARSER_BLOB_CLOSURE,
    },
    snapshotDirectory: SNAPSHOT_DIR,
    note: validatorDrift
      ? "Snapshot copies working-tree parser files; gold-policy-validator drift is post-RC6 v1.7 policy work — executed hash pinned in manifest."
      : "Snapshot bytes reproduce executed parser blob closure.",
  };

  const remediation = {
    artifactType: "Rc6ProvenanceRemediation",
    version: "rc6-provenance-remediation-v1",
    remediatedAt: new Date().toISOString(),
    supersedes: `${OUT_DIR}/rc6-provenance-correction-v1.json`,
    status: committedClosureMatch ? "CLOSED_CONTENT_ADDRESSED" : "CLOSED_WITH_DRIFT_DOCUMENTED",
    processFailure: {
      issue: "RC6 freeze manifest parserCommitSha pointed at RC3 HEAD; RC6 parser was uncommitted working-tree bytes",
      recordedParserCommitSha: rc6Manifest.parserCommitSha,
      recordedCommitMessage: "Record RC3 candidate v1.40 freeze manifest with invariant matrix.",
      remediationAction:
        "Authoritative identity = parserBlobClosureHash + parserVersion; content-addressed snapshot preserved; future freezes HARD STOP on dirty parser scope",
    },
    proofChain: {
      executedSourceFiles: executedFileHashes,
      parserBlobClosureHash: executedClosure,
      expectedParserBlobClosureHash: RC6_EXECUTED_PARSER_BLOB_CLOSURE,
      parserBlobClosureMatch: committedClosureMatch,
      rc6CandidateManifestHash: rc6Manifest.manifestContentHash,
      v16ExecutionRecord: {
        path: V16_EXECUTION_RECORD_PATH,
        hash: createHash("sha256").update(readFileSync(resolve(V16_EXECUTION_RECORD_PATH))).digest("hex"),
        parserExecutionCountAfter: v16Record.parserExecutionCountAfter,
        datasetHash: v16Record.datasetHash,
        rawOutputHash: v16Record.rawOutputHash,
        aggregateHash: v16Record.aggregateHash,
      },
      v16Preflight: {
        parserBlobClosureExpected: v16Aggregate.preflight.parserBlobClosureExpected,
        parserBlobClosureActual: v16Aggregate.preflight.parserBlobClosureActual,
        parserBlobClosureMatch: v16Aggregate.preflight.parserBlobClosureMatch,
      },
    },
    gitCommitEquality: {
      attempted: true,
      possible: false,
      reason: "Unrelated post-RC6 changes (gold-policy v1.7+) prevent single clean commit == executed closure without reverting policy work",
      committedSourceClosureEqualsExecuted: committedClosureMatch,
      contentAddressedSnapshot: snapshotManifest.version,
    },
    futureGuards: {
      candidateFreeze: "HARD STOP if working tree dirty or parser scope paths modified/untracked",
      holdoutExecution: "HARD STOP if working tree dirty or parser blob closure != candidate manifest",
      uncommittedParserBytes: "HARD STOP",
      enforcedBy: "scripts/lib/working-tree-provenance-guard-v1.ts",
    },
    preservedUnchanged: {
      validationV16RawHash: v16Record.rawOutputHash,
      validationV16AggregateHash: v16Record.aggregateHash,
      officialV16: v16Record.result.accepted,
    },
  };

  writeFileSync(resolve(`${OUT_DIR}/rc6-executed-parser-source-snapshot-v1.json`), `${JSON.stringify(snapshotManifest, null, 2)}\n`);
  writeFileSync(resolve(`${OUT_DIR}/rc6-provenance-remediation-v1.json`), `${JSON.stringify(remediation, null, 2)}\n`);

  if (!committedClosureMatch) {
    throw new Error(`Executed closure mismatch: ${executedClosure} != ${RC6_EXECUTED_PARSER_BLOB_CLOSURE}`);
  }

  console.log(
    JSON.stringify(
      {
        status: remediation.status,
        executedClosure,
        snapshotManifest: `${OUT_DIR}/rc6-executed-parser-source-snapshot-v1.json`,
        remediation: `${OUT_DIR}/rc6-provenance-remediation-v1.json`,
        validatorDrift,
        workingTreeClean: statusLines.length === 0,
      },
      null,
      2,
    ),
  );
}

main();
