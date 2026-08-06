import { COMMANDER_ELIGIBILITY_VERSION } from "./deck-builder/commander-classification";
import { GOLDEN_CATALOG_VERSION } from "./deck-builder/golden-catalog/version";
import { RULINGS_IMPORTER_VERSION } from "./deck-builder/golden-catalog/rulings-importer-version";

/** Simple clerk pipeline release identifier — bump when pipeline semantics change. */
export const SIMPLE_CLERK_VERSION = "2026-08-06-commander-eligibility-v2-golden-catalog";

/** Golden evaluation suite identifier — bump when case set or grading changes. */
export const EVALUATION_SUITE_VERSION = "115-case-v2-structured-grading";

export type GitTreeState = "clean" | "dirty" | "unknown";

export interface DeploymentIdentity {
  gitCommitSha: string;
  gitTreeState: GitTreeState;
  imageDigest: string;
  cloudBuildId: string;
  buildContextHash: string;
  deployedAt: string;
  simpleClerkVersion: string;
  evaluationSuiteVersion: string;
  goldenCatalogVersion: string;
  commanderEligibilityVersion: string;
  rulingsImporterVersion: string;
  activeRulingsDatasetVersion: string;
}

export function getDeploymentIdentity(): DeploymentIdentity {
  return {
    gitCommitSha: process.env.GIT_COMMIT_SHA?.trim() || "unknown",
    gitTreeState:
      (process.env.GIT_TREE_STATE?.trim() as GitTreeState | undefined) ??
      "unknown",
    imageDigest: process.env.IMAGE_DIGEST?.trim() || "unknown",
    cloudBuildId: process.env.CLOUD_BUILD_ID?.trim() || "unknown",
    buildContextHash: process.env.BUILD_CONTEXT_HASH?.trim() || "unknown",
    deployedAt: process.env.DEPLOYED_AT?.trim() || "unknown",
    simpleClerkVersion:
      process.env.SIMPLE_CLERK_VERSION?.trim() || SIMPLE_CLERK_VERSION,
    evaluationSuiteVersion:
      process.env.EVALUATION_SUITE_VERSION?.trim() ||
      EVALUATION_SUITE_VERSION,
    goldenCatalogVersion:
      process.env.GOLDEN_CATALOG_VERSION?.trim() || GOLDEN_CATALOG_VERSION,
    commanderEligibilityVersion:
      process.env.COMMANDER_ELIGIBILITY_VERSION?.trim() ||
      COMMANDER_ELIGIBILITY_VERSION,
    rulingsImporterVersion:
      process.env.RULINGS_IMPORTER_VERSION?.trim() || RULINGS_IMPORTER_VERSION,
    activeRulingsDatasetVersion:
      process.env.ACTIVE_RULINGS_DATASET_VERSION?.trim() || "unknown",
  };
}
