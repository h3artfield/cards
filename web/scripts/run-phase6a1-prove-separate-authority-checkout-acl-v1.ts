#!/usr/bin/env npx tsx
/** Operational ACL / separate-authority-checkout proof for prospective benchmark environment. */
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  AUTHORITY_PRIVATE_GITIGNORE_PATTERN,
  PROTECTED_AUTHORITY_PRIVATE_REL_PATHS,
  assertImplementationCannotReadAuthorityPrivate,
  readFileWithBenchmarkAccessBoundary,
} from "./lib/phase6a1-benchmark-access-boundary-v1";
import { writeOnceMilestoneArtifact } from "./lib/write-once-milestone-artifact-v2";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const OUT = resolve(REPO, "web/data/milestones/deck-synthesis");
const WEB_SCRIPTS = resolve(REPO, "web/scripts");
const MILESTONES = OUT;
const PROOF_TARGET = resolve(OUT, "phase6a1-professor-plan-separate-authority-checkout-acl-proof-v1.json");
const SPEC_TARGET = resolve(OUT, "phase6a1-professor-plan-separate-authority-checkout-acl-proof-spec-v1.json");
const GENERATED_AT = new Date().toISOString();

const NORMATIVE_PINS = {
  pipelineFreezeSpecV13: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v13.json",
  accessBoundaryEvidencePipelineV2: "phase6a1-benchmark-authority-access-boundary-evidence-pipeline-v2.json",
  selectionPolicyV3: "phase6a1-professor-plan-prospective-commander-selection-policy-v3.json",
  architectureSealedManifestV10PreRosterV4:
    "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v10-pre-roster-v4.json",
  architectureReauditV10PreRosterV4:
    "phase6a1-professor-plan-benchmark-architecture-v10-pre-roster-v4-independent-reaudit-gpt56sol-v1.json",
};

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sha256Bytes(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function runGit(args: string[]): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync("git", args, { cwd: REPO, encoding: "utf8" });
  return {
    ok: result.status === 0,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
  };
}

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTsFiles(abs));
    else if (entry.name.endsWith(".ts")) out.push(abs);
  }
  return out;
}

type AccessTest = {
  id: string;
  relPath: string;
  role: "implementation" | "authority";
  expected: "DENY" | "ALLOW";
  mechanism: string;
  pass: boolean;
  observed: string;
};

function extractGitArchiveToTemp(): string {
  const tempRoot = mkdtempSync(join(tmpdir(), "phase6a1-impl-checkout-"));
  const tarPath = join(tempRoot, "repo.tar");
  const extractDir = join(tempRoot, "extract");
  const archive = spawnSync("git", ["-C", REPO, "archive", "--format=tar", "-o", tarPath, "HEAD"], {
    encoding: "utf8",
  });
  if (archive.status !== 0) {
    throw new Error(`git archive failed: ${archive.stderr || archive.stdout}`);
  }
  const mkdir = spawnSync("mkdir", [extractDir], { shell: true, encoding: "utf8" });
  if (mkdir.status !== 0) throw new Error(`mkdir failed: ${mkdir.stderr || mkdir.stdout}`);
  const untar = spawnSync("tar", ["-xf", tarPath, "-C", extractDir], { encoding: "utf8" });
  if (untar.status !== 0) throw new Error(`tar extract failed: ${untar.stderr || untar.stdout}`);
  return extractDir;
}

function runImplementationCloneDenialTests(cloneRoot: string): AccessTest[] {
  const tests: AccessTest[] = [];
  for (const relPath of PROTECTED_AUTHORITY_PRIVATE_REL_PATHS) {
    const absPath = resolve(cloneRoot, relPath);
    const exists = existsSync(absPath);
    let observed = exists ? "FILE_PRESENT" : "ENOENT";
    let pass = !exists;
    if (exists) {
      try {
        readFileSync(absPath);
        observed = "READ_SUCCEEDED";
        pass = false;
      } catch (err) {
        observed = (err as NodeJS.ErrnoException).code ?? String(err);
        pass = observed === "ENOENT" || observed === "EACCES";
      }
    }
    tests.push({
      id: `IMPLEMENTATION_CLONE_${relPath.replace(/[^\w]+/g, "_")}`,
      relPath,
      role: "implementation",
      expected: "DENY",
      mechanism: "git archive HEAD clone simulation — authority-private paths must be absent",
      pass,
      observed,
    });
  }
  return tests;
}

function runImplementationBoundaryDenialTests(): AccessTest[] {
  const tests: AccessTest[] = [];
  for (const relPath of PROTECTED_AUTHORITY_PRIVATE_REL_PATHS) {
    const absPath = resolve(REPO, relPath);
    let pass = false;
    let observed = "READ_SUCCEEDED";
    try {
      assertImplementationCannotReadAuthorityPrivate(absPath);
      if (existsSync(absPath)) {
        readFileWithBenchmarkAccessBoundary(REPO, relPath, "implementation");
        observed = "READ_SUCCEEDED";
      } else {
        observed = "BOUNDARY_FAIL_CLOSED_BEFORE_READ";
        pass = true;
      }
    } catch (err) {
      observed = String((err as Error).message).slice(0, 240);
      pass = observed.includes("FAIL_CLOSED");
    }
    tests.push({
      id: `IMPLEMENTATION_BOUNDARY_${relPath.replace(/[^\w]+/g, "_")}`,
      relPath,
      role: "implementation",
      expected: "DENY",
      mechanism: "phase6a1-benchmark-access-boundary-v1 fail-closed guard",
      pass,
      observed,
    });
  }
  return tests;
}

function runAuthorityAccessSuccessTests(): AccessTest[] {
  const tests: AccessTest[] = [];
  for (const relPath of PROTECTED_AUTHORITY_PRIVATE_REL_PATHS) {
    const absPath = resolve(REPO, relPath);
    let pass = false;
    let observed = "MISSING";
    try {
      const bytes = readFileWithBenchmarkAccessBoundary(REPO, relPath, "authority");
      observed = `READ_OK sha256=${sha256Bytes(bytes)} size=${bytes.length}`;
      pass = true;
    } catch (err) {
      observed = String((err as Error).message).slice(0, 240);
      pass = false;
    }
    tests.push({
      id: `AUTHORITY_${relPath.replace(/[^\w]+/g, "_")}`,
      relPath,
      role: "authority",
      expected: "ALLOW",
      mechanism: "authority checkout/private storage on operational benchmark host",
      pass,
      observed,
    });
  }
  return tests;
}

const IMPORT_SCAN_ALLOWLIST = new Set([
  "lib/phase6a1-benchmark-access-boundary-v1.ts",
  "run-phase6a1-prove-separate-authority-checkout-acl-v1.ts",
  "run-phase6a1-closure-semantic-benchmark-leakage-test-v6.ts",
  "run-phase6a1-closure-semantic-benchmark-leakage-test-v7.ts",
  "run-phase6a1-closure-semantic-benchmark-leakage-test-v8.ts",
]);

function scanWebScriptsForAuthorityImports(): { pass: boolean; findings: string[] } {
  const findings: string[] = [];
  const runtimeImportPattern =
    /from\s+['"][^'"]*benchmark-authority|import\s*\(\s*['"][^'"]*benchmark-authority|require\s*\(\s*['"][^'"]*benchmark-authority/;
  for (const abs of listTsFiles(WEB_SCRIPTS)) {
    const rel = relative(WEB_SCRIPTS, abs).replace(/\\/g, "/");
    if (IMPORT_SCAN_ALLOWLIST.has(rel)) continue;
    const src = readFileSync(abs, "utf8");
    if (runtimeImportPattern.test(src)) {
      findings.push(`${rel}: runtime import/require from benchmark-authority`);
    }
  }
  return { pass: findings.length === 0, findings };
}

function scanImplementationVisibleSecrets(): { pass: boolean; findings: string[] } {
  const findings: string[] = [];
  const prospectivePublicArtifacts = [
    NORMATIVE_PINS.selectionPolicyV3,
    NORMATIVE_PINS.pipelineFreezeSpecV13,
    NORMATIVE_PINS.accessBoundaryEvidencePipelineV2,
    NORMATIVE_PINS.architectureSealedManifestV10PreRosterV4,
    NORMATIVE_PINS.architectureReauditV10PreRosterV4,
    "phase6a1-professor-plan-prospective-commander-roster-commitment-v1-spec.json",
    "phase6a1-exposed-benchmark-identities-manifest-v2.json",
    "phase6a1-professor-plan-catalog-data-state-verification-spec-v2.json",
    "phase6a1-professor-plan-serialization-pilot-spec-v4.json",
  ];

  const policyV3Path = resolve(MILESTONES, NORMATIVE_PINS.selectionPolicyV3);
  const policyV3 = JSON.parse(readFileSync(policyV3Path, "utf8")) as Record<string, unknown>;
  if ("selectionSeed" in policyV3 && policyV3.selectionSeed !== "PENDING_AUTHORITY_GENERATION_AFTER_ACL_PROOF") {
    findings.push("selection-policy-v3 publishes a live selectionSeed");
  }
  if (policyV3.privateRosterByteSha256 !== "PENDING_AUTHORITY_GENERATION_AFTER_ACL_PROOF") {
    findings.push("selection-policy-v3 publishes a live private roster byte SHA before roster generation");
  }

  for (const artifact of prospectivePublicArtifacts) {
    const abs = resolve(MILESTONES, artifact);
    if (!existsSync(abs)) continue;
    const raw = readFileSync(abs, "utf8");
    if (/"(primary|alternate)Commander"\s*:\s*"/.test(raw)) {
      findings.push(`${artifact}: contains commander identity fields`);
    }
    if (/holdout-v[78]-adjudication-decisions/.test(raw) && !artifact.includes("access-boundary")) {
      findings.push(`${artifact}: references authority adjudication decision bytes`);
    }
    if (
      /blinded-adjudication-sealed-v[78]/.test(raw) &&
      !artifact.includes("sealed-manifest") &&
      !artifact.includes("access-boundary") &&
      !artifact.includes("reaudit")
    ) {
      findings.push(`${artifact}: references blinded adjudication artifact outside SHA-only manifest context`);
    }
  }

  const archBundleManifest = resolve(MILESTONES, "phase6a1-professor-plan-audit-bundle-archv10-pre-roster-v4-manifest.json");
  if (existsSync(archBundleManifest)) {
    const manifest = JSON.parse(readFileSync(archBundleManifest, "utf8")) as {
      entries?: Array<{ zipPath?: string }>;
    };
    for (const entry of manifest.entries ?? []) {
      const zipPath = entry.zipPath ?? "";
      if (zipPath.includes("benchmark-authority/") && zipPath.includes("/private/")) {
        findings.push(`archv10-pre-roster-v4 manifest includes authority-private path ${zipPath}`);
      }
    }
  }

  return { pass: findings.length === 0, findings };
}

function collectGitBoundaryEvidence() {
  const trackedAuthority = runGit(["ls-files", "benchmark-authority"]);
  const ignoreChecks = PROTECTED_AUTHORITY_PRIVATE_REL_PATHS.map((relPath) => {
    const check = runGit(["check-ignore", "-v", relPath]);
    return { relPath, ignored: check.ok, rule: check.stdout || check.stderr };
  });
  const gitignore = readFileSync(resolve(REPO, ".gitignore"), "utf8");
  return {
    gitHead: runGit(["rev-parse", "HEAD"]).stdout,
    gitBranch: runGit(["rev-parse", "--abbrev-ref", "HEAD"]).stdout,
    gitRemoteOrigin: runGit(["remote", "get-url", "origin"]).stdout || null,
    implementationStatusPorcelain: runGit([
      "status",
      "--porcelain",
      "--",
      "web/data/milestones/deck-synthesis",
      "web/scripts",
    ]).stdout,
    trackedAuthorityPaths: trackedAuthority.stdout ? trackedAuthority.stdout.split("\n") : [],
    trackedAuthorityPathCount: trackedAuthority.stdout ? trackedAuthority.stdout.split("\n").filter(Boolean).length : 0,
    gitignoreContainsAuthorityPrivatePattern: gitignore.includes(AUTHORITY_PRIVATE_GITIGNORE_PATTERN),
    protectedPathIgnoreRules: ignoreChecks,
  };
}

function verifyNormativePins(): Record<string, { artifact: string; sha256: string; present: boolean }> {
  const pins: Record<string, { artifact: string; sha256: string; present: boolean }> = {};
  for (const [key, artifact] of Object.entries(NORMATIVE_PINS)) {
    const abs = resolve(MILESTONES, artifact);
    pins[key] = {
      artifact,
      sha256: existsSync(abs) ? sha256File(abs) : "MISSING",
      present: existsSync(abs),
    };
  }
  return pins;
}

async function main() {
  if (existsSync(PROOF_TARGET)) {
    throw new Error(
      `FAIL_CLOSED: ACL proof artifact already exists at ${PROOF_TARGET}. Create a versioned successor for legitimate rerun.`,
    );
  }

  const cloneRoot = extractGitArchiveToTemp();
  const cloneArchiveByteSha256 = sha256File(join(dirname(cloneRoot), "repo.tar"));
  const implementationCloneTests = runImplementationCloneDenialTests(cloneRoot);
  rmSync(dirname(cloneRoot), { recursive: true, force: true });

  const implementationBoundaryTests = runImplementationBoundaryDenialTests();
  const authorityAccessTests = runAuthorityAccessSuccessTests();
  const importScan = scanWebScriptsForAuthorityImports();
  const secretScan = scanImplementationVisibleSecrets();
  const gitEvidence = collectGitBoundaryEvidence();
  const normativePins = verifyNormativePins();

  const checkoutSeparation = {
    implementationCheckoutRoot: "web/",
    authorityCheckoutRoot: "benchmark-authority/",
    samePhysicalHost: true,
    separationMechanisms: [
      "gitignored authority-private storage outside tracked implementation clone",
      "git archive HEAD clone simulation representing implementation developer checkout",
      "phase6a1-benchmark-access-boundary-v1 fail-closed guard for implementation operational role",
      "web/scripts static import scan — no benchmark-authority/private imports",
    ],
    implementationCloneSimulation: {
      method: "git archive HEAD -> tar extract temp directory",
      archiveByteSha256: cloneArchiveByteSha256,
      gitHead: gitEvidence.gitHead,
    },
  };

  const allTests = [...implementationCloneTests, ...implementationBoundaryTests, ...authorityAccessTests];
  const failedTests = allTests.filter((t) => !t.pass);
  const checks = [
    { id: "GIT_TRACKS_NO_AUTHORITY_PRIVATE", pass: gitEvidence.trackedAuthorityPathCount === 0 },
    { id: "GITIGNORE_AUTHORITY_PRIVATE", pass: gitEvidence.gitignoreContainsAuthorityPrivatePattern },
    { id: "ALL_PROTECTED_PATHS_GITIGNORED", pass: gitEvidence.protectedPathIgnoreRules.every((r) => r.ignored) },
    { id: "NO_WEB_TO_AUTHORITY_IMPORTS", pass: importScan.pass },
    { id: "IMPLEMENTATION_VISIBLE_SECRET_SCAN", pass: secretScan.pass },
    { id: "NORMATIVE_PINS_PRESENT", pass: Object.values(normativePins).every((p) => p.present) },
    { id: "IMPLEMENTATION_CLONE_DENIAL_TESTS", pass: implementationCloneTests.every((t) => t.pass) },
    { id: "IMPLEMENTATION_BOUNDARY_DENIAL_TESTS", pass: implementationBoundaryTests.every((t) => t.pass) },
    { id: "AUTHORITY_ACCESS_SUCCESS_TESTS", pass: authorityAccessTests.every((t) => t.pass) },
  ];
  const overallPass = checks.every((c) => c.pass) && failedTests.length === 0;

  const proofScriptSha256 = sha256File(resolve(WEB_SCRIPTS, "run-phase6a1-prove-separate-authority-checkout-acl-v1.ts"));
  const boundaryLibSha256 = sha256File(resolve(WEB_SCRIPTS, "lib/phase6a1-benchmark-access-boundary-v1.ts"));

  writeFileSync(
    SPEC_TARGET,
    JSON.stringify(
      {
        version: "phase6a1-professor-plan-separate-authority-checkout-acl-proof-spec-v1",
        authorizedAt: GENERATED_AT,
        purpose:
          "Operational proof that implementation and authority checkouts are separated and authority-private benchmark material is inaccessible to implementation operational role.",
        extendsAccessBoundaryEvidencePipeline: NORMATIVE_PINS.accessBoundaryEvidencePipelineV2,
        proofArtifact: "phase6a1-professor-plan-separate-authority-checkout-acl-proof-v1.json",
        proofScript: "web/scripts/run-phase6a1-prove-separate-authority-checkout-acl-v1.ts",
        boundaryLib: "web/scripts/lib/phase6a1-benchmark-access-boundary-v1.ts",
        bundleArtifact: "acl-proof-v1.zip",
        writeOnceRequired: true,
        instruction: "REPORT AND WAIT for independent ACL review before catalog verifier v2 or pilot.",
      },
      null,
      2,
    ),
  );

  const proof = {
    version: "phase6a1-professor-plan-separate-authority-checkout-acl-proof-v1",
    generatedAt: GENERATED_AT,
    decision: overallPass ? "ACL_PROOF_COMPLETED_REPORT_AND_WAIT" : "ACL_PROOF_FAIL_CLOSED",
    normativeGate: "PROTOCOL_V9_PILOT_GATE_PRESERVED_V10_PRE_ROSTER_V4_PROTOCOL_PASS",
    repositoryIdentity: {
      repoRoot: REPO,
      gitHead: gitEvidence.gitHead,
      gitBranch: gitEvidence.gitBranch,
      gitRemoteOrigin: gitEvidence.gitRemoteOrigin,
      hostPlatform: process.platform,
      nodeVersion: process.version,
      proofScriptByteSha256: proofScriptSha256,
      boundaryLibByteSha256: boundaryLibSha256,
    },
    checkoutSeparation,
    gitBoundaryEvidence: gitEvidence,
    accessTests: allTests,
    staticImportScan: importScan,
    implementationVisibleSecretScan: secretScan,
    normativePins,
    checks,
    overallPass,
    authorizedNextWork: overallPass
      ? [
          "Preserve ACL proof artifacts and await independent ACL review PASS.",
          "After independent ACL PASS: execute catalog verifier v2.",
          "After catalog verifier v2 PASS: execute spent 5/5 single-stack pilot.",
          "Do not automatically run pre-roster evidence writers after pilot.",
        ]
      : ["Repair failing ACL checks and create acl-proof-v2 successor; do not run catalog verifier v2 or pilot."],
    notAuthorized: [
      "catalog verifier v2 (until independent ACL PASS)",
      "spent serialization pilot (until ACL PASS and catalog verifier v2 PASS)",
      "pre-roster evidence writers (until post-pilot explicit authorization)",
      "roster-v3 generation",
      "prospective Professor population",
      "production closure implementation",
    ],
    instruction: "REPORT AND WAIT",
  };

  writeOnceMilestoneArtifact(PROOF_TARGET, proof);

  console.log(
    JSON.stringify(
      {
        proofPath: PROOF_TARGET,
        proofSha256: sha256File(PROOF_TARGET),
        specPath: SPEC_TARGET,
        specSha256: sha256File(SPEC_TARGET),
        overallPass,
        failedChecks: checks.filter((c) => !c.pass),
        failedTests: failedTests.map((t) => ({ id: t.id, observed: t.observed })),
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
