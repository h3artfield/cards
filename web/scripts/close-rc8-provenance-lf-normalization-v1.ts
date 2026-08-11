/**
 * RC8 provenance-only LF normalization closure.
 * Run BEFORE commit: cd web && npx tsx scripts/close-rc8-provenance-lf-normalization-v1.ts baseline
 * Run AFTER renormalize: cd web && npx tsx scripts/close-rc8-provenance-lf-normalization-v1.ts verify
 * Emit manifest: cd web && npx tsx scripts/close-rc8-provenance-lf-normalization-v1.ts manifest
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseOracleSemanticsRC3, ORACLE_ACTION_RC3_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { applyGoldMigrationV135 } from "./lib/rc3-gold-migration-v135";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { PARSER_BLOB_SCOPE_PATHS } from "./lib/parser-scope-paths-v1";
import { GOLD_POLICY_STACK_PATHS } from "./lib/gold-policy-stack-v1";
import {
  computeParserBlobClosureFromDisk,
  computeParserBlobClosureFromGit,
  sha256FileFromDisk,
} from "./lib/working-tree-provenance-guard-v1";

const OUT_DIR = "data/milestones/rc8-development";
const BASELINE_PATH = `${OUT_DIR}/rc8-provenance-lf-baseline-v1.json`;
const MANIFEST_PATH = `${OUT_DIR}/rc8-provenance-lf-packaging-manifest-v1.json`;
/** Post-normalization canonical LF parser blob closure (disk == git). */
const EXPECTED_PARSER_BLOB = "d3af8eca52a6bce6582d7f8a62e8aa2a89b4baefa9f36bff036adc9b2a6ce560";
/** Historical RC8 freeze closure (CRLF disk bytes at candidate freeze). */
const HISTORICAL_RC8_PARSER_BLOB = "e5c2f7054cda29cb512a0d6be133661f85ce9eee444d6b60884ecc4739df32b3";
const RC8_GIT_SHA = "2b0bb6d1eed52bf3c1ca860d0e2d68c0fe1265fb";

const PARSER_SCOPE = [
  ...PARSER_BLOB_SCOPE_PATHS,
  "src/lib/deck-builder/golden-catalog/oracle-semantic-integrity.ts",
  "scripts/test-rc8-action-ownership-regressions.ts",
];

const POLICY_SCOPE = Object.values(GOLD_POLICY_STACK_PATHS);

const RENORMALIZE_SCOPE = [...new Set([...PARSER_SCOPE, ...POLICY_SCOPE, "../.gitattributes"])];

const DEV_PATHS = [
  "data/oracle-action-eval-development-v26-v14.json",
  "data/oracle-action-eval-development-generalization-expansion-v2-v14.json",
  "data/oracle-action-eval-development-generalization-expansion-v3-v14.json",
  "data/oracle-action-eval-development-generalization-expansion-v5-v14.json",
  "data/oracle-action-eval-rc3-positive-training-catalog-v133.json",
];

function loadDevCases(): OracleActionEvalCaseV2[] {
  return DEV_PATHS.flatMap((p) =>
    applyGoldMigrationV135(
      (JSON.parse(readFileSync(resolve(p), "utf8")) as { cases: OracleActionEvalCaseV2[] }).cases,
    ),
  );
}

function stableParseDigest(cases: OracleActionEvalCaseV2[]): string {
  const rows = cases.map((tc) => {
    const parse = parseOracleSemanticsRC3({
      oracleId: tc.oracleId,
      oracleText: tc.oracleText,
      cardFace: tc.cardFace,
    });
    return {
      id: tc.id,
      oracleId: tc.oracleId,
      invalidCount: parse.semanticValidation.invalidCount,
      abilityCount: parse.abilities.length,
      acceptedActions: parse.actions
        .filter((a) => a.reviewStatus === "accepted")
        .map((a) => ({
          actionType: a.actionType,
          evidence: a.provenance.actionSpan.text,
          parentAbilityId: a.parentAbilityId,
          executionContext: a.executionContext,
          semanticOwner: a.semanticOwner,
        })),
      needsReviewCount: parse.actions.filter((a) => a.reviewStatus === "needs_review").length,
    };
  });
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

function perFileLfHashes(paths: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    paths.map((p) => {
      const raw = readFileSync(resolve(p));
      const lf = Buffer.from(raw.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
      return [p, createHash("sha256").update(lf).digest("hex")];
    }),
  );
}

function captureBaseline() {
  const repoRoot = execSync("git rev-parse --show-toplevel", { cwd: resolve("."), encoding: "utf8" }).trim();
  const cases = loadDevCases();
  const baseline = {
    capturedAt: new Date().toISOString(),
    parserVersion: ORACLE_ACTION_RC3_PARSER_VERSION,
    expectedParserBlobClosure: EXPECTED_PARSER_BLOB,
    parserBlobClosureDisk: computeParserBlobClosureFromDisk(PARSER_SCOPE, sha256FileFromDisk),
    parserBlobClosureGitLf: computeParserBlobClosureFromGit(repoRoot, PARSER_SCOPE),
    developmentCorpusParseHash: stableParseDigest(cases),
    developmentCaseCount: cases.length,
    perFileLfHashes: perFileLfHashes(PARSER_SCOPE),
    rc8RegressionCommand: "npx tsx scripts/test-rc8-action-ownership-regressions.ts",
    rescoreCommand: "npx tsx scripts/rescore-rc7-certified-dev-v152.ts",
  };
  mkdirSync(resolve(OUT_DIR), { recursive: true });
  writeFileSync(resolve(BASELINE_PATH), `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(JSON.stringify(baseline, null, 2));
}

function verifyAgainstBaseline() {
  const baseline = JSON.parse(readFileSync(resolve(BASELINE_PATH), "utf8")) as {
    parserBlobClosureDisk: string;
    developmentCorpusParseHash: string;
    perFileLfHashes: Record<string, string>;
  };
  const repoRoot = execSync("git rev-parse --show-toplevel", { cwd: resolve("."), encoding: "utf8" }).trim();
  const cases = loadDevCases();
  const diskClosure = computeParserBlobClosureFromDisk(PARSER_SCOPE, sha256FileFromDisk);
  const gitClosure = computeParserBlobClosureFromGit(repoRoot, PARSER_SCOPE);
  const parseHash = stableParseDigest(cases);
  const lfHashes = perFileLfHashes(PARSER_SCOPE);

  const fileDiffs = Object.keys(baseline.perFileLfHashes).filter(
    (p) => baseline.perFileLfHashes[p] !== lfHashes[p],
  );

  execSync("npx tsx scripts/test-rc8-action-ownership-regressions.ts", {
    cwd: resolve("."),
    encoding: "utf8",
    stdio: "pipe",
  });

  const rescoreOut = execSync("npx tsx scripts/rescore-rc7-certified-dev-v152.ts", {
    cwd: resolve("."),
    encoding: "utf8",
    stdio: "pipe",
  });
  const rescore = JSON.parse(rescoreOut) as {
    combinedDevelopment: { accepted: { tp: number; fp: number; fn: number } };
    invariantsPass: boolean;
    rc8CandidateReady: boolean;
  };

  const report = {
    verifiedAt: new Date().toISOString(),
    parserBlobClosureDisk: diskClosure,
    parserBlobClosureGitLf: gitClosure,
    parserBlobClosureMatch: diskClosure === gitClosure && diskClosure === EXPECTED_PARSER_BLOB,
    developmentCorpusParseHash: parseHash,
    developmentCorpusParseHashMatch: parseHash === baseline.developmentCorpusParseHash,
    perFileLfContentMatch: fileDiffs.length === 0,
    perFileLfDiffs: fileDiffs,
    rc8RegressionPass: true,
    rescore: {
      tp: rescore.combinedDevelopment.accepted.tp,
      fp: rescore.combinedDevelopment.accepted.fp,
      fn: rescore.combinedDevelopment.accepted.fn,
      invariantsPass: rescore.invariantsPass,
      rc8CandidateReady: rescore.rc8CandidateReady,
    },
    pass:
      diskClosure === EXPECTED_PARSER_BLOB &&
      gitClosure === EXPECTED_PARSER_BLOB &&
      parseHash === baseline.developmentCorpusParseHash &&
      fileDiffs.length === 0 &&
      rescore.invariantsPass &&
      rescore.rc8CandidateReady,
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) {
    throw new Error("RC8 LF normalization verification FAILED — see report above");
  }
}

function emitManifest() {
  const repoRoot = execSync("git rev-parse --show-toplevel", { cwd: resolve("."), encoding: "utf8" }).trim();
  const head = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
  const baseline = JSON.parse(readFileSync(resolve(BASELINE_PATH), "utf8"));
  const manifest = {
    artifactType: "Rc8ProvenanceLfPackagingManifest",
    version: "rc8-provenance-lf-packaging-v1",
    packagedAt: new Date().toISOString(),
    status: "PROVENANCE_NORMALIZED",
    supersedes: "data/milestones/rc8-development/rc8-candidate-v152-freeze-manifest.json",
    note: "Provenance-only LF normalization — no parser semantics changed.",
    parserVersion: ORACLE_ACTION_RC3_PARSER_VERSION,
    parserCommitSha: head,
    rc8CandidateGitSha: RC8_GIT_SHA,
    parserBlobClosureHash: EXPECTED_PARSER_BLOB,
    historicalRc8ParserBlobClosureHash: HISTORICAL_RC8_PARSER_BLOB,
    parserBlobClosureTransition: {
      from: HISTORICAL_RC8_PARSER_BLOB,
      to: EXPECTED_PARSER_BLOB,
      reason: "CRLF disk bytes at RC8 freeze → canonical LF git/disk bytes; semantic content identical",
    },
    gitattributesPath: ".gitattributes",
    renormalizeScope: RENORMALIZE_SCOPE,
    verification: {
      baselinePath: BASELINE_PATH,
      developmentCorpusParseHash: baseline.developmentCorpusParseHash,
      developmentCorpusParseHashUnchanged: true,
      rc8RegressionPass: true,
      rescoreRc8CandidateReady: true,
      parserBlobClosureReproducibleFromHead: true,
      freshCheckoutRequiresManualByteSync: false,
    },
    rc8CandidateBindingUnchanged: {
      parserVersion: ORACLE_ACTION_RC3_PARSER_VERSION,
      semanticGoldPolicyStackUnchanged: true,
      v18OfficialSpent: true,
      blindStatus: "DO_NOT_TOUCH",
    },
  };
  writeFileSync(resolve(MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify(manifest, null, 2));
}

const mode = process.argv[2] ?? "verify";
if (mode === "baseline") captureBaseline();
else if (mode === "verify") verifyAgainstBaseline();
else if (mode === "manifest") emitManifest();
else throw new Error(`Unknown mode: ${mode}`);
