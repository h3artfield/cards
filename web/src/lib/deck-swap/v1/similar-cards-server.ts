/**
 * "Find cards that do the same job as this one."
 *
 * Reads the precomputed RC8 semantic neighbors (top-20 per card, cosine over
 * the 117-d feature vector) and enriches them with the map's structured tags.
 * No embedding call and no live index — the similarity was computed offline
 * when the semantic map was built.
 */
import {
  getSemanticMapPoint,
  loadSemanticMapNeighbors,
} from "@/lib/semantic-visualization/artifact-loader";
import { isLandType, primaryTypeOf } from "./upgrade-candidates-server";
import type { SwapCandidate } from "./types";

export async function findSimilarCards(args: {
  oracleId: string;
  limit?: number;
}): Promise<SwapCandidate[]> {
  const neighbors = await loadSemanticMapNeighbors();
  const rows = neighbors.get(args.oracleId) ?? [];
  const limit = args.limit ?? 20;

  const candidates: SwapCandidate[] = [];
  for (const row of rows) {
    const point = getSemanticMapPoint(row.oracleId);
    if (!point) continue;
    candidates.push({
      oracleId: point.oracleId,
      name: point.name,
      colorIdentity: point.colorIdentity,
      manaValue: point.manaValue,
      typeLine: point.typeLine,
      primaryType: primaryTypeOf(point.types),
      isLand: isLandType(point.types),
      derivedRoles: point.derivedRoles,
      source: "semantic_neighbor",
      semanticDistance: row.distance,
    });
    if (candidates.length >= limit) break;
  }
  return candidates;
}

/** Structured roles for the card being replaced, used to report what a swap preserves. */
export function rolesForOracleId(oracleId: string): string[] {
  return getSemanticMapPoint(oracleId)?.derivedRoles ?? [];
}
