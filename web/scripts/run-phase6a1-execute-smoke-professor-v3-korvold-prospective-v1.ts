#!/usr/bin/env npx tsx
/** Korvold prospective Professor v3 smoke runner v1 — live NO_MODEL auth; full executable stack when separately authorized. */
import { loadProjectEnvLocal } from "./lib/script-env";
import { PROFESSOR_V3_LIVE_EXECUTION_AUTHORIZATION } from "./lib/phase6a1-professor-v3-smoke-execution-authorization-live-root-v1";
import { runProfessorV3KorvoldProspectiveSmokeExecutionV1 } from "./lib/phase6a1-professor-v3-korvold-prospective-smoke-execution-v1";

loadProjectEnvLocal();

async function main() {
  const result = await runProfessorV3KorvoldProspectiveSmokeExecutionV1({
    authorization: PROFESSOR_V3_LIVE_EXECUTION_AUTHORIZATION,
    executeSwitchPresent: process.argv.includes("--execute"),
  });

  if (result.blocked) {
    console.log(JSON.stringify(result.blockedArtifact, null, 2));
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        version: "phase6a1-professor-v3-smoke-korvold-prospective-executed-v1",
        generatedAt: new Date().toISOString(),
        decision: result.authorization.decision,
        reachedStage: result.reachedStage,
        executionStage: result.executionStage,
        caseStatus: result.orchestration?.caseStatus ?? null,
        note: "Live runner uses binding-repair NO_MODEL authorization and remains blocked until candidate auth is independently wired.",
      },
      null,
      2,
    ),
  );

  if (result.orchestration?.caseStatus !== "SUCCESS") process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
