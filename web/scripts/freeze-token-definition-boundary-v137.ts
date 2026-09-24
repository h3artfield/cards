/**
 * Immutable parser checkpoint for token-definition-boundary (pre-Z1b baseline).
 * Run: npx tsx scripts/freeze-token-definition-boundary-v137.ts
 */
import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { loadAllGoldMigrationsV135 } from "./lib/rc3-gold-migration-v135";

const PARSER_VERSION = "oracle-action-v1.37-rc3-token-definition-boundary";
const TAG = "oracle-action-v1.37-rc3-token-definition-boundary";
const PARENT_CHECKPOINT = "oracle-action-v1.37-rc3-granted-nested-complete";
const PARENT_SHA = "c446b6baa1648b7d8d922631b9f6d996b5edc39e";
const FREEZE_COMMIT = "7050c75abbf19a5db3174ec4c295431666bb1821";

function fileHashAtCommit(gitRoot: string, repoPath: string, commit: string): string {
  try {
    const content = execSync(`git show ${commit}:${repoPath}`, { cwd: gitRoot, encoding: "utf8" });
    return createHash("sha256").update(content).digest("hex");
  } catch {
    return "missing_at_commit";
  }
}

function main() {
  const gitRoot = execSync("git rev-parse --show-toplevel", { cwd: resolve("."), encoding: "utf8" }).trim();
  const commit = execSync("git rev-parse HEAD", { cwd: gitRoot, encoding: "utf8" }).trim();
  const cleanTree = execSync("git status --porcelain", { cwd: gitRoot, encoding: "utf8" }).trim();

  const parserPaths = {
    transform: "web/src/lib/deck-builder/golden-catalog/oracle-rc3-transform.ts",
    clauseNative: "web/src/lib/deck-builder/golden-catalog/oracle-rc3-clause-native.ts",
    contextRouter: "web/src/lib/deck-builder/golden-catalog/oracle-rc3-semantic-context-router.ts",
    tokenGlossary: "web/src/lib/deck-builder/golden-catalog/oracle-rc3-token-glossary.ts",
    grantedSpanDetector: "web/src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-span-detector.ts",
    semanticBuilder: "web/src/lib/deck-builder/golden-catalog/oracle-semantic-parse-builder.ts",
    actionBuilder: "web/src/lib/deck-builder/golden-catalog/oracle-rc3-action-builder.ts",
    unifiedMatcher: "web/scripts/oracle-action-unified-matcher.ts",
    semanticMatcher: "web/scripts/oracle-action-semantic-matcher.ts",
    scoringScope: "web/scripts/lib/rc3-case-scope-scoring.ts",
  };

  const blobs = Object.fromEntries(
    Object.entries(parserPaths).map(([key, path]) => [key, fileHashAtCommit(gitRoot, path, FREEZE_COMMIT)]),
  );

  const freeze = {
    generatedAt: new Date().toISOString(),
    checkpoint: "token-definition-boundary-v137-pre-z1b",
    parserVersion: PARSER_VERSION,
    parserCommitSha: FREEZE_COMMIT,
    parentCheckpoint: PARENT_CHECKPOINT,
    parentCommitSha: PARENT_SHA,
    tag: TAG,
    note: "Six-FP token-definition boundary repair — immutable baseline before look-reveal-put Z1b.",
    cleanTreeAtFreeze: cleanTree.length === 0,
    cleanTreeStatus: cleanTree || "clean",
    blobs,
    policyOverlayHash: createHash("sha256").update(JSON.stringify(loadAllGoldMigrationsV135())).digest("hex"),
    fpClosure: {
      removedByTokenDefinitionBoundary: 6,
      remainingDeferredFps: ["dev-v9-018", "dev-exp-v1-012"],
    },
  };

  mkdirSync(resolve("data/milestones/rc3-development"), { recursive: true });
  writeFileSync(
    resolve("data/milestones/rc3-development/token-definition-boundary-v137-parser-freeze.json"),
    `${JSON.stringify(freeze, null, 2)}\n`,
  );
  console.log(JSON.stringify(freeze, null, 2));
}

main();
