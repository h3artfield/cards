#!/usr/bin/env npx tsx
/** Package existing 88-file transitive-runtime closure for independent review — copy only, no reseal. */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { MILESTONES, REPO, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";
import {
  CHATTERFANG_EXECUTE_RUNNER_PATH,
  PROFESSOR_V3_CHATTERFANG_EXTERNAL_RUNTIME_AUTHORIZATION_PATHS,
  PROFESSOR_V3_RUNTIME_LOCAL_IMPORT_CLOSURE_V1_VERSION,
} from "./lib/phase6a1-professor-v3-runtime-local-import-closure-v1";

export const PROFESSOR_V3_CHATTERFANG_TRANSITIVE_CLOSURE_REVIEW_BUNDLE_DECISION_V1 =
  "PROFESSOR_V3_CHATTERFANG_TRANSITIVE_CLOSURE_REVIEW_BUNDLE_V1_AUTHORIZED_NO_MODEL";

const EXPECTED = {
  executionIdentityArtifactSha256: "336efe3661bfd7190897b6f9040668f2f9a1a2888dac6cc1293a7ee510be4c13",
  executionPinsArtifactSha256: "a482456abd3e5c6bfbac1c854bbbc845e3a0edea7a87b10fa96342b59801db28",
  dependencyManifestSha256: "78bfcb790abacf0d47584b86589531837a5e2ede04f3ee885bd79553a45e158c",
  executeRunnerSha256: "a801a16a76db0acdce0a052ba689429a128d057087eecf4e6e69b49a8f3c3abe",
  transitiveClosureRepairAuditSha256: "d30aca8f8977e9ce2a07535d7e75491032db2f8dd152a8a848dac5378ee8e633",
  executableStackSealingAuditSha256: "db8d07d6d7874e1b9cbf3c0db23f96f7aa7df531404d2ba2144c7be078c7a036",
  transitiveRuntimeClosureFileCount: 88,
  transitiveClosureRepairAuditPassCount: 9,
  executableStackSealingAuditPassCount: 26,
} as const;

const IDENTITY_PATH = resolve(
  MILESTONES,
  "phase6a1-professor-v3-smoke-execution-identity-v11-chatterfang-executable-v1.json",
);
const PINS_PATH = resolve(MILESTONES, "phase6a1-professor-v3-smoke-execution-pins-v11-chatterfang-executable-v1.json");
const CLOSURE_REPAIR_AUDIT_PATH = resolve(
  MILESTONES,
  "phase6a1-professor-v3-chatterfang-transitive-runtime-closure-repair-audit-v1.json",
);
const SEALING_AUDIT_PATH = resolve(MILESTONES, "phase6a1-professor-v3-chatterfang-executable-stack-sealing-audit-v1.json");
const CLOSURE_IMPL_PATH = resolve(REPO, "web/scripts/lib/phase6a1-professor-v3-runtime-local-import-closure-v1.ts");

const OUT_ZIP = resolve(MILESTONES, "phase6a1-professor-v3-chatterfang-transitive-closure-review-bundle-v1.zip");
const OUT_MANIFEST = resolve(
  MILESTONES,
  "phase6a1-professor-v3-chatterfang-transitive-closure-review-bundle-v1-manifest.json",
);
const MANIFEST_BUNDLE_PATH =
  "milestones/deck-synthesis/phase6a1-professor-v3-chatterfang-transitive-closure-review-bundle-v1-manifest.json";
const DEPENDENCY_MANIFEST_BUNDLE_PATH =
  "milestones/deck-synthesis/phase6a1-professor-v3-chatterfang-dependency-manifest-v11-chatterfang-transitive-closure-v1.json";
const EXTERNAL_ANCHORS_BUNDLE_PATH =
  "milestones/deck-synthesis/phase6a1-professor-v3-chatterfang-external-runtime-authorization-anchors-v1.json";
const CLOSURE_IMPL_BUNDLE_PATH = "dependency-closure/web/scripts/lib/phase6a1-professor-v3-runtime-local-import-closure-v1.ts";

type PinEntry = { label: string; path: string; sha256: string; byteSize: number };
type PinsArtifact = {
  dependencyManifestSha256: string;
  fileCount: number;
  files: PinEntry[];
  sha256: string;
};

function sha256Bytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function repoRelativeFromAbsolute(absolutePath: string): string {
  const normalized = absolutePath.replace(/\\/g, "/");
  const repo = REPO.replace(/\\/g, "/");
  if (normalized.startsWith(repo + "/")) return normalized.slice(repo.length + 1);
  const webIdx = normalized.indexOf("/web/");
  if (webIdx >= 0) return normalized.slice(webIdx + 1);
  return basename(normalized);
}

function assertExistingSealedAnchors() {
  for (const [label, path] of [
    ["identity", IDENTITY_PATH],
    ["pins", PINS_PATH],
    ["transitive closure repair audit", CLOSURE_REPAIR_AUDIT_PATH],
    ["executable stack sealing audit", SEALING_AUDIT_PATH],
    ["import closure implementation", CLOSURE_IMPL_PATH],
  ] as const) {
    if (!existsSync(path)) throw new Error(`Missing ${label}: ${path}`);
  }

  const identitySha = sha256File(IDENTITY_PATH);
  const pinsSha = sha256File(PINS_PATH);
  const closureRepairAuditSha = sha256File(CLOSURE_REPAIR_AUDIT_PATH);
  const sealingAuditSha = sha256File(SEALING_AUDIT_PATH);

  if (identitySha !== EXPECTED.executionIdentityArtifactSha256) {
    throw new Error(`Identity SHA mismatch: expected ${EXPECTED.executionIdentityArtifactSha256}, got ${identitySha}`);
  }
  if (pinsSha !== EXPECTED.executionPinsArtifactSha256) {
    throw new Error(`Pins SHA mismatch: expected ${EXPECTED.executionPinsArtifactSha256}, got ${pinsSha}`);
  }
  if (closureRepairAuditSha !== EXPECTED.transitiveClosureRepairAuditSha256) {
    throw new Error(
      `Closure repair audit SHA mismatch: expected ${EXPECTED.transitiveClosureRepairAuditSha256}, got ${closureRepairAuditSha256}`,
    );
  }
  if (sealingAuditSha !== EXPECTED.executableStackSealingAuditSha256) {
    throw new Error(
      `Sealing audit SHA mismatch: expected ${EXPECTED.executableStackSealingAuditSha256}, got ${sealingAuditSha}`,
    );
  }

  const identity = JSON.parse(readFileSync(IDENTITY_PATH, "utf8")) as {
    dependencyManifestSha256: string;
    executeRunnerSha256: string;
  };
  const pins = JSON.parse(readFileSync(PINS_PATH, "utf8")) as PinsArtifact;
  const closureRepairAudit = JSON.parse(readFileSync(CLOSURE_REPAIR_AUDIT_PATH, "utf8")) as {
    passed: number;
    totalChecks: number;
    transitiveRuntimeClosureFileCount: number;
  };
  const sealingAudit = JSON.parse(readFileSync(SEALING_AUDIT_PATH, "utf8")) as { passed: number; totalChecks: number };

  if (identity.dependencyManifestSha256 !== EXPECTED.dependencyManifestSha256) {
    throw new Error(
      `Identity dependencyManifestSha256 mismatch: expected ${EXPECTED.dependencyManifestSha256}, got ${identity.dependencyManifestSha256}`,
    );
  }
  if (pins.dependencyManifestSha256 !== EXPECTED.dependencyManifestSha256) {
    throw new Error(
      `Pins dependencyManifestSha256 mismatch: expected ${EXPECTED.dependencyManifestSha256}, got ${pins.dependencyManifestSha256}`,
    );
  }
  if (identity.executeRunnerSha256 !== EXPECTED.executeRunnerSha256) {
    throw new Error(`Runner SHA mismatch in identity: expected ${EXPECTED.executeRunnerSha256}, got ${identity.executeRunnerSha256}`);
  }
  if (pins.fileCount !== EXPECTED.transitiveRuntimeClosureFileCount || pins.files.length !== EXPECTED.transitiveRuntimeClosureFileCount) {
    throw new Error(`Pins fileCount mismatch: expected ${EXPECTED.transitiveRuntimeClosureFileCount}, got ${pins.fileCount}/${pins.files.length}`);
  }
  if (closureRepairAudit.passed !== EXPECTED.transitiveClosureRepairAuditPassCount) {
    throw new Error(`Closure repair audit pass count mismatch: expected ${EXPECTED.transitiveClosureRepairAuditPassCount}, got ${closureRepairAudit.passed}`);
  }
  if (sealingAudit.passed !== EXPECTED.executableStackSealingAuditPassCount) {
    throw new Error(`Sealing audit pass count mismatch: expected ${EXPECTED.executableStackSealingAuditPassCount}, got ${sealingAudit.passed}`);
  }

  return { identitySha, pinsSha, pins, closureRepairAuditSha, sealingAuditSha };
}

function stagePinnedClosure(staging: string, pins: PinsArtifact) {
  const staged: Array<{ path: string; sha256: string; byteSize: number; label: string }> = [];
  for (const entry of pins.files) {
    if (!existsSync(entry.path)) throw new Error(`Missing pinned source: ${entry.path}`);
    const gotSha = sha256File(entry.path);
    if (gotSha !== entry.sha256) {
      throw new Error(`Pinned source drift for ${entry.label}: expected ${entry.sha256}, got ${gotSha}`);
    }
    const bundlePath = join("dependency-closure", repoRelativeFromAbsolute(entry.path));
    const dest = join(staging, bundlePath);
    mkdirSync(join(dest, ".."), { recursive: true });
    cpSync(entry.path, dest);
    staged.push({ path: bundlePath.replace(/\\/g, "/"), sha256: gotSha, byteSize: statSync(dest).size, label: entry.label });
  }
  return staged;
}

function stageSealedArtifacts(staging: string) {
  const sealed = [
    {
      bundlePath: "milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-identity-v11-chatterfang-executable-v1.json",
      sourcePath: IDENTITY_PATH,
    },
    {
      bundlePath: "milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-pins-v11-chatterfang-executable-v1.json",
      sourcePath: PINS_PATH,
    },
    {
      bundlePath:
        "milestones/deck-synthesis/phase6a1-professor-v3-chatterfang-transitive-runtime-closure-repair-audit-v1.json",
      sourcePath: CLOSURE_REPAIR_AUDIT_PATH,
    },
    {
      bundlePath: "milestones/deck-synthesis/phase6a1-professor-v3-chatterfang-executable-stack-sealing-audit-v1.json",
      sourcePath: SEALING_AUDIT_PATH,
    },
    ...PROFESSOR_V3_CHATTERFANG_EXTERNAL_RUNTIME_AUTHORIZATION_PATHS.map((sourcePath) => ({
      bundlePath: repoRelativeFromAbsolute(sourcePath),
      sourcePath,
    })),
  ];

  const files: Array<{ path: string; sha256: string; byteSize: number }> = [];
  for (const item of sealed) {
    const dest = join(staging, item.bundlePath);
    mkdirSync(join(dest, ".."), { recursive: true });
    cpSync(item.sourcePath, dest);
    files.push({ path: item.bundlePath.replace(/\\/g, "/"), sha256: sha256File(dest), byteSize: statSync(dest).size });
  }
  return files;
}

function writeZip(staging: string, zipPath: string) {
  rmSync(zipPath, { force: true });
  const zipResult = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path '${staging.replace(/'/g, "''")}\\*' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`,
    ],
    { encoding: "utf8" },
  );
  if (zipResult.status !== 0) throw new Error(`Compress-Archive failed: ${zipResult.stderr || zipResult.stdout}`);
  return readFileSync(zipPath);
}

function main() {
  const { identitySha, pinsSha, pins, closureRepairAuditSha, sealingAuditSha } = assertExistingSealedAnchors();
  const staging = resolve(MILESTONES, ".review-bundle-professor-v3-chatterfang-transitive-closure-v1-staging");
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });

  const dependencyManifestArtifact = {
    version: "phase6a1-professor-v3-chatterfang-dependency-manifest-v11-chatterfang-transitive-closure-v1",
    decision: PROFESSOR_V3_CHATTERFANG_TRANSITIVE_CLOSURE_REVIEW_BUNDLE_DECISION_V1,
    dependencyManifestSha256: pins.dependencyManifestSha256,
    fileCount: pins.fileCount,
    files: pins.files.map((file) => ({
      label: file.label,
      relativePath: repoRelativeFromAbsolute(file.path),
      sha256: file.sha256,
      byteSize: file.byteSize,
    })),
    sourcePinsArtifactSha256: pinsSha,
    note: "Extracted from existing sealed execution pins JSON for independent review; bytes not resealed.",
  };
  const dependencyManifestDest = join(staging, DEPENDENCY_MANIFEST_BUNDLE_PATH);
  mkdirSync(join(dependencyManifestDest, ".."), { recursive: true });
  writeFileSync(dependencyManifestDest, `${JSON.stringify(dependencyManifestArtifact, null, 2)}\n`);

  const externalAnchorsArtifact = {
    version: "phase6a1-professor-v3-chatterfang-external-runtime-authorization-anchors-v1",
    decision: PROFESSOR_V3_CHATTERFANG_TRANSITIVE_CLOSURE_REVIEW_BUNDLE_DECISION_V1,
    executeRunnerRelativePath: repoRelativeFromAbsolute(CHATTERFANG_EXECUTE_RUNNER_PATH),
    executeRunnerSha256: EXPECTED.executeRunnerSha256,
    externalRuntimeAuthorizationAnchorCount: PROFESSOR_V3_CHATTERFANG_EXTERNAL_RUNTIME_AUTHORIZATION_PATHS.length,
    externalRuntimeAuthorizationAnchors: PROFESSOR_V3_CHATTERFANG_EXTERNAL_RUNTIME_AUTHORIZATION_PATHS.map((absolutePath) => ({
      relativePath: repoRelativeFromAbsolute(absolutePath),
      sha256: sha256File(absolutePath),
      role:
        absolutePath.endsWith("live-root-v1.ts")
          ? "live_execution_authorization_root_NO_MODEL"
          : "candidate_execution_authorization_chatterfang_v11",
      includedInPinnedRuntimeClosure: false,
    })),
    importClosureImplementation: {
      version: PROFESSOR_V3_RUNTIME_LOCAL_IMPORT_CLOSURE_V1_VERSION,
      relativePath: CLOSURE_IMPL_BUNDLE_PATH,
      sha256: sha256File(CLOSURE_IMPL_PATH),
    },
    verificationRecipe: [
      "Start from execute runner in dependency-closure/",
      "Recursively traverse runtime local imports using phase6a1-professor-v3-runtime-local-import-closure-v1.ts",
      "Stop at exactly the two externalRuntimeAuthorizationAnchors above",
      "Require pinned set equals reachable closure with zero unpinned local imports",
      "Hash all pinned files against execution pins JSON entries",
    ],
  };
  const externalAnchorsDest = join(staging, EXTERNAL_ANCHORS_BUNDLE_PATH);
  mkdirSync(join(externalAnchorsDest, ".."), { recursive: true });
  writeFileSync(externalAnchorsDest, `${JSON.stringify(externalAnchorsArtifact, null, 2)}\n`);

  const closureFiles = stagePinnedClosure(staging, pins);
  const sealedArtifacts = stageSealedArtifacts(staging);

  const manifestDraft = {
    version: "phase6a1-professor-v3-chatterfang-transitive-closure-review-bundle-v1-manifest",
    generatedAt: new Date().toISOString(),
    decision: PROFESSOR_V3_CHATTERFANG_TRANSITIVE_CLOSURE_REVIEW_BUNDLE_DECISION_V1,
    openAiCallsInThisBlock: 0,
    packagingMode: "COPY_EXISTING_SEALED_BYTES_ONLY",
    chatterfangProspectiveModelSmoke: "NOT_YET_AUTHORIZED",
    liveAuthorizationRoot: "NO_MODEL",
    sealedAnchors: {
      executionIdentityArtifactSha256: identitySha,
      executionPinsArtifactSha256: pinsSha,
      dependencyManifestSha256: EXPECTED.dependencyManifestSha256,
      executeRunnerSha256: EXPECTED.executeRunnerSha256,
      transitiveClosureRepairAuditSha256: closureRepairAuditSha,
      executableStackSealingAuditSha256: sealingAuditSha,
    },
    audits: {
      transitiveRuntimeClosureRepair: {
        relativePath:
          "milestones/deck-synthesis/phase6a1-professor-v3-chatterfang-transitive-runtime-closure-repair-audit-v1.json",
        sha256: closureRepairAuditSha,
        passCount: EXPECTED.transitiveClosureRepairAuditPassCount,
        totalChecks: EXPECTED.transitiveClosureRepairAuditPassCount,
      },
      executableStackSealing: {
        relativePath: "milestones/deck-synthesis/phase6a1-professor-v3-chatterfang-executable-stack-sealing-audit-v1.json",
        sha256: sealingAuditSha,
        passCount: EXPECTED.executableStackSealingAuditPassCount,
        totalChecks: EXPECTED.executableStackSealingAuditPassCount,
      },
    },
    requiredArtifacts: {
      executionIdentity:
        "milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-identity-v11-chatterfang-executable-v1.json",
      executionPins:
        "milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-pins-v11-chatterfang-executable-v1.json",
      dependencyManifest: DEPENDENCY_MANIFEST_BUNDLE_PATH,
      externalRuntimeAuthorizationAnchors: EXTERNAL_ANCHORS_BUNDLE_PATH,
      importClosureImplementation: CLOSURE_IMPL_BUNDLE_PATH,
      executeRunner:
        "dependency-closure/web/scripts/run-phase6a1-execute-smoke-professor-v3-chatterfang-prospective-v1.ts",
    },
    externalRuntimeAuthorizationAnchors: externalAnchorsArtifact.externalRuntimeAuthorizationAnchors,
    importClosureImplementation: externalAnchorsArtifact.importClosureImplementation,
    dependencyClosure: {
      manifestSha256: pins.dependencyManifestSha256,
      stagedFileCount: closureFiles.length,
      files: closureFiles,
    },
    sealedArtifacts,
    fileCount: closureFiles.length + sealedArtifacts.length + 2,
  };

  writeFileSync(join(staging, MANIFEST_BUNDLE_PATH), JSON.stringify(manifestDraft, null, 2));
  const zipBytes = writeZip(staging, OUT_ZIP);
  const finalManifest = {
    ...manifestDraft,
    zip: {
      path: basename(OUT_ZIP),
      sha256: sha256Bytes(zipBytes),
      byteSize: zipBytes.length,
    },
    dependencyManifestArtifact: {
      path: DEPENDENCY_MANIFEST_BUNDLE_PATH,
      sha256: sha256File(join(staging, DEPENDENCY_MANIFEST_BUNDLE_PATH)),
    },
    externalRuntimeAuthorizationAnchorsArtifact: {
      path: EXTERNAL_ANCHORS_BUNDLE_PATH,
      sha256: sha256File(join(staging, EXTERNAL_ANCHORS_BUNDLE_PATH)),
    },
  };
  writeFileSync(OUT_MANIFEST, `${JSON.stringify(finalManifest, null, 2)}\n`);
  rmSync(staging, { recursive: true, force: true });
  console.log(
    JSON.stringify(
      {
        zip: OUT_ZIP,
        manifest: OUT_MANIFEST,
        pass: true,
        sealedAnchors: EXPECTED,
        dependencyClosureFileCount: closureFiles.length,
      },
      null,
      2,
    ),
  );
}

main();
