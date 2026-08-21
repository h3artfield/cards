/**
 * Ordered local milestone runner. No deploy, no push, no Firestore writes, no OpenAI.
 * Run: cd web && npx tsx scripts/mechanical-space/run-milestone-v1.ts
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { assertMechanicalSpaceReadOnly } from "../../src/lib/mechanical-space/safety";

assertMechanicalSpaceReadOnly("run-milestone-v1");

function run(label: string, command: string, args: string[]): void {
  console.error(`\n=== ${label} ===`);
  const result = spawnSync(command, args, { stdio: "inherit", cwd: resolve(process.cwd()), shell: process.platform === "win32" });
  if (result.status !== 0) {
    throw new Error(`${label} failed with status ${result.status}`);
  }
}

function main() {
  run("0 selftest", "npx", ["--yes", "tsx", "src/lib/mechanical-space/mechanical-space.selftest.ts"]);
  run("1 snapshot", "npx", ["--yes", "tsx", "scripts/mechanical-space/extract-semantic-oracle-snapshot-v1.ts"]);
  run("2 spellbook sample", "npx", ["--yes", "tsx", "scripts/mechanical-space/fetch-spellbook-research-sample-v1.ts"]);
  run("3 identity", "npx", ["--yes", "tsx", "scripts/mechanical-space/run-identity-mapping-v1.ts"]);
  run("4/5 parity", "npx", ["--yes", "tsx", "scripts/mechanical-space/run-graph-parity-v1.ts"]);
  run("6 supervision", "npx", ["--yes", "tsx", "scripts/mechanical-space/build-supervision-dataset-v1.ts"]);
  run("7-9 python ml", "python", ["scripts/mechanical-space/python/train_experiments.py"]);
  run("10 reconstruction", "npx", ["--yes", "tsx", "scripts/mechanical-space/run-holdout-reconstruction-v1.ts"]);
  run("11 candidates", "npx", ["--yes", "tsx", "scripts/mechanical-space/run-candidate-generation-v1.ts"]);
  console.error("\nMilestone local phases complete. UI: http://localhost:3000/experimental/mechanical-space");
}

main();
