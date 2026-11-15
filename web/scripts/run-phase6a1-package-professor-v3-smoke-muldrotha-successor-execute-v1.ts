#!/usr/bin/env npx tsx
/** Package complete successor Muldrotha smoke execution artifacts v1. */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { MILESTONES, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";
import { resolveProfessorV3SmokeMuldrothaSuccessorOutputTargetsV1 } from "./lib/phase6a1-professor-v3-smoke-output-targets-v3";

const OUT_ZIP = resolve(MILESTONES, "phase6a1-professor-v3-smoke-muldrotha-successor-execute-v1.zip");
const OUT_MANIFEST = resolve(MILESTONES, "phase6a1-professor-v3-smoke-muldrotha-successor-execute-v1-manifest.json");
const OUT_REPORT = resolve(MILESTONES, "phase6a1-professor-v3-smoke-muldrotha-successor-execute-report-v1.json");
const CONSOLE_LOG = resolve(MILESTONES, "phase6a1-professor-v3-smoke-muldrotha-successor-execute-console-v1.txt");

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
  const targets = resolveProfessorV3SmokeMuldrothaSuccessorOutputTargetsV1(MILESTONES);
  const bundleFiles: Array<{ bundlePath: string; sourcePath: string }> = [
    { bundlePath: "result.json", sourcePath: targets.result },
    { bundlePath: "execution-trace.json", sourcePath: targets.executionTrace },
    { bundlePath: "run-ledger.json", sourcePath: targets.runLedger },
    { bundlePath: "stdout.txt", sourcePath: targets.stdout },
    { bundlePath: "stderr.txt", sourcePath: targets.stderr },
    { bundlePath: "manifest.json", sourcePath: targets.manifest },
    { bundlePath: "failure.json", sourcePath: targets.failure },
    { bundlePath: "execute-console.txt", sourcePath: CONSOLE_LOG },
    ...listModelAttempts(targets.modelAttemptsDir),
  ];

  for (const file of bundleFiles) {
    if (!existsSync(file.sourcePath)) throw new Error(`Missing bundle source: ${file.sourcePath}`);
  }

  const failure = JSON.parse(readFileSync(targets.failure, "utf8"));
  const runLedger = JSON.parse(readFileSync(targets.runLedger, "utf8"));
  const report = {
    version: "phase6a1-professor-v3-smoke-muldrotha-successor-execute-report-v1",
    generatedAt: new Date().toISOString(),
    decision: "PROFESSOR_V3_SUCCESSOR_SMOKE_READINESS_V1_PASS_ONE_SUCCESSOR_MULDROTHA_SMOKE_AUTHORIZED_WITH_EXTERNAL_ANCHORS_AND_ENV_PRECHECK",
    executionAuthorized: true,
    executedOnce: true,
    rerunProhibited: true,
    preflightAnchors: {
      authorizationV5: "bcd8d070979a341ed3e2187e6f8f1af0aac3e7ec55bd5bf2073b994ed0d096fb",
      successorRunner: "b9ca231cc8d828099d210d88fc17fc4dbf04c631cbab511c389996c1d2d36d67",
      identityArtifact: "471cd38a59919d7d5395ed1a236f2912f64dab96e6e00f22cc25fd27de3935ff",
      pinsArtifact: "1746f94efb3dd963b655dd75b049f247b366e0dfdad68762a4fed9e622df9695",
      dependencyManifest: "3f0faf3e342413a1dd9572e3a70206d29bf0bac153245b439f44a6310b694ed7",
      allMatched: true,
    },
    ragEnvironment: {
      mtgRagEnabled: true,
      firebaseProjectId: "trading-card-buyback-dev",
      initialRagEvidenceCount: runLedger.evidenceObjects.filter((o: { kind: string }) => o.kind === "RAG").length,
      retrievalEventCount: runLedger.retrievalEvents.length,
    },
    executionOutcome: {
      caseId: failure.caseId,
      executionStatus: failure.executionStatus,
      executionStage: failure.executionStage,
      errorClass: failure.errorClass,
      rootCause:
        "OpenAI Responses API rejected strict json_schema: toolRequests.items.properties.tool uses const without required type key",
      modelAttemptCount: failure.partialModelAttemptFiles.length > 0 ? 1 : 0,
      repairRounds: 0,
      professorToolCalls: 0,
      exitCode: 1,
    },
    instruction: "REPORT AND WAIT — successor Muldrotha smoke spent. No rerun authorized.",
  };
  writeFileSync(OUT_REPORT, JSON.stringify(report, null, 2));
  bundleFiles.push({ bundlePath: "execute-report.json", sourcePath: OUT_REPORT });

  const staging = resolve(MILESTONES, ".review-bundle-professor-v3-smoke-muldrotha-successor-execute-v1-staging");
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
  const manifest = {
    version: "phase6a1-professor-v3-smoke-muldrotha-successor-execute-v1-manifest",
    generatedAt: new Date().toISOString(),
    decision: report.decision,
    executionStatus: failure.executionStatus,
    executionStage: failure.executionStage,
    caseId: failure.caseId,
    rerunProhibited: true,
    fileCount: files.length,
    files,
    zip: { artifact: basename(OUT_ZIP), sha256: sha256Bytes(zipBytes), byteSize: zipBytes.length },
    report: { path: basename(OUT_REPORT), sha256: sha256File(OUT_REPORT) },
  };
  writeFileSync(OUT_MANIFEST, JSON.stringify(manifest, null, 2));
  rmSync(staging, { recursive: true, force: true });
  console.log(JSON.stringify(manifest, null, 2));
}

main();
