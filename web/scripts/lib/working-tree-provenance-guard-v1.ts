/**
 * Working-tree provenance guards — HARD STOP on dirty parser scope at freeze/execution.
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

/** HARD STOP unless working tree clean and parser scope matches committed bytes. */
export function assertCleanWorkingTreeForParserScope(
  parserScopePaths: readonly string[],
  label: string,
): WorkingTreeGuardResult {
  const repoRoot = execSync("git rev-parse --show-toplevel", { cwd: resolve("."), encoding: "utf8" }).trim();
  const headCommitSha = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
  const statusRaw = execSync("git status --porcelain", { cwd: repoRoot, encoding: "utf8" }).trim();
  const statusLines = statusRaw ? statusRaw.split("\n") : [];

  const dirtyParserScopePaths: string[] = [];
  const dirtyReasons: string[] = [];

  if (statusLines.length > 0) {
    dirtyReasons.push(`${label}: working tree is not clean (${statusLines.length} changed/untracked entries)`);
  }

  for (const scopePath of parserScopePaths) {
    const repoRelative = `web/${scopePath}`.replace(/\\/g, "/");
    const hits = statusLines.filter((line) => {
      const path = line.slice(3).trim().replace(/\\/g, "/");
      return path === repoRelative || path.endsWith(`/${scopePath}`);
    });
    if (hits.length > 0) {
      dirtyParserScopePaths.push(scopePath);
      dirtyReasons.push(`${label}: parser scope path dirty — ${scopePath} (${hits.join("; ")})`);
    }
  }

  const clean = dirtyReasons.length === 0;
  if (!clean) {
    throw new Error(
      `HARD STOP — ${label}\n${dirtyReasons.join("\n")}\n` +
        "Commit or stash all parser-scope changes before candidate freeze or holdout execution.",
    );
  }

  return { clean, repoRoot, headCommitSha, statusLines, dirtyParserScopePaths, dirtyReasons };
}
