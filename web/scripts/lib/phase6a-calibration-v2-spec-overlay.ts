/**
 * Phase 6A — RetrievalSpecificationCorrection overlay (Phase 6).
 * Does NOT mutate frozen Phase-5 discovery artifacts.
 */
import type { RetrievalSpecification } from "../../src/lib/deck-synthesis/archetype-discovery-types-v1";
import type { UpstreamSpecClassification } from "./phase6a-calibration-v2-types";

export const RETRIEVAL_SPEC_CORRECTION_OVERLAY_VERSION = "phase6-retrieval-spec-correction-overlay-v1";

export type RetrievalSpecificationCorrectionOverlayEntry = {
  caseId: string;
  commanders: string[];
  frozenPhase5RetrievalSpecification: RetrievalSpecification;
  conflictConstraint: string;
  automatedClassification: UpstreamSpecClassification;
  overlayStatus: "PENDING_INDEPENDENT_REVIEW";
  proposedCorrection: null;
  note: "Genuine corrections require independent adjudication — overlay is not applied to Phase-5 artifacts.";
};

export function buildSpecCorrectionOverlayEntries(
  entries: Array<{
    caseId: string;
    commanders: string[];
    spec: RetrievalSpecification;
    rawConstraint: string;
    classification: UpstreamSpecClassification;
  }>,
): RetrievalSpecificationCorrectionOverlayEntry[] {
  return entries
    .filter((e) => e.rawConstraint.includes("minimize_controller_noncreature_spells"))
    .map((e) => ({
      caseId: e.caseId,
      commanders: e.commanders,
      frozenPhase5RetrievalSpecification: e.spec,
      conflictConstraint: e.rawConstraint,
      automatedClassification: e.classification,
      overlayStatus: "PENDING_INDEPENDENT_REVIEW" as const,
      proposedCorrection: null,
      note: "Genuine corrections require independent adjudication — overlay is not applied to Phase-5 artifacts.",
    }));
}
