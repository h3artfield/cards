/**
 * Standalone container probe — raw Node fs only. No benchmark access-boundary helper.
 * Reads target paths from /probe/paths.json; repo root is /implementation.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = "/implementation";
const PATHS_FILE = "/probe/paths.json";

function attemptRawRead(relPath) {
  const absPath = resolve(REPO_ROOT, relPath);
  try {
    if (!existsSync(absPath)) {
      return { relPath, operation: "existsSync", pass: true, observed: "ENOENT" };
    }
    const st = statSync(absPath);
    if (st.isDirectory()) {
      const entries = readdirSync(absPath);
      return {
        relPath,
        operation: "readdirSync",
        pass: false,
        observed: `DIRECTORY_LISTED entryCount=${entries.length}`,
      };
    }
    const bytes = readFileSync(absPath);
    return {
      relPath,
      operation: "readFileSync",
      pass: false,
      observed: `READ_SUCCEEDED size=${bytes.length}`,
    };
  } catch (err) {
    const code = (err).code ?? "ERROR";
    const pass = code === "ENOENT" || code === "EACCES" || code === "EPERM";
    return {
      relPath,
      operation: "raw_fs",
      pass,
      observed: code,
    };
  }
}

const config = JSON.parse(readFileSync(PATHS_FILE, "utf8"));
const role = process.env.PHASE6A1_BENCHMARK_ACCESS_ROLE ?? "implementation";
const results = [];
for (const relPath of config.relPaths) {
  results.push(attemptRawRead(relPath));
}
for (const relDir of config.relDirs ?? []) {
  results.push(attemptRawRead(relDir));
}

const overallPass = results.every((r) => r.pass);
console.log(
  JSON.stringify({
    version: "phase6a1-acl-implementation-container-probe-v1",
    containerRepoRoot: REPO_ROOT,
    benchmarkAccessRoleEnv: role,
    hostPlatform: process.platform,
    nodeVersion: process.version,
    usedAccessBoundaryHelper: false,
    overallPass,
    results,
  }),
);
process.exit(overallPass ? 0 : 1);
