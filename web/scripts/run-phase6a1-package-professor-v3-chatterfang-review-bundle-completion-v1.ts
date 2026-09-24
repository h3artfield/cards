#!/usr/bin/env npx tsx
/** Package existing Chatterfang sealed execution closure for independent review — copy only, no reseal. */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { MILESTONES, REPO, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

export const PROFESSOR_V3_CHATTERFANG_REVIEW_BUNDLE_COMPLETION_DECISION_V1 =
  "PROFESSOR_V3_CHATTERFANG_REVIEW_BUNDLE_COMPLETION_V1_AUTHORIZED_NO_MODEL";

const EXPECTED = {
  executionIdentityArtifactSha256: "52d797da1dab11e820b2946dc170540d8e2ba45571b6c53574ee52602147d958",
  executionPinsArtifactSha256: "2b1aeb61b4f28b35055a6c0993d9679f0a46f1c55e28a23ea86985d409788cbd",
  dependencyManifestSha256: "b29b900b12ccf908cba1b7289c5d6ed29739fb81be091f1a733257afd2a094b7",
  executeRunnerSha256: "a801a16a76db0acdce0a052ba689429a128d057087eecf4e6e69b49a8f3c3abe",
} as const;

const IDENTITY_PATH = resolve(
  MILESTONES,
  "phase6a1-professor-v3-smoke-execution-identity-v11-chatterfang-executable-v1.json",
);
const PINS_PATH = resolve(MILESTONES, "phase6a1-professor-v3-smoke-execution-pins-v11-chatterfang-executable-v1.json");
const SEALING_AUDIT_PATH = resolve(MILESTONES, "phase6a1-professor-v3-chatterfang-executable-stack-sealing-audit-v1.json");
const RESEAL_AUDIT_PATH = resolve(MILESTONES, "phase6a1-professor-v3-chatterfang-prospective-stack-reseal-audit-v1.json");
const LIVE_ROOT_PATH = resolve(REPO, "web/scripts/lib/phase6a1-professor-v3-smoke-execution-authorization-live-root-v1.ts");
const CANDIDATE_AUTH_PATH = resolve(REPO, "web/scripts/lib/phase6a1-professor-v3-smoke-execution-authorization-chatterfang-v1.ts");

const OUT_ZIP = resolve(MILESTONES, "phase6a1-professor-v3-chatterfang-review-bundle-completion-v1.zip");
const OUT_MANIFEST = resolve(MILESTONES, "phase6a1-professor-v3-chatterfang-review-bundle-completion-v1-manifest.json");
const MANIFEST_BUNDLE_PATH = "milestones/deck-synthesis/phase6a1-professor-v3-chatterfang-review-bundle-completion-v1-manifest.json";
const DEPENDENCY_MANIFEST_BUNDLE_PATH =
  "milestones/deck-synthesis/phase6a1-professor-v3-chatterfang-dependency-manifest-v11-chatterfang-executable-v1.json";

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
  if (!existsSync(IDENTITY_PATH)) throw new Error(`Missing sealed identity: ${IDENTITY_PATH}`);
  if (!existsSync(PINS_PATH)) throw new Error(`Missing sealed pins: ${PINS_PATH}`);
  if (!existsSync(SEALING_AUDIT_PATH)) throw new Error(`Missing sealing audit: ${SEALING_AUDIT_PATH}`);

  const identitySha = sha256File(IDENTITY_PATH);
  const pinsSha = sha256File(PINS_PATH);
  if (identitySha !== EXPECTED.executionIdentityArtifactSha256) {
    throw new Error(`Identity SHA mismatch: expected ${EXPECTED.executionIdentityArtifactSha256}, got ${identitySha}`);
  }
  if (pinsSha !== EXPECTED.executionPinsArtifactSha256) {
    throw new Error(`Pins SHA mismatch: expected ${EXPECTED.executionPinsArtifactSha256}, got ${pinsSha}`);
  }

  const identity = JSON.parse(readFileSync(IDENTITY_PATH, "utf8")) as { dependencyManifestSha256: string; executeRunnerSha256: string };
  const pins = JSON.parse(readFileSync(PINS_PATH, "utf8")) as PinsArtifact;
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
  if (pins.fileCount !== pins.files.length) {
    throw new Error(`Pins fileCount ${pins.fileCount} != files.length ${pins.files.length}`);
  }
  return { identitySha, pinsSha, pins };
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
      bundlePath: "milestones/deck-synthesis/phase6a1-professor-v3-chatterfang-executable-stack-sealing-audit-v1.json",
      sourcePath: SEALING_AUDIT_PATH,
    },
    {
      bundlePath: "milestones/deck-synthesis/phase6a1-professor-v3-chatterfang-prospective-stack-reseal-audit-v1.json",
      sourcePath: RESEAL_AUDIT_PATH,
    },
    {
      bundlePath: "scripts/lib/phase6a1-professor-v3-smoke-execution-authorization-live-root-v1.ts",
      sourcePath: LIVE_ROOT_PATH,
    },
    {
      bundlePath: "scripts/lib/phase6a1-professor-v3-smoke-execution-authorization-chatterfang-v1.ts",
      sourcePath: CANDIDATE_AUTH_PATH,
    },
  ];

  const files: Array<{ path: string; sha256: string; byteSize: number }> = [];
  for (const item of sealed) {
    if (!existsSync(item.sourcePath)) {
      if (item.sourcePath === RESEAL_AUDIT_PATH) continue;
      throw new Error(`Missing sealed artifact source: ${item.sourcePath}`);
    }
    const dest = join(staging, item.bundlePath);
    mkdirSync(join(dest, ".."), { recursive: true });
    cpSync(item.sourcePath, dest);
    files.push({ path: item.bundlePath, sha256: sha256File(dest), byteSize: statSync(dest).size });
  }
  return files;
}

function writeZip(staging: string, zipPath: string) {
  rmSync(zipPath, { force: true });
  const zipResult = spawnSync(
    "powershell",
    ["-NoProfile", "-Command", `Compress-Archive -Path '${staging.replace(/'/g, "''")}\\*' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`],
    { encoding: "utf8" },
  );
  if (zipResult.status !== 0) throw new Error(`Compress-Archive failed: ${zipResult.stderr || zipResult.stdout}`);
  return readFileSync(zipPath);
}

function main() {
  const { identitySha, pinsSha, pins } = assertExistingSealedAnchors();
  const staging = resolve(MILESTONES, ".review-bundle-professor-v3-chatterfang-review-bundle-completion-v1-staging");
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });

  const dependencyManifestArtifact = {
    version: "phase6a1-professor-v3-chatterfang-dependency-manifest-v11-chatterfang-executable-v1",
    decision: PROFESSOR_V3_CHATTERFANG_REVIEW_BUNDLE_COMPLETION_DECISION_V1,
    dependencyManifestSha256: pins.dependencyManifestSha256,
    fileCount: pins.fileCount,
    files: pins.files.map((f) => ({
      label: f.label,
      relativePath: repoRelativeFromAbsolute(f.path),
      sha256: f.sha256,
      byteSize: f.byteSize,
    })),
    sourcePinsArtifactSha256: pinsSha,
  };
  const dependencyManifestDest = join(staging, DEPENDENCY_MANIFEST_BUNDLE_PATH);
  mkdirSync(join(dependencyManifestDest, ".."), { recursive: true });
  writeFileSync(dependencyManifestDest, `${JSON.stringify(dependencyManifestArtifact, null, 2)}\n`);

  const closureFiles = stagePinnedClosure(staging, pins);
  const sealedArtifacts = stageSealedArtifacts(staging);

  const manifestDraft = {
    version: "phase6a1-professor-v3-chatterfang-review-bundle-completion-v1-manifest",
    generatedAt: new Date().toISOString(),
    decision: PROFESSOR_V3_CHATTERFANG_REVIEW_BUNDLE_COMPLETION_DECISION_V1,
    openAiCallsInThisBlock: 0,
    packagingMode: "COPY_EXISTING_SEALED_BYTES_ONLY",
    chatterfangProspectiveModelSmoke: "NOT_YET_AUTHORIZED",
    liveAuthorizationRoot: "NO_MODEL",
    sealedAnchors: {
      executionIdentityArtifactSha256: identitySha,
      executionPinsArtifactSha256: pinsSha,
      dependencyManifestSha256: EXPECTED.dependencyManifestSha256,
      executeRunnerSha256: EXPECTED.executeRunnerSha256,
    },
    requiredArtifacts: {
      executionIdentity: "milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-identity-v11-chatterfang-executable-v1.json",
      executionPins: "milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-pins-v11-chatterfang-executable-v1.json",
      dependencyManifest:
        "milestones/deck-synthesis/phase6a1-professor-v3-chatterfang-dependency-manifest-v11-chatterfang-executable-v1.json",
      executableStackSealingAudit:
        "milestones/deck-synthesis/phase6a1-professor-v3-chatterfang-executable-stack-sealing-audit-v1.json",
      smokeExecutionImplementation:
        "dependency-closure/web/scripts/lib/phase6a1-professor-v3-chatterfang-prospective-smoke-execution-v1.ts",
      modelRequestBoundary:
        "dependency-closure/web/scripts/lib/phase6a1-professor-v3-chatterfang-model-request-boundary-v1.ts",
    },
    externalAuthorizationRoot: {
      relativePath: "scripts/lib/phase6a1-professor-v3-smoke-execution-authorization-live-root-v1.ts",
      sha256: sha256File(LIVE_ROOT_PATH),
      note: "Bundled for review only; excluded from dependency closure trust root.",
    },
    candidateExecutionAuthorization: {
      relativePath: "scripts/lib/phase6a1-professor-v3-smoke-execution-authorization-chatterfang-v1.ts",
      sha256: existsSync(CANDIDATE_AUTH_PATH) ? sha256File(CANDIDATE_AUTH_PATH) : null,
      note: "External to dependency closure; patched candidate anchors reference sealed identity/pins.",
    },
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
  };
  writeFileSync(OUT_MANIFEST, `${JSON.stringify(finalManifest, null, 2)}\n`);
  rmSync(staging, { recursive: true, force: true });
  console.log(JSON.stringify({ zip: OUT_ZIP, manifest: OUT_MANIFEST, pass: true, sealedAnchors: EXPECTED }, null, 2));
}

main();
