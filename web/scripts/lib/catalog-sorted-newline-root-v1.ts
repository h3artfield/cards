/**
 * Normative deterministic catalog content roots (phase6a1-catalog-sorted-newline-root-v1).
 * Verifier v2 and full-catalog-data-state-commitment-v2 MUST use this algorithm exactly.
 */
import { createHash } from "node:crypto";

export const CATALOG_SORTED_NEWLINE_ROOT_V1 = "phase6a1-catalog-sorted-newline-root-v1";

export type LedgerIdentityRow = {
  oracleId: string;
  oracleTextHash: string;
  cardStructureHash: string;
};

export type CatalogCanonicalRootsV1 = {
  oracleIdSetSha256: string;
  oracleIdOracleTextHashRootSha256: string;
  oracleIdCardStructureHashRootSha256: string;
};

function sha256SortedLines(lines: string[]): string {
  return createHash("sha256")
    .update([...lines].sort().join("\n"))
    .digest("hex");
}

export function computeCatalogCanonicalRootsFromLedger(rows: LedgerIdentityRow[]): CatalogCanonicalRootsV1 {
  const oracleIdSetSha256 = sha256SortedLines(rows.map((r) => r.oracleId));
  const oracleIdOracleTextHashRootSha256 = sha256SortedLines(
    rows.map((r) => `${r.oracleId}:${r.oracleTextHash}`),
  );
  const oracleIdCardStructureHashRootSha256 = sha256SortedLines(
    rows.map((r) => `${r.oracleId}:${r.cardStructureHash}`),
  );
  return {
    oracleIdSetSha256,
    oracleIdOracleTextHashRootSha256,
    oracleIdCardStructureHashRootSha256,
  };
}

export function computeCatalogCanonicalRootsFromRuntime(
  rows: Array<{ oracleId: string; oracleTextHash: string; cardStructureHash: string }>,
): CatalogCanonicalRootsV1 {
  return computeCatalogCanonicalRootsFromLedger(rows);
}
