/**
 * Audit TP→FN flips between parent commit c446b6b (v1.36) and current v1.37 parser.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { loadEnvLocal } from "./lib/script-env";

loadEnvLocal();

const PARENT = "c446b6baa1648b7d8d922631b9f6d996b5edc39e";
const gitRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
const worktree = resolve(gitRoot, "../cards-parent-audit");

function setupWorktree() {
  try {
    execSync(`git worktree remove --force "${worktree}"`, { cwd: gitRoot, stdio: "pipe" });
  } catch {
    /* absent */
  }
  execSync(`git worktree add "${worktree}" ${PARENT}`, { cwd: gitRoot, stdio: "inherit" });
  const glossaryStub = `export function isInsideTokenGlossaryRegion(_paragraph: string, _localStart: number, _localEnd: number): boolean { return false; }\n`;
  writeFileSync(
    resolve(worktree, "web/src/lib/deck-builder/golden-catalog/oracle-rc3-token-glossary.ts"),
    glossaryStub,
  );
  const metaPath = resolve(worktree, "web/src/lib/deck-builder/golden-catalog/oracle-rc3-extraction-metadata.ts");
  let meta = readFileSync(metaPath, "utf8");
  if (!meta.includes("tagTokenDefinitionContext")) {
    meta = `${meta.trimEnd()}\n\nexport function tagTokenDefinitionContext<T extends RC3ActionExtensions>(input: {\n  action: T;\n  grantingClauseId: string;\n  grantedAbilityId: string;\n  grantedTo?: string;\n}): T {\n  return {\n    ...input.action,\n    extractionSource: input.action.extractionSource ?? "rc3_clause_native",\n    executionContext: "granted_ability",\n    grantingClauseId: input.grantingClauseId,\n    grantedAbilityId: input.grantedAbilityId,\n    grantedTo: input.grantedTo,\n  };\n}\n`;
    writeFileSync(metaPath, meta);
  }
  execSync(
    `copy /Y "${resolve("scripts/emit-action-match-ledger.ts")}" "${resolve(worktree, "web/scripts/emit-action-match-ledger.ts")}"`,
    { shell: "cmd.exe" },
  );
  if (existsSync(resolve(".env.local"))) {
    execSync(`copy /Y "${resolve(".env.local")}" "${resolve(worktree, "web/.env.local")}"`, { shell: "cmd.exe" });
  }
}

function main() {
  setupWorktree();
  const out = "data/milestones/rc3-development/action-match-ledger-parent-c446b6b.json";
  execSync(`npx --yes tsx scripts/emit-action-match-ledger.ts ${out}`, {
    cwd: resolve(worktree, "web"),
    encoding: "utf8",
    stdio: "inherit",
  });
  mkdirSync(resolve("data/milestones/rc3-development"), { recursive: true });
  writeFileSync(
    resolve(out),
    readFileSync(resolve(worktree, "web", out)),
  );
  const parent = JSON.parse(readFileSync(resolve(out), "utf8"));
  const current = JSON.parse(
    readFileSync(resolve("data/milestones/rc3-development/action-match-ledger-current-v137.json"), "utf8"),
  );
  const parentByKey = new Map(
    parent.rows.map((r: { caseId: string; actionType: string; evidenceContains: string; matched: boolean }) => [
      `${r.caseId}|${r.actionType}|${r.evidenceContains}`,
      r,
    ]),
  );
  const flips = current.rows.filter((cur: { caseId: string; actionType: string; evidenceContains: string; matched: boolean }) => {
    const key = `${cur.caseId}|${cur.actionType}|${cur.evidenceContains}`;
    const prev = parentByKey.get(key);
    return prev?.matched && !cur.matched;
  });
  const report = {
    generatedAt: new Date().toISOString(),
    parentMetrics: parent.metrics,
    currentMetrics: current.metrics,
    expectedFlipCount: 4,
    observedFlipCount: flips.length,
    flips,
  };
  writeFileSync(
    resolve("data/milestones/rc3-development/optionality-tp-to-fn-audit-v137.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report, null, 2));
  execSync(`git worktree remove --force "${worktree}"`, { cwd: gitRoot, stdio: "pipe" });
}

main();
