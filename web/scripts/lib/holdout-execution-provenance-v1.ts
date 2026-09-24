/**
 * Generic holdout execution provenance — full repository clean + candidate manifest binding.
 * All validation holdout runners must call assertHoldoutExecutionEnvironment() first.
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertHoldoutNotSpent } from "./holdout-execution-registry-v1";
import {
  assertCleanRepositoryForHoldoutExecution,
  sha256FileFromDisk,
  type RepositoryGuardResult,
} from "./working-tree-provenance-guard-v1";

export type CandidateManifest = {
  manifestContentHash: string;
  status: string;
  parserVersion: string;
  parserCommitSha: string;
  parserScopePaths: string[];
  parserBlobClosureHash: string;
  evaluators: Record<string, string>;
  goldPolicy?: { stackCompositeHash: string };
};

export type EvaluatorCheck = {
  expected: string;
  actual: string;
  match: boolean;
  path: string;
};

export type HoldoutExecutionProvenance = {
  repository: RepositoryGuardResult;
  headCommitSha: string;
  manifest: CandidateManifest;
  manifestPath: string;
  manifestContentHashActual: string;
  parserBlobClosureActual: string;
  parserScopeUnchangedSinceCandidate: boolean;
  evaluatorChecks: Record<string, EvaluatorCheck>;
  evaluatorsMatch: boolean;
};

const EVALUATOR_PATHS: Record<string, string> = {
  semanticMatcher: "scripts/oracle-action-semantic-matcher.ts",
  unifiedMatcher: "scripts/oracle-action-unified-matcher.ts",
  goldPolicyValidator: "scripts/lib/gold-policy-validator-v1.ts",
  rc5RegressionScoring: "scripts/lib/rc5-regression-scoring-v1.ts",
  reminderDerivedLeakage: "scripts/lib/reminder-derived-leakage-v1.ts",
};

function sha256File(path: string): string {
  return sha256FileFromDisk(path);
}

function computeManifestContentHash(manifestRaw: CandidateManifest & Record<string, unknown>): string {
  const { manifestContentHash: _ignored, developmentGoldHash: _dev, ...manifestBody } = manifestRaw;
  return createHash("sha256").update(`${JSON.stringify(manifestBody, null, 2)}\n`).digest("hex");
}

function parserScopeDiffSinceCommit(repoRoot: string, parserScopePaths: readonly string[], baseCommit: string): string {
  const relPaths = parserScopePaths.map((p) => `web/${p}`.replace(/\\/g, "/")).join(" ");
  try {
    return execSync(`git diff --name-only ${baseCommit} HEAD -- ${relPaths}`, {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
  } catch {
    return "DIFF_ERROR";
  }
}

/** HARD STOP unless repository is fully clean and candidate manifest bindings match disk. */
export function assertHoldoutExecutionEnvironment(input: {
  label: string;
  candidateManifestPath: string;
  expectedManifestContentHash?: string;
  expectedParserBlobClosureHash?: string;
  requireCandidateFrozen?: boolean;
  benchmarkHash?: string;
  benchmarkPath?: string;
}): HoldoutExecutionProvenance {
  const repository = assertCleanRepositoryForHoldoutExecution(input.label);

  if (input.benchmarkHash) {
    assertHoldoutNotSpent({ benchmarkHash: input.benchmarkHash, label: input.label });
  }
  const manifestRaw = JSON.parse(readFileSync(resolve(input.candidateManifestPath), "utf8")) as CandidateManifest;
  const manifestContentHashActual = computeManifestContentHash(
    manifestRaw as CandidateManifest & Record<string, unknown>,
  );

  const reasons: string[] = [];

  if (input.requireCandidateFrozen !== false && manifestRaw.status !== "CANDIDATE_FROZEN") {
    reasons.push(`${input.label}: candidate status=${manifestRaw.status} (expected CANDIDATE_FROZEN)`);
  }

  if (
    input.expectedManifestContentHash &&
    manifestContentHashActual !== input.expectedManifestContentHash
  ) {
    reasons.push(
      `${input.label}: manifestContentHash expected=${input.expectedManifestContentHash} actual=${manifestContentHashActual}`,
    );
  }

  if (manifestContentHashActual !== manifestRaw.manifestContentHash) {
    reasons.push(
      `${input.label}: manifest file hash mismatch embedded=${manifestRaw.manifestContentHash} computed=${manifestContentHashActual}`,
    );
  }

  const parserScopeChecks = manifestRaw.parserScopePaths.map((relPath) => ({
    path: relPath,
    actual: sha256File(relPath),
  }));
  const parserBlobClosureActual = createHash("sha256")
    .update(parserScopeChecks.map((c) => c.actual).join("\n"))
    .digest("hex");

  if (
    input.expectedParserBlobClosureHash &&
    parserBlobClosureActual !== input.expectedParserBlobClosureHash
  ) {
    reasons.push(
      `${input.label}: parserBlobClosure expected=${input.expectedParserBlobClosureHash} actual=${parserBlobClosureActual}`,
    );
  }

  if (parserBlobClosureActual !== manifestRaw.parserBlobClosureHash) {
    reasons.push(
      `${input.label}: parserBlobClosure manifest=${manifestRaw.parserBlobClosureHash} actual=${parserBlobClosureActual}`,
    );
  }

  const scopeDiff = parserScopeDiffSinceCommit(
    repository.repoRoot,
    manifestRaw.parserScopePaths,
    manifestRaw.parserCommitSha,
  );
  const parserScopeUnchangedSinceCandidate = scopeDiff.length === 0;
  if (!parserScopeUnchangedSinceCandidate) {
    reasons.push(
      `${input.label}: parser scope changed since candidate commit ${manifestRaw.parserCommitSha}: ${scopeDiff}`,
    );
  }

  const evaluatorChecks = Object.fromEntries(
    Object.entries(manifestRaw.evaluators).map(([key, expected]) => {
      const path = EVALUATOR_PATHS[key] ?? "";
      const actual = path ? sha256File(path) : "UNKNOWN";
      return [key, { expected, actual, match: actual === expected, path }];
    }),
  ) as Record<string, EvaluatorCheck>;

  if (!Object.values(evaluatorChecks).every((c) => c.match)) {
    reasons.push(`${input.label}: evaluator closure mismatch`);
  }

  if (reasons.length > 0) {
    throw new Error(`HARD STOP — ${input.label}\n${reasons.join("\n")}`);
  }

  return {
    repository,
    headCommitSha: repository.headCommitSha,
    manifest: manifestRaw,
    manifestPath: input.candidateManifestPath,
    manifestContentHashActual,
    parserBlobClosureActual,
    parserScopeUnchangedSinceCandidate,
    evaluatorChecks,
    evaluatorsMatch: true,
  };
}

export function verifyEvaluatorClosure(manifest: CandidateManifest): Record<string, EvaluatorCheck> {
  return Object.fromEntries(
    Object.entries(manifest.evaluators).map(([key, expected]) => {
      const path = EVALUATOR_PATHS[key] ?? "";
      const actual = path ? sha256File(path) : "UNKNOWN";
      return [key, { expected, actual, match: actual === expected, path }];
    }),
  ) as Record<string, EvaluatorCheck>;
}
