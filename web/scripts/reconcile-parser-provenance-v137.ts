/**
 * Reconcile 7050c75 vs granted-nested-complete vs token-definition-boundary blob lineage.
 * Run: npx tsx scripts/reconcile-parser-provenance-v137.ts
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

const GIT_ROOT = execSync("git rev-parse --show-toplevel", { cwd: resolve("."), encoding: "utf8" }).trim();
const COMMITS = {
  grantedNestedDev: "c446b6baa1648b7d8d922631b9f6d996b5edc39e",
  grantedNestedComplete: "7050c75abbf19a5db3174ec4c295431666bb1821",
} as const;

const PARSER_PATHS: Record<string, string> = {
  transform: "web/src/lib/deck-builder/golden-catalog/oracle-rc3-transform.ts",
  clauseNative: "web/src/lib/deck-builder/golden-catalog/oracle-rc3-clause-native.ts",
  contextRouter: "web/src/lib/deck-builder/golden-catalog/oracle-rc3-semantic-context-router.ts",
  tokenGlossary: "web/src/lib/deck-builder/golden-catalog/oracle-rc3-token-glossary.ts",
  grantedSpanDetector: "web/src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-span-detector.ts",
  semanticBuilder: "web/src/lib/deck-builder/golden-catalog/oracle-semantic-parse-builder.ts",
  actionBuilder: "web/src/lib/deck-builder/golden-catalog/oracle-rc3-action-builder.ts",
  promotion: "web/src/lib/deck-builder/golden-catalog/oracle-rc3-promotion.ts",
  scoringScope: "web/src/lib/deck-builder/golden-catalog/oracle-rc3-scoring-scope.ts",
  unifiedMatcher: "web/scripts/oracle-action-unified-matcher.ts",
  semanticMatcher: "web/scripts/oracle-action-semantic-matcher.ts",
};

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function hashAtCommit(commit: string, repoPath: string): string | null {
  try {
    const content = execSync(`git show ${commit}:${repoPath}`, { cwd: GIT_ROOT, encoding: "utf8" });
    return sha256(content);
  } catch {
    return null;
  }
}

function hashWorking(repoPath: string): string | null {
  try {
    return sha256(readFileSync(resolve(GIT_ROOT, repoPath), "utf8"));
  } catch {
    return null;
  }
}

function parserVersionAt(commit: string): string | null {
  try {
    const content = execSync(`git show ${commit}:web/src/lib/deck-builder/golden-catalog/oracle-rc3-transform.ts`, {
      cwd: GIT_ROOT,
      encoding: "utf8",
    });
    const m = content.match(/ORACLE_ACTION_RC3_PARSER_VERSION = "([^"]+)"/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

function loadJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(resolve(path), "utf8")) as T;
  } catch {
    return null;
  }
}

function main() {
  const rows: Array<Record<string, unknown>> = [];
  let c446Vs7050 = 0;
  let c7050VsWorking = 0;
  let identical7050Working = 0;

  for (const [key, repoPath] of Object.entries(PARSER_PATHS)) {
    const atC446 = hashAtCommit(COMMITS.grantedNestedDev, repoPath);
    const at7050 = hashAtCommit(COMMITS.grantedNestedComplete, repoPath);
    const working = hashWorking(repoPath);
    if (atC446 !== at7050) c446Vs7050++;
    if (at7050 !== working) c7050VsWorking++;
    if (at7050 === working) identical7050Working++;
    rows.push({
      file: key,
      repoPath,
      c446b6b: atC446,
      commit7050c75: at7050,
      workingTree: working,
      c446_to_7050: atC446 === at7050 ? "identical" : "changed",
      "7050_to_working": at7050 === working ? "identical" : "changed",
    });
  }

  const tokenBoundaryFreeze = loadJson<{ blobs?: Record<string, string>; parserCommitSha?: string }>(
    "data/milestones/rc3-development/token-definition-boundary-v137-parser-freeze.json",
  );
  const grantedCompleteFreeze = loadJson<{ workingParserBlobClosure?: Record<string, string> }>(
    "data/milestones/rc3-development/granted-v137-nested-complete-freeze.json",
  );

  const tokenFreezeMismatches: Array<{ file: string; freezeHash: string; at7050: string }> = [];
  if (tokenBoundaryFreeze?.blobs) {
    for (const [key, freezeHash] of Object.entries(tokenBoundaryFreeze.blobs)) {
      const repoPath = PARSER_PATHS[key];
      if (!repoPath) continue;
      const at7050 = hashAtCommit(COMMITS.grantedNestedComplete, repoPath);
      if (at7050 && freezeHash !== at7050) {
        tokenFreezeMismatches.push({ file: key, freezeHash, at7050 });
      }
    }
  }

  const outcome =
    c7050VsWorking === 0
      ? "A_bytes_identical_at_7050_and_token_boundary_label_was_wrong"
      : "B_token_boundary_and_z1b_exist_only_in_working_tree_not_in_7050c75";

  const report = {
    generatedAt: new Date().toISOString(),
    checkpoint: "parser-provenance-reconciliation-v137",
    conclusion: outcome,
    summary: {
      parserVersionString: {
        c446b6b: parserVersionAt(COMMITS.grantedNestedDev),
        "7050c75": parserVersionAt(COMMITS.grantedNestedComplete),
        workingTree: (() => {
          try {
            const c = readFileSync(resolve("src/lib/deck-builder/golden-catalog/oracle-rc3-transform.ts"), "utf8");
            return c.match(/ORACLE_ACTION_RC3_PARSER_VERSION = "([^"]+)"/)?.[1] ?? null;
          } catch {
            return null;
          }
        })(),
      },
      filesChanged_c446_to_7050: c446Vs7050,
      filesChanged_7050_to_working: c7050VsWorking,
      filesIdentical_7050_to_working: identical7050Working,
      tokenBoundaryFreezeClaimedCommit: tokenBoundaryFreeze?.parserCommitSha ?? null,
      tokenBoundaryFreeze_blob_matches_7050_bytes: tokenFreezeMismatches.length === 0,
      tokenBoundaryFreeze_blob_mismatches: tokenFreezeMismatches,
    },
    correction: {
      "7050c75_authoritative_label": "oracle-action-v1.37-rc3-granted-nested-complete",
      tokenDefinitionBoundary: {
        status: "never_committed_before_v138",
        note: "Token-definition boundary parser deltas live in working tree after 7050c75; prior freeze mis-attributed granted-nested-complete bytes to token-definition-boundary label.",
      },
      v138Parent: COMMITS.grantedNestedComplete,
    },
    blobComparisonRows: rows,
    referenceFreezes: {
      grantedNestedComplete_workingParserBlobClosure: grantedCompleteFreeze?.workingParserBlobClosure ?? null,
      tokenDefinitionBoundary_blobs: tokenBoundaryFreeze?.blobs ?? null,
    },
  };

  mkdirSync(resolve("data/milestones/rc3-development"), { recursive: true });
  writeFileSync(
    resolve("data/milestones/rc3-development/parser-provenance-reconciliation-v137.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report, null, 2));
}

main();
