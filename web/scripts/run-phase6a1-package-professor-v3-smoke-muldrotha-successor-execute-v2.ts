#!/usr/bin/env npx tsx
/** Package complete successor Muldrotha smoke v2 execution artifacts. */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { MILESTONES, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";
import { resolveProfessorV3SmokeMuldrothaSuccessorOutputTargetsV2 } from "./lib/phase6a1-professor-v3-smoke-output-targets-v4";

const OUT_ZIP = resolve(MILESTONES, "phase6a1-professor-v3-smoke-muldrotha-successor-execute-v2.zip");
const OUT_MANIFEST = resolve(MILESTONES, "phase6a1-professor-v3-smoke-muldrotha-successor-execute-v2-manifest.json");
const OUT_REPORT = resolve(MILESTONES, "phase6a1-professor-v3-smoke-muldrotha-successor-execute-report-v2.json");
const CONSOLE_LOG = resolve(MILESTONES, "phase6a1-professor-v3-smoke-muldrotha-successor-execute-console-v2.txt");

function sha256Bytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function listModelAttempts(dir: string): Array<{ bundlePath: string; sourcePath: string }> {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .sort()
    .map((name) => ({
      bundlePath: join("model-attempts", name).replace(/\\/g, "/"),
      sourcePath: resolve(dir, name),
    }));
}

function main() {
  const targets = resolveProfessorV3SmokeMuldrothaSuccessorOutputTargetsV2(MILESTONES);
  const bundleFiles: Array<{ bundlePath: string; sourcePath: string }> = [
    { bundlePath: "result.json", sourcePath: targets.result },
    { bundlePath: "execution-trace.json", sourcePath: targets.executionTrace },
    { bundlePath: "run-ledger.json", sourcePath: targets.runLedger },
    { bundlePath: "stdout.txt", sourcePath: targets.stdout },
    { bundlePath: "stderr.txt", sourcePath: targets.stderr },
    { bundlePath: "manifest.json", sourcePath: targets.manifest },
    { bundlePath: "execute-console.txt", sourcePath: CONSOLE_LOG },
    ...listModelAttempts(targets.modelAttemptsDir),
  ];
  if (existsSync(targets.failure)) {
    bundleFiles.splice(6, 0, { bundlePath: "failure.json", sourcePath: targets.failure });
  }

  for (const file of bundleFiles) {
    if (!existsSync(file.sourcePath)) throw new Error(`Missing bundle source: ${file.sourcePath}`);
  }

  const manifestArtifact = JSON.parse(readFileSync(targets.manifest, "utf8"));
  const runLedger = JSON.parse(readFileSync(targets.runLedger, "utf8"));
  const resultArtifact = existsSync(targets.result) ? JSON.parse(readFileSync(targets.result, "utf8")) : null;
  const failureArtifact = existsSync(targets.failure) ? JSON.parse(readFileSync(targets.failure, "utf8")) : null;

  const report = {
    version: "phase6a1-professor-v3-smoke-muldrotha-successor-execute-report-v2",
    generatedAt: new Date().toISOString(),
    decision: "PROFESSOR_V3_SUCCESSOR_SCHEMA_REPAIR_V1_PASS_ONE_MULDROTHA_SUCCESSOR_V2_SMOKE_AUTHORIZED_WITH_EXTERNAL_ANCHORS",
    executionAuthorized: true,
    executedOnce: true,
    rerunProhibited: true,
    preflightAnchors: {
      authorizationV6: "77cc00be85c3081c86f3a066629a9fde6b467cc92a3bc2f1c9ec2e6ef7ef3b33",
      successorRunnerV2: "10de8fee22a90281c7dc50f5731259ae81488651f47f3fb8b7dda285d5702929",
      identityArtifact: "94043d0d03ecff9de1debbd1ea0128571fe3a43e60cc00cd55f3bb49342e8113",
      pinsArtifact: "1fa8518bc6d1f82ec5c67153007fe180a60efa637c37bbb5f0a2cf8960a27d51",
      dependencyManifest: "6888175f6bbeed43719d8a94f2f1a1ed6b5f7ebbef73a6a1f8ca12c302bbcc1a",
      allMatched: true,
    },
    ragEnvironment: {
      mtgRagEnabled: true,
      firebaseProjectId: "trading-card-buyback-dev",
      initialRagEvidenceCount: runLedger.evidenceObjects.filter((o: { kind: string }) => o.kind === "RAG").length,
      retrievalEventCount: runLedger.retrievalEvents.length,
    },
    executionOutcome: {
      caseId: manifestArtifact.caseId,
      executionStatus: manifestArtifact.executionStatus,
      executionStage: manifestArtifact.executionStage ?? resultArtifact?.caseStatus,
      caseStatus: resultArtifact?.caseStatus ?? manifestArtifact.caseStatus,
      errorClass: failureArtifact?.errorClass ?? null,
      errorMessage: failureArtifact?.errorMessage ?? null,
      modelAttemptCount: manifestArtifact.partialModelAttemptFiles?.length ?? manifestArtifact.modelAttemptArtifacts?.length ?? 0,
      repairRounds: resultArtifact?.orchestration?.repairRounds ?? null,
      professorToolCalls: resultArtifact?.orchestration?.toolCalls?.length ?? null,
    },
    instruction: "REPORT AND WAIT — successor Muldrotha smoke v2 spent. No rerun authorized.",
  };
  writeFileSync(OUT_REPORT, JSON.stringify(report, null, 2));
  bundleFiles.push({ bundlePath: "execute-report.json", sourcePath: OUT_REPORT });

  const staging = resolve(MILESTONES, ".review-bundle-professor-v3-smoke-muldrotha-successor-execute-v2-staging");
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  const files = bundleFiles.map((file) => {
    const dest = join(staging, file.bundlePath);
    mkdirSync(join(dest, ".."), { recursive: true });
    cpSync(file.sourcePath, dest);
    return { path: file.bundlePath, sha256: sha256File(dest), byteSize: statSync(dest).size };
  });
  rmSync(OUT_ZIP, { force: true });
  const zipResult = spawnSync(
    "powershell",
    ["-NoProfile", "-Command", `Compress-Archive -Path '${staging.replace(/'/g, "''")}\\*' -DestinationPath '${OUT_ZIP.replace(/'/g, "''")}' -Force`],
    { encoding: "utf8" },
  );
  if (zipResult.status !== 0) throw new Error(`Compress-Archive failed: ${zipResult.stderr || zipResult.stdout}`);
  const zipBytes = readFileSync(OUT_ZIP);
  const packageManifest = {
    version: "phase6a1-professor-v3-smoke-muldrotha-successor-execute-v2-manifest",
    generatedAt: new Date().toISOString(),
    decision: report.decision,
    executionStatus: manifestArtifact.executionStatus,
    caseStatus: resultArtifact?.caseStatus ?? manifestArtifact.caseStatus,
    caseId: manifestArtifact.caseId,
    rerunProhibited: true,
    fileCount: files.length,
    files,
    zip: { artifact: basename(OUT_ZIP), sha256: sha256Bytes(zipBytes), byteSize: zipBytes.length },
    report: { path: basename(OUT_REPORT), sha256: sha256File(OUT_REPORT) },
  };
  writeFileSync(OUT_MANIFEST, JSON.stringify(packageManifest, null, 2));
  rmSync(staging, { recursive: true, force: true });
  console.log(JSON.stringify(packageManifest, null, 2));
}

main();
