/**
 * Working-tree provenance guards — HARD STOP on dirty repository at freeze/execution.
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type WorkingTreeGuardResult = {
  clean: boolean;
  repoRoot: string;
  headCommitSha: string;
  statusLines: string[];
  dirtyParserScopePaths: string[];
  dirtyReasons: string[];
};

export type RepositoryGuardResult = {
  clean: boolean;
  repoRoot: string;
  headCommitSha: string;
  statusLines: string[];
  dirtyReasons: string[];
};

export function computeParserBlobClosureFromDisk(
  parserScopePaths: readonly string[],
  sha256File: (path: string) => string,
): string {
  return createHash("sha256")
    .update(parserScopePaths.map((p) => sha256File(p)).join("\n"))
    .digest("hex");
}

export function sha256FileFromDisk(path: string): string {
  return createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
}

/** HARD STOP unless entire repository working tree is clean (official holdout requirement). */
export function assertCleanRepositoryForHoldoutExecution(label: string): RepositoryGuardResult {
  const repoRoot = execSync("git rev-parse --show-toplevel", { cwd: resolve("."), encoding: "utf8" }).trim();
  const headCommitSha = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
  const statusRaw = execSync("git status --porcelain", { cwd: repoRoot, encoding: "utf8" }).trim();
  const statusLines = statusRaw ? statusRaw.split("\n") : [];
  const dirtyReasons: string[] = [];

  if (statusLines.length > 0) {
    dirtyReasons.push(
      `${label}: repository is not clean (${statusLines.length} changed/untracked/staged entries) — ` +
        "official holdout execution requires empty git status --porcelain",
    );
  }

  const stagedRaw = execSync("git diff --cached --name-only", { cwd: repoRoot, encoding: "utf8" }).trim();
  if (stagedRaw.length > 0) {
    dirtyReasons.push(`${label}: staged files present (${stagedRaw.split("\n").length})`);
  }

  const clean = dirtyReasons.length === 0;
  if (!clean) {
    throw new Error(
      `HARD STOP — ${label}\n${dirtyReasons.join("\n")}\n` +
        "Use a fresh clean worktree/checkout at the frozen candidate commit before holdout execution.",
    );
  }

  return { clean, repoRoot, headCommitSha, statusLines, dirtyReasons };
}

/** @deprecated Prefer assertCleanRepositoryForHoldoutExecution for holdouts. */
export function assertCleanWorkingTreeForParserScope(
  parserScopePaths: readonly string[],
  label: string,
): WorkingTreeGuardResult {
  const repository = assertCleanRepositoryForHoldoutExecution(label);
  return {
    clean: repository.clean,
    repoRoot: repository.repoRoot,
    headCommitSha: repository.headCommitSha,
    statusLines: repository.statusLines,
    dirtyParserScopePaths: [],
    dirtyReasons: repository.dirtyReasons,
  };
}
