/**
 * Fail-closed pre-roster full catalog verification v3 — single catalog load, atomic write-once artifact.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeOnceMilestoneArtifact } from "./lib/write-once-milestone-artifact-v2";
import {
  buildCatalogVerificationArtifactV2,
  loadSingleVerifiedDeckResolutionCatalogSnapshot,
  runCatalogDataStateVerificationCoreV2,
  sha256File,
} from "./lib/verify-pinned-catalog-data-state-v2-core-v2";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const REPO = resolve(HERE, "../..");
const MILESTONES = resolve(REPO, "web/data/milestones/deck-synthesis");
const COMMITMENT_PATH = resolve(MILESTONES, "phase6a1-professor-plan-full-catalog-data-state-commitment-v2.json");
const OUTPUT_PATH = resolve(MILESTONES, "phase6a1-professor-plan-catalog-data-state-verification-pre-roster-v1.json");

async function main(): Promise<void> {
  const catalog = await loadSingleVerifiedDeckResolutionCatalogSnapshot();
  const core = await runCatalogDataStateVerificationCoreV2({
    repoRoot: REPO,
    commitmentPath: COMMITMENT_PATH,
    catalog,
    verifyPilotCommanders: true,
  });

  const verification = buildCatalogVerificationArtifactV2({
    phase: "pre_roster",
    version: "phase6a1-professor-plan-catalog-data-state-verification-pre-roster-v1",
    verifierScript: "web/scripts/run-phase6a1-verify-pinned-catalog-data-state-pre-roster-v3.ts",
    verifiedAt: new Date().toISOString(),
    core,
  });

  writeOnceMilestoneArtifact(OUTPUT_PATH, verification);
  console.log(JSON.stringify({ outputPath: OUTPUT_PATH, verificationSha256: sha256File(OUTPUT_PATH) }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
