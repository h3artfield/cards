#!/usr/bin/env npx tsx
/** ACL proof v2 — real implementation execution boundary via Docker mount isolation. */
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { writeOnceMilestoneArtifact } from "./lib/write-once-milestone-artifact-v2";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const OUT = resolve(REPO, "web/data/milestones/deck-synthesis");
const WEB = resolve(REPO, "web");
const PROOF_TARGET = resolve(OUT, "phase6a1-professor-plan-separate-authority-checkout-acl-proof-v2.json");
const SPEC_TARGET = resolve(OUT, "phase6a1-professor-plan-separate-authority-checkout-acl-proof-spec-v2.json");
const PROBE_MJS = resolve(HERE, "lib/phase6a1-acl-implementation-container-probe-v1.mjs");
const CONTAINER_IMAGE = "node:22-alpine";
const CONTAINER_IMAGE_DIGEST = "sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32";
const AUTHORITY_PRIVATE_ROOT_SUFFIX = "/private/";

const NORMATIVE_PINS = {
  pipelineFreezeSpecV13: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v13.json",
  selectionPolicyV3: "phase6a1-professor-plan-prospective-commander-selection-policy-v3.json",
  architectureSealedManifestV10PreRosterV4:
    "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v10-pre-roster-v4.json",
  aclProofV1Reaudit: "phase6a1-professor-plan-acl-proof-v1-independent-reaudit-gpt56sol-v1.json",
};

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sha256Bytes(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function runGit(args: string[]): string {
  const result = spawnSync("git", args, { cwd: REPO, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  return (result.stdout ?? "").trim();
}

function shouldSkipOverlay(relFromWeb: string): boolean {
  const norm = relFromWeb.replace(/\\/g, "/");
  return (
    norm.startsWith("node_modules/") ||
    norm.startsWith(".next/") ||
    norm.startsWith(".cache/") ||
    norm.startsWith("out/")
  );
}

function overlayCopyWeb(stagingRoot: string): number {
  let copied = 0;
  function walk(absDir: string, relDir: string): void {
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (shouldSkipOverlay(rel)) continue;
      const abs = join(absDir, entry.name);
      const dest = join(stagingRoot, "web", rel);
      if (entry.isDirectory()) {
        mkdirSync(dest, { recursive: true });
        walk(abs, rel);
      } else {
        mkdirSync(dirname(dest), { recursive: true });
        cpSync(abs, dest);
        copied += 1;
      }
    }
  }
  walk(WEB, "");
  return copied;
}

function buildImplementationExecutionTree(): { stagingRoot: string; archiveByteSha256: string; overlayFileCount: number } {
  const stagingRoot = mkdtempSync(join(tmpdir(), "phase6a1-impl-exec-tree-"));
  const tarPath = join(stagingRoot, "repo.tar");
  const extractDir = join(stagingRoot, "tree");
  mkdirSync(extractDir, { recursive: true });
  const archive = spawnSync("git", ["-C", REPO, "archive", "--format=tar", "-o", tarPath, "HEAD"], {
    encoding: "utf8",
  });
  if (archive.status !== 0) throw new Error(`git archive failed: ${archive.stderr || archive.stdout}`);
  const archiveByteSha256 = sha256File(tarPath);
  const untar = spawnSync("tar", ["-xf", tarPath, "-C", extractDir], { encoding: "utf8" });
  if (untar.status !== 0) throw new Error(`tar extract failed: ${untar.stderr || untar.stdout}`);
  const overlayFileCount = overlayCopyWeb(extractDir);
  return { stagingRoot, archiveByteSha256, overlayFileCount };
}

function buildTreeManifest(stagingTreeRoot: string): { treeManifestSha256: string; fileCount: number; entries: Array<{ relPath: string; sha256: string }> } {
  const entries: Array<{ relPath: string; sha256: string }> = [];
  function walk(absDir: string, relDir: string): void {
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      const abs = join(absDir, entry.name);
      if (entry.isDirectory()) walk(abs, rel);
      else entries.push({ relPath: rel.replace(/\\/g, "/"), sha256: sha256File(abs) });
    }
  }
  walk(stagingTreeRoot, "");
  entries.sort((a, b) => a.relPath.localeCompare(b.relPath));
  const treeManifestSha256 = sha256Bytes(JSON.stringify(entries));
  return { treeManifestSha256, fileCount: entries.length, entries };
}

function listAuthorityPrivateInventory(): {
  existingPrivateRelPaths: string[];
  futureProtectedRelPaths: string[];
  relDirs: string[];
} {
  const existingPrivateRelPaths: string[] = [];
  const relDirs = new Set<string>();
  const authorityRoot = resolve(REPO, "benchmark-authority");
  if (!existsSync(authorityRoot)) throw new Error("FAIL_CLOSED: benchmark-authority root missing on authority host");
  function walk(absDir: string, relDir: string): void {
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      const rel = `${relDir}/${entry.name}`.replace(/^\/+/, "");
      const abs = join(absDir, entry.name);
      if (entry.isDirectory()) {
        if (rel.includes(AUTHORITY_PRIVATE_ROOT_SUFFIX.replace(/\//g, "/"))) relDirs.add(rel);
        walk(abs, rel);
      } else if (rel.includes(AUTHORITY_PRIVATE_ROOT_SUFFIX)) {
        existingPrivateRelPaths.push(rel);
      }
    }
  }
  walk(authorityRoot, "benchmark-authority");
  relDirs.add("benchmark-authority");
  for (const entry of readdirSync(authorityRoot, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const privateDir = join(authorityRoot, entry.name, "private");
      if (existsSync(privateDir)) relDirs.add(`benchmark-authority/${entry.name}/private`);
    }
  }
  const policyV3 = JSON.parse(readFileSync(resolve(OUT, NORMATIVE_PINS.selectionPolicyV3), "utf8")) as {
    privateRosterStorage?: string;
  };
  const futureProtectedRelPaths: string[] = [];
  if (policyV3.privateRosterStorage) {
    const futurePath = policyV3.privateRosterStorage.replace(/\\/g, "/");
    if (!existingPrivateRelPaths.includes(futurePath)) futureProtectedRelPaths.push(futurePath);
  }
  return {
    existingPrivateRelPaths: [...new Set(existingPrivateRelPaths)].sort(),
    futureProtectedRelPaths: [...new Set(futureProtectedRelPaths)].sort(),
    relDirs: [...relDirs].sort(),
  };
}

function runAuthorityHostAccessTests(relPaths: string[]): Array<{
  relPath: string;
  pass: boolean;
  observed: string;
}> {
  return relPaths.map((relPath) => {
    const abs = resolve(REPO, relPath);
    try {
      if (!existsSync(abs)) return { relPath, pass: false, observed: "MISSING_ON_AUTHORITY_HOST" };
      const bytes = readFileSync(abs);
      return { relPath, pass: true, observed: `READ_OK sha256=${sha256Bytes(bytes)} size=${bytes.length}` };
    } catch (err) {
      return { relPath, pass: false, observed: String((err as Error).message).slice(0, 200) };
    }
  });
}

function dockerMountPath(absPath: string): string {
  return absPath.replace(/\\/g, "/");
}

function runContainerProbe(opts: {
  stagingTreeRoot: string;
  relPaths: string[];
  relDirs: string[];
  benchmarkAccessRole?: string;
}): {
  pass: boolean;
  payload: Record<string, unknown>;
  stdout: string;
  stderr: string;
  exitCode: number | null;
} {
  const probeDir = mkdtempSync(join(tmpdir(), "phase6a1-acl-probe-"));
  const pathsFile = join(probeDir, "paths.json");
  writeFileSync(
    pathsFile,
    JSON.stringify({ relPaths: opts.relPaths, relDirs: opts.relDirs }, null, 2),
  );
  cpSync(PROBE_MJS, join(probeDir, "probe.mjs"));
  const args = [
    "run",
    "--rm",
    "-v",
    `${dockerMountPath(opts.stagingTreeRoot)}:/implementation:ro`,
    "-v",
    `${dockerMountPath(probeDir)}:/probe:ro`,
  ];
  if (opts.benchmarkAccessRole) args.push("-e", `PHASE6A1_BENCHMARK_ACCESS_ROLE=${opts.benchmarkAccessRole}`);
  args.push(`${CONTAINER_IMAGE}@${CONTAINER_IMAGE_DIGEST}`, "node", "/probe/probe.mjs");
  const result = spawnSync("docker", args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  const stdout = (result.stdout ?? "").trim();
  const stderr = (result.stderr ?? "").trim();
  const jsonLine = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{") && line.endsWith("}"))
    .at(-1);
  let payload: Record<string, unknown> = {};
  if (jsonLine) {
    try {
      payload = JSON.parse(jsonLine) as Record<string, unknown>;
    } catch {
      payload = { parseError: true, jsonLine, stdout, stderr, exitCode: result.status };
    }
  } else {
    payload = { parseError: true, stdout, stderr, exitCode: result.status };
  }
  return {
    pass: result.status === 0 && payload.overallPass === true,
    payload,
    stdout,
    stderr,
    exitCode: result.status,
  };
}

function verifyNormativePins(): Record<string, { artifact: string; sha256: string; present: boolean }> {
  const pins: Record<string, { artifact: string; sha256: string; present: boolean }> = {};
  for (const [key, artifact] of Object.entries(NORMATIVE_PINS)) {
    const abs = resolve(OUT, artifact);
    pins[key] = { artifact, sha256: existsSync(abs) ? sha256File(abs) : "MISSING", present: existsSync(abs) };
  }
  return pins;
}

async function main() {
  if (existsSync(PROOF_TARGET)) {
    throw new Error(`FAIL_CLOSED: ${PROOF_TARGET} already exists; create acl-proof-v3 successor for rerun.`);
  }

  const gitHead = runGit(["rev-parse", "HEAD"]);
  const gitBranch = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  const gitRemoteOrigin = spawnSync("git", ["remote", "get-url", "origin"], { cwd: REPO, encoding: "utf8" });
  const { stagingRoot, archiveByteSha256, overlayFileCount } = buildImplementationExecutionTree();
  const stagingTreeRoot = join(stagingRoot, "tree");
  const treeManifest = buildTreeManifest(stagingTreeRoot);
  const authorityInventory = listAuthorityPrivateInventory();
  const containerTargetPaths = [
    ...authorityInventory.existingPrivateRelPaths,
    ...authorityInventory.futureProtectedRelPaths,
  ];
  const authorityHostTests = runAuthorityHostAccessTests(authorityInventory.existingPrivateRelPaths);

  const containerDefaultRole = runContainerProbe({
    stagingTreeRoot,
    relPaths: containerTargetPaths,
    relDirs: authorityInventory.relDirs,
    benchmarkAccessRole: "implementation",
  });
  const containerFakeAuthorityRole = runContainerProbe({
    stagingTreeRoot,
    relPaths: containerTargetPaths,
    relDirs: authorityInventory.relDirs,
    benchmarkAccessRole: "authority",
  });

  if (existsSync(resolve(stagingTreeRoot, "benchmark-authority"))) {
    throw new Error("FAIL_CLOSED: staged implementation tree must not contain benchmark-authority/");
  }

  const checks = [
    { id: "IMPLEMENTATION_TREE_EXCLUDES_BENCHMARK_AUTHORITY", pass: !existsSync(resolve(stagingTreeRoot, "benchmark-authority")) },
    { id: "CONTAINER_RAW_FS_DENY_DEFAULT_ROLE", pass: containerDefaultRole.pass },
    { id: "CONTAINER_RAW_FS_DENY_FAKE_AUTHORITY_ENV", pass: containerFakeAuthorityRole.pass },
    { id: "AUTHORITY_HOST_READ_OK_ALL_PRIVATE_FILES", pass: authorityHostTests.every((t) => t.pass) },
    { id: "NORMATIVE_PINS_PRESENT", pass: Object.values(verifyNormativePins()).every((p) => p.present) },
    {
      id: "GIT_TRACKS_NO_AUTHORITY_PRIVATE",
      pass: runGit(["ls-files", "benchmark-authority"]).length === 0,
    },
  ];
  const overallPass = checks.every((c) => c.pass);

  writeFileSync(
    SPEC_TARGET,
    JSON.stringify(
      {
        version: "phase6a1-professor-plan-separate-authority-checkout-acl-proof-spec-v2",
        authorizedAt: new Date().toISOString(),
        supersedes: "phase6a1-professor-plan-separate-authority-checkout-acl-proof-spec-v1.json",
        purpose:
          "Operational ACL proof using a real implementation execution boundary (Docker container mount) without benchmark-authority private storage.",
        proofArtifact: "phase6a1-professor-plan-separate-authority-checkout-acl-proof-v2.json",
        bundleArtifact: "acl-proof-v2.zip",
        requiredExecutionEnvironment:
          "Catalog verifier v2 and spent pilot MUST run inside the same pinned implementation container mount defined by this proof.",
        instruction: "REPORT AND WAIT for independent ACL v2 review.",
      },
      null,
      2,
    ),
  );

  const proof = {
    version: "phase6a1-professor-plan-separate-authority-checkout-acl-proof-v2",
    generatedAt: new Date().toISOString(),
    decision: overallPass ? "ACL_PROOF_V2_COMPLETED_REPORT_AND_WAIT" : "ACL_PROOF_V2_FAIL_CLOSED",
    supersedes: "phase6a1-professor-plan-separate-authority-checkout-acl-proof-v1.json",
    normativeGate: "PROTOCOL_V9_PILOT_GATE_PRESERVED_V10_PRE_ROSTER_V4_PROTOCOL_PASS",
    aclProofV1Disposition: "ACL_PROOF_BLOCK_NOT_ACTUAL_ACCESS_CONTROL_V1",
    repositoryIdentity: {
      repoRoot: REPO,
      gitHead,
      gitBranch,
      gitRemoteOrigin: (gitRemoteOrigin.stdout ?? "").trim() || null,
      hostPlatform: process.platform,
      nodeVersion: process.version,
      proofScriptByteSha256: sha256File(resolve(HERE, "run-phase6a1-prove-separate-authority-checkout-acl-v2.ts")),
      containerProbeByteSha256: sha256File(PROBE_MJS),
    },
    implementationExecutionBoundary: {
      mechanism: "Docker container with read-only mount of implementation execution tree only",
      containerImage: CONTAINER_IMAGE,
      containerImageDigest: CONTAINER_IMAGE_DIGEST,
      containerRepoRoot: "/implementation",
      benchmarkAuthorityMounted: false,
      usedSoftwareAccessBoundaryHelper: false,
      rawFilesystemApisOnly: ["existsSync", "statSync", "readFileSync", "readdirSync"],
      catalogVerifierV2AndPilotMustUseSameBoundary: true,
      staging: {
        method: "git archive HEAD + overlay copy of web/ workspace (excluding node_modules/.next/.cache)",
        gitArchiveByteSha256: archiveByteSha256,
        overlayFileCount,
        implementationExecutionTreeManifestSha256: treeManifest.treeManifestSha256,
        implementationExecutionTreeFileCount: treeManifest.fileCount,
      },
    },
    authorityExecutionBoundary: {
      mechanism: "Authority host filesystem with benchmark-authority/**/private/ present and readable",
      authorityPrivateFileCount: authorityInventory.existingPrivateRelPaths.length,
      futureProtectedPathCount: authorityInventory.futureProtectedRelPaths.length,
      futureProtectedPaths: authorityInventory.futureProtectedRelPaths,
      authorityPrivateDirectoryCount: authorityInventory.relDirs.length,
    },
    containerDenialTests: {
      defaultRoleEnv: {
        exitCode: containerDefaultRole.exitCode,
        stderr: containerDefaultRole.stderr,
        ...containerDefaultRole.payload,
      },
      fakeAuthorityRoleEnv: {
        exitCode: containerFakeAuthorityRole.exitCode,
        stderr: containerFakeAuthorityRole.stderr,
        ...containerFakeAuthorityRole.payload,
      },
    },
    authorityHostAccessTests: authorityHostTests,
    normativePins: verifyNormativePins(),
    checks,
    overallPass,
    authorizedNextWork: overallPass
      ? [
          "Preserve acl-proof-v2 artifacts and await independent ACL v2 review PASS.",
          "After independent ACL v2 PASS: run catalog verifier v2 inside the pinned implementation container boundary.",
          "After verifier PASS: run spent 5/5 pilot inside the same boundary.",
        ]
      : ["Repair failing checks and create acl-proof-v3 successor."],
    notAuthorized: [
      "catalog verifier v2 (until independent ACL v2 PASS)",
      "spent serialization pilot",
      "pre-roster evidence writers",
      "roster-v3 generation",
      "prospective Professor population",
      "production closure implementation",
    ],
    instruction: "REPORT AND WAIT",
  };

  writeOnceMilestoneArtifact(PROOF_TARGET, proof);
  rmSync(stagingRoot, { recursive: true, force: true });

  console.log(
    JSON.stringify(
      {
        proofPath: PROOF_TARGET,
        proofSha256: sha256File(PROOF_TARGET),
        overallPass,
        failedChecks: checks.filter((c) => !c.pass),
        privateFileCount: authorityInventory.existingPrivateRelPaths.length,
        treeManifestSha256: treeManifest.treeManifestSha256,
      },
      null,
      2,
    ),
  );
  if (!overallPass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
