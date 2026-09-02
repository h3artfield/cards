import {
  loadSemanticMapPoints,
  semanticMapArtifactsAvailable,
} from "../semantic-visualization/artifact-loader";
import type { SemanticMapPoint } from "../semantic-visualization/types";
import type { SemanticBrowseSignals } from "./inventory-rc8-semantic-match";

let cachedBrowseIndex: Map<string, SemanticBrowseSignals> | null = null;

function signalsFromMapPoint(point: SemanticMapPoint): SemanticBrowseSignals {
  return {
    actionTypes: new Set(point.topActions),
    abilityTypes: new Set(point.abilityTypes),
    zones: new Set(point.zones),
    semanticOwners: new Set(point.semanticOwners),
  };
}

/** Precomputed RC8 semantic signals per oracle id — server-side only (uses fs). */
export function loadSemanticBrowseIndex(): Map<string, SemanticBrowseSignals> {
  if (cachedBrowseIndex) return cachedBrowseIndex;
  cachedBrowseIndex = new Map();
  if (!semanticMapArtifactsAvailable()) return cachedBrowseIndex;

  for (const point of loadSemanticMapPoints()) {
    cachedBrowseIndex.set(point.oracleId, signalsFromMapPoint(point));
  }
  return cachedBrowseIndex;
}
