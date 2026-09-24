#!/usr/bin/env npx tsx
/**
 * Phase 6A.1 P11 — Generate blinded RetrievalSpecificationCorrection adjudication artifact.
 * No retrieval scores, ranks, or candidate-performance metrics.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { loadShadowSemanticIndex } from "../src/lib/commander-strategy/shadow-semantic-index";
import { ARCHETYPE_DISCOVERY_BENCHMARK_V1 } from "../src/lib/deck-synthesis/archetype-discovery-benchmark-v1";
import { ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5 } from "../src/lib/deck-synthesis/archetype-discovery-blind-holdout-v5";
import {
  buildGlobalCatalogSemanticIndex,
  discoverArchetypes,
  resolveBenchmarkCommanderOracleIds,
} from "../src/lib/deck-synthesis";
import {
  PHASE6A1_UPSTREAM_SPEC_CONFLICTS,
  RETRIEVAL_SPEC_CORRECTION_OVERLAY_V1_1_VERSION,
} from "./lib/phase6a1-spec-correction-overlay-v1.1";
import type { RetrievalSpecification } from "../src/lib/deck-synthesis/archetype-discovery-types-v1";

loadProjectEnvLocal();

const OUT_PATH = resolve("data/milestones/deck-synthesis/phase6a1-p11-spec-correction-adjudication-blinded-v1.json");

const ALL_CASES = [...ARCHETYPE_DISCOVERY_BENCHMARK_V1, ...ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5];

function commandZoneOracleTexts(
  catalog: Awaited<ReturnType<typeof loadDeckResolutionCatalog>>,
  commanderOracleIds: string[],
  commanderNames: string[],
) {
  return commanderOracleIds.map((id, idx) => ({
    name: catalog.byOracleId.get(id)?.canonicalName ?? commanderNames[idx] ?? id,
    oracleText: catalog.byOracleId.get(id)?.oracleText ?? "",
  }));
}

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const shadowIndex = await loadShadowSemanticIndex();
  const globalIndex = buildGlobalCatalogSemanticIndex({ catalog, shadowIndex });

  const entries: Array<Record<string, unknown>> = [];

  for (const overlay of PHASE6A1_UPSTREAM_SPEC_CONFLICTS) {
    const benchCase = ALL_CASES.find((c) => c.id === overlay.caseId);
    if (!benchCase) {
      throw new Error(`Case not found: ${overlay.caseId}`);
    }

    const resolution = resolveBenchmarkCommanderOracleIds(catalog, benchCase.commanders);
    if (!resolution.resolved) {
      throw new Error(`Could not resolve commanders for ${overlay.caseId}`);
    }

    const report = discoverArchetypes(
      { commanderOracleIds: resolution.oracleIds, bracket: benchCase.bracket },
      { catalog, shadowIndex, globalCatalogIndex: globalIndex },
    );
    const primary = report.buildDirections.find((d) => d.rank === 1);
    if (!primary) {
      throw new Error(`No primary direction for ${overlay.caseId}`);
    }

    const frozenSpec: RetrievalSpecification = primary.retrievalSpecification;
    const [fieldKey, fieldValue] = overlay.conflictLinkedSpecField.split(":");
    const specArray = frozenSpec[fieldKey as keyof RetrievalSpecification];
    const currentValuePresent = Array.isArray(specArray) && (specArray as string[]).includes(fieldValue!);

    entries.push({
      correctionId: overlay.correctionId,
      caseId: overlay.caseId,
      commandZoneConfiguration:
        "commandZoneConfiguration" in benchCase ? benchCase.commandZoneConfiguration : "single_commander",
      commanders: benchCase.commanders,
      combinedColorIdentity:
        report.commandZoneComposition?.combinedColorIdentity ??
        resolution.oracleIds.flatMap((id) => catalog.byOracleId.get(id)?.colorIdentity ?? []),
      bracket: benchCase.bracket,
      commandZoneMemberOracleTexts: commandZoneOracleTexts(catalog, resolution.oracleIds, benchCase.commanders),
      frozenPhase5MechanicalDirection: primary.mechanicalDescription,
      frozenPhase5RetrievalSpecification: frozenSpec,
      questionedRequirementOrConstraint: {
        requirementId: overlay.conflictRequirementId,
        linkedSpecField: overlay.conflictLinkedSpecField,
        field: fieldKey,
        currentValue: fieldValue,
        presentInFrozenPhase5Spec: currentValuePresent,
      },
      proposedPhase6Correction: {
        action: overlay.proposedCorrection.action,
        field: overlay.proposedCorrection.field,
        removeValue: overlay.proposedCorrection.removeValue ?? null,
        replaceWith: overlay.proposedCorrection.replaceWith ?? null,
        overlayMechanism: "RetrievalSpecificationCorrection",
        doesNotMutatePhase5Artifacts: true,
      },
      mechanicalRationale: overlay.proposedCorrection.rationale,
      upstreamConflictProvenance: overlay.provenance,
      independentAdjudicationLabel: null,
      independentAdjudicationNotes: null,
      reviewStatus: "PENDING_INDEPENDENT_REVIEW",
    });
  }

  const artifact = {
    version: "phase6a1-p11-spec-correction-adjudication-blinded-v1",
    overlayVersion: RETRIEVAL_SPEC_CORRECTION_OVERLAY_V1_1_VERSION,
    generatedAt: new Date().toISOString(),
    reviewStatus: "PENDING_INDEPENDENT_REVIEW",
    entryCount: entries.length,
    prohibitedAdjudicationInputs: [
      "compositeScore",
      "rankOverall",
      "rankForRequirement",
      "commanderSemanticFit",
      "directionFit",
      "functionalRoleFit",
      "structuralFit",
      "generalCandidateScore",
      "automatedProxyLabel",
      "candidatePoolStats",
      "retrievalPerformanceMetrics",
      "humanLabelRatesFromChangedCandidateReview",
    ],
    adjudicationLabelSchema: [
      "ACCEPT_CORRECTION",
      "REJECT_CORRECTION",
      "NEEDS_DIFFERENT_CORRECTION",
    ],
    note: "Adjudicate whether the proposed Phase-6 RetrievalSpecificationCorrection is mechanically correct. Phase-5 discovery artifacts remain frozen regardless until overlay is accepted and applied in Phase-6.",
    postAdjudicationWorkflow: {
      afterAllEightAdjudicated:
        "Rerun clean P14 baseline with SPEC_VALID, CONFIRMED_CORRECTED_SPEC, and UPSTREAM_INVALID_EXCLUDED reported separately.",
      applyToPhase5: false,
    },
    authorization: {
      phase6A1TypedSemantics: "VALIDATED_AS_IMPROVEMENT",
      phase6AFreeze: "WAIT",
      p11CorrectionOverlayAdjudication: "REQUIRED_NEXT",
      additionalFunctionalSemanticTuning: "WAIT",
      scoreWeightTuning: "WAIT",
      poolCapChanges: "NOT_AUTHORIZED",
      metaPopularitySignals: "PROHIBITED",
      optimizer: "WAIT",
      professor: "WAIT",
    },
    entries,
  };

  mkdirSync(resolve("data/milestones/deck-synthesis"), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(artifact, null, 2));
  console.log(`P11 blinded correction adjudication: ${OUT_PATH} (${entries.length} entries)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
