/**
 * Single-snapshot pre-roster catalog verification + eligibility capture (no Firestore reload).
 */
import {
  COMMANDER_ELIGIBILITY_STATE_ROOT_V2,
  computeCommanderEligibilityStateRootsV2,
} from "./catalog-commander-eligibility-state-root-v2";
import { loadExposedBenchmarkOracleIdsFailClosed } from "./load-exposed-benchmark-oracle-ids-v2";
import type { DeckResolutionCatalog } from "./load-deck-resolution-catalog";
import {
  loadSingleVerifiedDeckResolutionCatalogSnapshot,
  runCatalogDataStateVerificationCoreV2,
  type CatalogVerificationCoreResultV2,
} from "./verify-pinned-catalog-data-state-v2-core-v2";

export type PreRosterSingleSnapshotCapture = {
  catalog: DeckResolutionCatalog;
  catalogVerificationCore: CatalogVerificationCoreResultV2;
  eligibilityStateRoots: ReturnType<typeof computeCommanderEligibilityStateRootsV2>["roots"];
};

export async function capturePreRosterSingleCatalogSnapshot(input: {
  repoRoot: string;
  commitmentPath: string;
  verifyPilotCommanders?: boolean;
}): Promise<PreRosterSingleSnapshotCapture> {
  const catalog = await loadSingleVerifiedDeckResolutionCatalogSnapshot();
  const catalogVerificationCore = await runCatalogDataStateVerificationCoreV2({
    repoRoot: input.repoRoot,
    commitmentPath: input.commitmentPath,
    catalog,
    verifyPilotCommanders: input.verifyPilotCommanders ?? true,
  });
  const exposed = loadExposedBenchmarkOracleIdsFailClosed(catalog);
  const { roots: eligibilityStateRoots } = computeCommanderEligibilityStateRootsV2(catalog, exposed);
  return { catalog, catalogVerificationCore, eligibilityStateRoots };
}

export function assertMatchingVerifiedCatalogSnapshotIdentity(
  expected: CatalogVerificationCoreResultV2["verifiedCatalogSnapshotIdentity"],
  actual: CatalogVerificationCoreResultV2["verifiedCatalogSnapshotIdentity"],
): void {
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error("FAIL_CLOSED: verified catalog snapshot identity mismatch between bound artifacts");
  }
}

export { COMMANDER_ELIGIBILITY_STATE_ROOT_V2 };
