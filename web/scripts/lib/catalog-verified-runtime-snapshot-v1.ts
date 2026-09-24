/**
 * Deterministic identity for a single in-memory DeckResolutionCatalog runtime snapshot.
 */
import { createHash } from "node:crypto";
import type { DeckResolutionCatalog } from "./load-deck-resolution-catalog";

export const CATALOG_VERIFIED_RUNTIME_SNAPSHOT_V1 = "phase6a1-catalog-verified-runtime-snapshot-v1";

function sha256SortedLines(lines: string[]): string {
  return createHash("sha256")
    .update([...lines].sort().join("\n"))
    .digest("hex");
}

export function computeCatalogLegalitiesSnapshotIdentitySha256(catalog: DeckResolutionCatalog): string {
  const lines = [...catalog.byOracleId.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([oracleId, card]) => `${oracleId}:${card.legalities?.commander ?? ""}`);
  return sha256SortedLines(lines);
}

export type VerifiedCatalogSnapshotIdentityV1 = {
  algorithm: typeof CATALOG_VERIFIED_RUNTIME_SNAPSHOT_V1;
  catalogVersion: string;
  fullOracleCardCount: number;
  catalogLegalitiesSnapshotIdentitySha256: string;
};

export function buildVerifiedCatalogSnapshotIdentity(
  catalog: DeckResolutionCatalog,
): VerifiedCatalogSnapshotIdentityV1 {
  return {
    algorithm: CATALOG_VERIFIED_RUNTIME_SNAPSHOT_V1,
    catalogVersion: catalog.catalogVersion,
    fullOracleCardCount: catalog.cardCount,
    catalogLegalitiesSnapshotIdentitySha256: computeCatalogLegalitiesSnapshotIdentitySha256(catalog),
  };
}
