#!/usr/bin/env npx tsx
/** Full Professor vs Dumb Professor blind A/B v1 — Meren (first supported commander from authorized order). */
import { loadProjectEnvLocal } from "./lib/script-env";
import { runProfessorV3FullVsDumbAbV1 } from "./lib/phase6a1-professor-v3-full-vs-dumb-ab-v1";

loadProjectEnvLocal();

async function main() {
  const execute = process.argv.includes("--execute");
  const result = await runProfessorV3FullVsDumbAbV1({ execute });
  console.log(JSON.stringify(result.reportForUser, null, 2));
  if (!execute) process.exit(0);
  if (result.executed && result.totalModelCallsUsed === undefined) process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
