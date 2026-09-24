/**
 * Fail-closed pre-roster full catalog verification — separate immutable artifact from pilot-time verification v2.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCatalogVerificationArtifact,
  runCatalogDataStateVerificationCore,
  sha256File,
} from "./lib/verify-pinned-catalog-data-state-v2-core";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const REPO = resolve(HERE, "../..");
const MILESTONES = resolve(REPO, "web/data/milestones/deck-synthesis");
const COMMITMENT_PATH = resolve(MILESTONES, "phase6a1-professor-plan-full-catalog-data-state-commitment-v2.json");
const OUTPUT_PATH = resolve(MILESTONES, "phase6a1-professor-plan-catalog-data-state-verification-pre-roster-v1.json");

async function main(): Promise<void> {
  const core = await runCatalogDataStateVerificationCore({
    repoRoot: REPO,
    commitmentPath: COMMITMENT_PATH,
    verifyPilotCommanders: true,
  });

  const verification = buildCatalogVerificationArtifact({
    phase: "pre_roster",
    version: "phase6a1-professor-plan-catalog-data-state-verification-pre-roster-v1",
    verifierScript: "web/scripts/run-phase6a1-verify-pinned-catalog-data-state-pre-roster-v1.ts",
    verifiedAt: new Date().toISOString(),
    core,
  });

  writeFileSync(OUTPUT_PATH, JSON.stringify(verification, null, 2));
  console.log(JSON.stringify({ outputPath: OUTPUT_PATH, verificationSha256: sha256File(OUTPUT_PATH) }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
