#!/usr/bin/env npx tsx
/**
 * Phase 5.6 forensic design — blind-v4 eight semantic failures (design only, no repairs).
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { loadShadowSemanticIndex } from "../src/lib/commander-strategy/shadow-semantic-index";
import {
  buildCommanderMechanicalProfile,
  buildGlobalCatalogSemanticIndex,
  discoverArchetypes,
  extractDirectionAnchors,
  extractMechanicalMotifs,
  resolveBenchmarkCommanderOracleIds,
} from "../src/lib/deck-synthesis";
import { ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V4 } from "../src/lib/deck-synthesis/archetype-discovery-blind-holdout-v4";
import { discoverCommanderBuildDirections } from "../src/lib/deck-synthesis/commander-build-direction-v1";
import { buildCommandZoneComposition } from "../src/lib/deck-synthesis/command-zone-composition-v1";

loadProjectEnvLocal();

const FORENSIC_CASES = [
  {
    caseId: "blindv4-01-partner-pair",
    family: "MULTI_COMMAND_ZONE",
    commanders: ["Vial Smasher the Fierce", "Akroma, Vision of Ixidor"],
    forensicQuestion:
      "Did independent member directions disappear, or did composition reject them for insufficient cross-support?",
  },
  {
    caseId: "blindv4-05-partner-pair",
    family: "MULTI_COMMAND_ZONE",
    commanders: ["Pir, Imaginative Rascal", "Toothy, Imaginary Friend"],
    forensicQuestion: "Does the system recognize the reciprocal draw/counter feedback loop?",
  },
  {
    caseId: "blindv4-06-partner-pair",
    family: "MULTI_COMMAND_ZONE",
    commanders: ["Miara, Thorn of the Glade", "Francisco, Fowl Marauder"],
    forensicQuestion: "Does composition preserve two real but weakly related independent plans (INDEPENDENT_PARALLEL_PLANS)?",
  },
  {
    caseId: "blindv4-17-triggered-engine",
    family: "SINGLE_COMMANDER",
    commanders: ["Elrond of the White Council"],
    forensicHypothesis: "Voting / modal ETB outcomes",
  },
  {
    caseId: "blindv4-18-triggered-engine",
    family: "SINGLE_COMMANDER",
    commanders: ["Dong Zhou, the Tyrant"],
    forensicHypothesis: "ETB using opponent creature power as damage source/magnitude",
  },
  {
    caseId: "blindv4-20-activated-engine",
    family: "SINGLE_COMMANDER",
    commanders: ["Mannichi, the Fevered Dream"],
    forensicHypothesis: "Global characteristic transformation / P-T swap",
  },
  {
    caseId: "blindv4-21-activated-engine",
    family: "SINGLE_COMMANDER",
    commanders: ["Arcades Sabboth"],
    forensicHypothesis: "Static untapped/nonattacking state incentive scaling",
  },
  {
    caseId: "blindv4-22-static-state-engine",
    family: "SINGLE_COMMANDER",
    commanders: ["Fíli the Pathfinder"],
    forensicHypothesis: "Threshold/state requirement + typal/token engine",
  },
] as const;

function summarizeAnchors(anchors: ReturnType<typeof extractDirectionAnchors>) {
  return anchors.map((a) => ({
    anchorKind: a.anchorKind,
    mechanism: a.mechanism,
    anchorText: a.anchorText?.slice(0, 120),
    causalPosition: a.causalPosition,
  }));
}

function summarizeDirections(directions: ReturnType<typeof discoverCommanderBuildDirections>) {
  return directions.map((d) => ({
    rank: d.rank,
    directionId: d.directionId,
    mechanicalDescription: d.mechanicalDescription,
    directionValidity: d.directionValidity,
    anchorCount: d.directionAnchors.length,
    drivers: d.drivers,
    payoffs: d.payoffs,
    phase6RetrievalReady: d.phase6RetrievalReady,
    retrievalCompleteness: d.retrievalSpecificationCompleteness,
  }));
}

function firstInformationLossLayer(trace: {
  oraclePresent: boolean;
  rc8EvidenceRefs: number;
  causalSignals: number;
  motifs: number;
  anchors: number;
  memberDirections: number;
  compositionDirections: number;
  primaryDirection: boolean;
}): string {
  if (!trace.oraclePresent) return "ORACLE_MISSING";
  if (trace.rc8EvidenceRefs === 0 && trace.causalSignals === 0) return "RC8_CAUSAL_INFERENCE_EMPTY";
  if (trace.motifs === 0) return "MECHANICAL_MOTIFS_EMPTY";
  if (trace.anchors === 0) return "DIRECTION_ANCHORS_EMPTY";
  if (trace.memberDirections === 0) return "MEMBER_BUILD_DIRECTIONS_EMPTY";
  if (trace.compositionDirections === 0 && trace.memberDirections > 0) return "COMMAND_ZONE_COMPOSITION_COLLAPSE";
  if (!trace.primaryDirection) return "NO_PRIMARY_DIRECTION";
  return "PRIMARY_DIRECTION_PRESENT_BUT_ADJUDICATED_FAIL";
}

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const shadowIndex = await loadShadowSemanticIndex();
  const globalCatalogIndex = buildGlobalCatalogSemanticIndex({ catalog, shadowIndex });

  const caseReports = [];

  for (const spec of FORENSIC_CASES) {
    const holdout = ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V4.find((c) => c.id === spec.caseId)!;
    const resolution = resolveBenchmarkCommanderOracleIds(catalog, spec.commanders);
    const oracleTexts = resolution.oracleIds.map((id) => catalog.byOracleId.get(id)?.oracleText ?? "");

    const profile = buildCommanderMechanicalProfile({
      commanderOracleIds: resolution.oracleIds,
      catalogByOracleId: catalog.byOracleId,
      shadowIndex,
    })!;

    const motifs = extractMechanicalMotifs(profile);
    const anchors = extractDirectionAnchors({ profile, motifs });
    const memberDirections = discoverCommanderBuildDirections({ profile });

    const composition =
      resolution.oracleIds.length > 1
        ? buildCommandZoneComposition({
            commanderOracleIds: resolution.oracleIds,
            catalog,
            shadowIndex,
            combinedProfile: profile,
          })
        : null;

    const report = discoverArchetypes(
      { commanderOracleIds: resolution.oracleIds, bracket: holdout.bracket },
      { catalog, shadowIndex, globalCatalogIndex },
    );

    const memberTraces = composition?.members.map((m) => ({
      name: m.name,
      motifCount: m.individualMotifs.length,
      anchorCount: m.individualAnchors.length,
      independentDirectionCount: m.independentDirections.length,
      independentDirections: summarizeDirections(m.independentDirections),
      anchors: summarizeAnchors(m.individualAnchors),
    }));

    const causalSignalCount =
      (profile.causalRoles?.engineTriggers?.length ?? 0) +
      (profile.causalRoles?.engineActions?.length ?? 0) +
      (profile.causalRoles?.stateScaling?.length ?? 0) +
      (profile.causalRoles?.activatedActions?.length ?? 0) +
      (profile.causalRoles?.stateChangeTriggers?.length ?? 0);

    const traceSummary = {
      oraclePresent: oracleTexts.every((t) => t.trim().length > 0),
      rc8EvidenceRefs: profile.evidenceRefs?.length ?? 0,
      causalSignals: causalSignalCount,
      motifs: motifs.length,
      anchors: anchors.length,
      memberDirections: memberDirections.length,
      compositionDirections: composition?.buildDirections.length ?? memberDirections.length,
      primaryDirection: Boolean(report.buildDirections.find((d) => d.rank === 1)),
    };

    caseReports.push({
      caseId: spec.caseId,
      family: spec.family,
      commanders: spec.commanders,
      commandZoneConfiguration: holdout.commandZoneConfiguration,
      forensicQuestion: "forensicQuestion" in spec ? spec.forensicQuestion : undefined,
      forensicHypothesis: "forensicHypothesis" in spec ? spec.forensicHypothesis : undefined,
      eligibilityStatus: "LIVE_COMMANDER_VALID_UNDER_V1.1",
      trace: {
        oracle: oracleTexts.map((text, i) => ({
          name: spec.commanders[i],
          oracleId: resolution.oracleIds[i],
          textPreview: text.slice(0, 400),
        })),
        rc8: {
          evidenceRefs: profile.evidenceRefs?.slice(0, 8) ?? [],
          commandZoneIpv2_1Top: Object.entries(profile.commandZoneIpv2_1 ?? {})
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([k, v]) => ({ key: k, weight: v })),
        },
        causalInference: {
          version: profile.causalInferenceVersion,
          engineTriggers: profile.causalRoles?.engineTriggers ?? [],
          engineActions: profile.causalRoles?.engineActions ?? [],
          engineOutputs: profile.causalRoles?.engineOutputs ?? [],
          stateScaling: profile.causalRoles?.stateScaling?.slice(0, 6) ?? [],
          activatedActions: profile.causalRoles?.activatedActions?.slice(0, 6) ?? [],
          stateChangeTriggers: profile.causalRoles?.stateChangeTriggers?.slice(0, 6) ?? [],
        },
        motifs: motifs.map((m) => ({
          motifId: m.motifId,
          causalPosition: m.causalPosition,
          strength: m.strength,
        })),
        directionAnchors: summarizeAnchors(anchors),
        memberBuildDirections: summarizeDirections(memberDirections),
        commandZoneComposition: composition
          ? {
              configuration: composition.configuration,
              memberTraces,
              independentDirectionCount: composition.independentDirections.length,
              sharedDirectionCount: composition.sharedDirections.length,
              crossSupportDirectionCount: composition.crossSupportDirections.length,
              resourceFlowCount: composition.resourceFlows.length,
              feedbackLoopCount: composition.feedbackLoops.length,
              resourceFlows: composition.resourceFlows.map((e) => ({
                from: composition.members[e.fromMemberIndex]?.name,
                to: composition.members[e.toMemberIndex]?.name,
                relationship: e.relationship,
                evidence: e.evidence,
              })),
              feedbackLoops: composition.feedbackLoops.map((e) => ({
                from: composition.members[e.fromMemberIndex]?.name,
                to: composition.members[e.toMemberIndex]?.name,
                relationship: e.relationship,
              })),
              buildDirections: summarizeDirections(composition.buildDirections),
              combinedRetrievalReady: composition.buildDirections.find((d) => d.rank === 1)?.phase6RetrievalReady ?? false,
            }
          : null,
        discoveryPrimary: report.buildDirections.find((d) => d.rank === 1)
          ? summarizeDirections([report.buildDirections.find((d) => d.rank === 1)!])[0]
          : null,
        evaluationContextStatus: report.evaluationContextStatus,
      },
      firstInformationLossLayer: firstInformationLossLayer(traceSummary),
      proposedPhase56Investigation: {
        compositionInvariantCandidate:
          "CommandZoneComposition may ADD understanding but must not erase valid member directions unless deterministic conflict explicitly invalidates them.",
        professorPreservationFields: [
          "independentPlans[]",
          "crossSupportStrength",
          "competingDirections[]",
          "unresolvedDirectionAmbiguity[]",
          "correctAbstentionReason",
        ],
      },
    });
  }

  const report = {
    version: "phase56-blind-v4-forensic-design-v1",
    generatedAt: new Date().toISOString(),
    status: "DESIGN_ONLY",
    authorization: {
      phase56SemanticImplementation: "WAIT",
      phase6: "WAIT",
      professorImplementation: "WAIT",
    },
    blindV4Verdict: "SPENT_FAIL",
    semanticFailureCount: FORENSIC_CASES.length,
    families: {
      MULTI_COMMAND_ZONE: caseReports.filter((c) => c.family === "MULTI_COMMAND_ZONE"),
      SINGLE_COMMANDER: caseReports.filter((c) => c.family === "SINGLE_COMMANDER"),
    },
    commandZoneCompositionInvariantProposal: {
      rule: "composition may ADD understanding but may not erase valid member understanding",
      flow: "valid member directions → CommandZoneComposition → preserve member directions + optionally derive pair-level directions",
      exception: "unless a deterministic conflict explicitly invalidates a direction",
    },
    caseReports,
  };

  const outDir = resolve(process.cwd(), "data/milestones/deck-synthesis");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "phase56-blind-v4-forensic-design-v1.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  const hash = createHash("sha256").update(JSON.stringify(report)).digest("hex");

  console.log(
    JSON.stringify(
      {
        outPath,
        hash,
        firstInformationLossLayers: caseReports.map((c) => ({
          caseId: c.caseId,
          layer: c.firstInformationLossLayer,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
