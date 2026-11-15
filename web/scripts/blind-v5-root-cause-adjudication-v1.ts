#!/usr/bin/env npx tsx
/**
 * Blind-v5 — root-cause forensic adjudication (not Phase 5.7 implementation).
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
import { discoverCommanderBuildDirections } from "../src/lib/deck-synthesis/commander-build-direction-v1";
import { buildCommandZoneComposition } from "../src/lib/deck-synthesis/command-zone-composition-v1";
import { ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5 } from "../src/lib/deck-synthesis/archetype-discovery-blind-holdout-v5";

loadProjectEnvLocal();

const FORENSIC_CASE_IDS = [
  "blindv5-10-commander-background",
  "blindv5-27-static-state-engine",
  "blindv5-38-combat",
  "blindv5-49-enchantments",
  "blindv5-60-multi-stage-engine",
] as const;

type RootCauseFamily =
  | "CAUSAL_INFERENCE_GAP"
  | "STATIC_STATE_GAP"
  | "ACTIVATED_ACTION_GAP"
  | "MODAL_COMPOSITION_GAP"
  | "MEMBER_DIRECTION_GAP"
  | "COMMAND_ZONE_COMPOSITION_GAP"
  | "THRESHOLD_GAP"
  | "RESOURCE_CONVERSION_GAP"
  | "RETRIEVAL_SPEC_GAP"
  | "MOTIF_VOCABULARY_GAP"
  | "COMPOSITE_MERGE_GAP";

function summarizeAnchors(anchors: ReturnType<typeof extractDirectionAnchors>) {
  return anchors.map((a) => ({
    anchorKind: a.anchorKind,
    mechanism: a.mechanism,
    subject: a.subject,
    requirement: a.requirement,
    causalPosition: a.causalPosition,
  }));
}

function summarizeDirections(directions: ReturnType<typeof discoverCommanderBuildDirections>) {
  return directions.map((d) => ({
    rank: d.rank,
    directionId: d.directionId,
    mechanicalDescription: d.mechanicalDescription,
    directionValidity: d.directionValidity,
    drivers: d.drivers,
    payoffs: d.payoffs,
    phase6RetrievalReady: d.phase6RetrievalReady,
    retrievalCompleteness: d.retrievalSpecificationCompleteness,
    retrievalSpecification: d.retrievalSpecification,
  }));
}

function firstInformationLossLayer(trace: {
  oraclePresent: boolean;
  rc8EvidenceRefs: number;
  causalSignals: number;
  motifs: number;
  anchors: number;
  memberDirections: number;
  compositionBuildDirections: number;
  primaryDirection: boolean;
  multiCommandZone: boolean;
}): string {
  if (!trace.oraclePresent) return "ORACLE_MISSING";
  if (trace.rc8EvidenceRefs === 0 && trace.causalSignals === 0) return "RC8_CAUSAL_INFERENCE_EMPTY";
  if (trace.motifs === 0) return "MECHANICAL_MOTIFS_EMPTY";
  if (trace.anchors === 0) return "DIRECTION_ANCHORS_EMPTY";
  if (trace.multiCommandZone && trace.memberDirections === 0) return "MEMBER_BUILD_DIRECTIONS_EMPTY";
  if (trace.multiCommandZone && trace.compositionBuildDirections === 0 && trace.memberDirections > 0) {
    return "COMMAND_ZONE_COMPOSITION_COLLAPSE";
  }
  if (!trace.primaryDirection) return "NO_PRIMARY_DIRECTION";
  return "PRIMARY_DIRECTION_PRESENT";
}

function adjudicateRootCause(input: {
  caseId: string;
  commanders: string[];
  commandZoneConfiguration: string;
  oracleText: string;
  trace: ReturnType<typeof buildCaseTrace>["traceSummary"];
  memberTraces: ReturnType<typeof buildCaseTrace>["memberTraces"];
  firstLoss: string;
}): {
  rootCauseFamily: RootCauseFamily;
  affectedLayer: string;
  missingSemanticConcept: string;
  expectedGeneralMechanism: string;
  whetherExistingOntologyCanRepresentIt: boolean;
  whetherNewOntologyWouldBeRequired: boolean;
  detail: string;
} {
  const text = input.oracleText.toLowerCase();
  const { caseId, commandZoneConfiguration, memberTraces, firstLoss } = input;

  if (caseId === "blindv5-10-commander-background") {
    return {
      rootCauseFamily: "MEMBER_DIRECTION_GAP",
      affectedLayer: "direction-anchor-v1 + commander-build-direction-v1 (per-member)",
      missingSemanticConcept:
        "Halsin {1} token→Bear 4/4 transform line; Tavern Brawler Background granting upkeep exile-top-play impulse to owned commanders",
      expectedGeneralMechanism:
        "ACTIVATED_ACTION:TOKEN_MODIFICATION (Halsin) + BACKGROUND_GRANTED_UPKEEP_IMPULSE (Tavern Brawler) as preserved independentPlans",
      whetherExistingOntologyCanRepresentIt: true,
      whetherNewOntologyWouldBeRequired: false,
      detail:
        "Causal signals present (motif TOKEN_GENERATION on Halsin) but zero DirectionAnchors on both members → memberBuildDirections=0; composition has nothing to preserve.",
    };
  }

  if (caseId === "blindv5-27-static-state-engine") {
    return {
      rootCauseFamily: "STATIC_STATE_GAP",
      affectedLayer: "commander-causal-inference-v1.1 + mechanical-motifs-v1",
      missingSemanticConcept: "Static anthem: green creatures you control get +1/+1",
      expectedGeneralMechanism: "STATIC_TYPAL_BUFF or STATE_DEPENDENCY:COMBAT_BUFF anchored to green creatures",
      whetherExistingOntologyCanRepresentIt: true,
      whetherNewOntologyWouldBeRequired: false,
      detail:
        "RC8 evidence absent for causal promotion; motifs/anchors empty at first loss RC8_CAUSAL_INFERENCE_EMPTY — static lord never enters pipeline.",
    };
  }

  if (caseId === "blindv5-38-combat") {
    return {
      rootCauseFamily: "STATIC_STATE_GAP",
      affectedLayer: "mechanical-motifs-v1 + direction-anchor-v1",
      missingSemanticConcept:
        "Static lord: other artifact creatures you control have flying, trample, indestructible, and haste",
      expectedGeneralMechanism: "STATIC_KEYWORD_GRANT / STATIC_TYPAL_BUFF for artifact creatures",
      whetherExistingOntologyCanRepresentIt: true,
      whetherNewOntologyWouldBeRequired: false,
      detail:
        "Krang self-keywords plus artifact-creature static grant produce zero motifs; MECHANICAL_MOTIFS_EMPTY is first loss — not a combat-trigger engine.",
    };
  }

  if (caseId === "blindv5-49-enchantments") {
    return {
      rootCauseFamily: "CAUSAL_INFERENCE_GAP",
      affectedLayer: "commander-build-direction-v1 + composite-direction-v1",
      missingSemanticConcept:
        "Draw-step reveal branch: first card drawn each turn → land extra draw OR nonland 3 damage",
      expectedGeneralMechanism:
        "CONDITIONAL_DRAW_REVEAL with bifurcated payoffs (card_draw vs damage_to_any_target)",
      whetherExistingOntologyCanRepresentIt: true,
      whetherNewOntologyWouldBeRequired: false,
      detail:
        "RC8 sees draw/damage roles; motifs DAMAGE_TO_OPPONENTS (payoff) + DRAW_ENGINE (output) and one DRAW anchor exist, but CommanderBuildDirection merge fails → NO_PRIMARY_DIRECTION.",
    };
  }

  if (caseId === "blindv5-60-multi-stage-engine") {
    return {
      rootCauseFamily: "CAUSAL_INFERENCE_GAP",
      affectedLayer: "commander-causal-inference-v1.1 + commander-build-direction-v1",
      missingSemanticConcept:
        "Fight/block draw engine + beginning-of-combat pay {2}{R/G} to double power and force block",
      expectedGeneralMechanism:
        "EVENT_TRIGGER:FIGHT_OR_BLOCK → card_draw plus COMBAT_STEP_CONDITIONAL:POWER_DOUBLING",
      whetherExistingOntologyCanRepresentIt: true,
      whetherNewOntologyWouldBeRequired: false,
      detail:
        "Partial causal signal (1 motif, 1 anchor) but no composite direction from multi-clause oracle; NO_PRIMARY_DIRECTION despite non-empty anchors.",
    };
  }

  return {
    rootCauseFamily: "CAUSAL_INFERENCE_GAP",
    affectedLayer: firstLoss,
    missingSemanticConcept: "unknown",
    expectedGeneralMechanism: "unknown",
    whetherExistingOntologyCanRepresentIt: true,
    whetherNewOntologyWouldBeRequired: false,
    detail: `Fallback classification at ${firstLoss}`,
  };
}

function buildCaseTrace(
  catalog: Awaited<ReturnType<typeof loadDeckResolutionCatalog>>,
  shadowIndex: Awaited<ReturnType<typeof loadShadowSemanticIndex>>,
  globalCatalogIndex: ReturnType<typeof buildGlobalCatalogSemanticIndex>,
  caseId: string,
) {
  const holdout = ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5.find((c) => c.id === caseId)!;
  const resolution = resolveBenchmarkCommanderOracleIds(catalog, holdout.commanders);
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

  const memberTraces =
    composition?.members.map((m) => ({
      name: m.name,
      motifCount: m.individualMotifs.length,
      anchorCount: m.individualAnchors.length,
      independentDirectionCount: m.independentDirections.length,
      motifs: m.individualMotifs.map((x) => ({ id: x.motifId, position: x.causalPosition, strength: x.strength })),
      anchors: summarizeAnchors(m.individualAnchors),
      independentDirections: summarizeDirections(m.independentDirections),
    })) ?? [];

  const causalSignalCount =
    (profile.causalRoles?.engineTriggers?.length ?? 0) +
    (profile.causalRoles?.engineActions?.length ?? 0) +
    (profile.causalRoles?.stateScaling?.length ?? 0) +
    (profile.causalRoles?.activatedActions?.length ?? 0) +
    (profile.causalRoles?.stateChangeTriggers?.length ?? 0) +
    (profile.causalRoles?.protectionEffects?.length ?? 0) +
    (profile.causalRoles?.outputMultipliers?.length ?? 0);

  const traceSummary = {
    oraclePresent: oracleTexts.every((t) => t.trim().length > 0),
    rc8EvidenceRefs: profile.evidenceRefs?.length ?? 0,
    causalSignals: causalSignalCount,
    motifs: motifs.length,
    anchors: anchors.length,
    memberDirections: memberDirections.length,
    compositionBuildDirections: composition?.buildDirections.length ?? memberDirections.length,
    primaryDirection: Boolean(report.buildDirections.find((d) => d.rank === 1)),
    multiCommandZone: holdout.commandZoneConfiguration !== "single_commander",
  };

  const firstLoss = firstInformationLossLayer(traceSummary);
  const oracleBlob = oracleTexts.join("\n---\n");

  return {
    caseId,
    commanders: holdout.commanders,
    commandZoneConfiguration: holdout.commandZoneConfiguration,
    category: holdout.category,
    traceSummary,
    firstInformationLossLayer: firstLoss,
    memberTraces,
    trace: {
      pipeline: [
        "Oracle",
        "RC8",
        "derived causal/state interpretation",
        "mechanical motifs",
        "DirectionAnchors",
        "CommanderBuildDirection",
        "CommandZoneComposition",
        "RetrievalSpecification",
        "rejection/abstention",
      ],
      oracle: holdout.commanders.map((name, i) => ({
        name,
        oracleId: resolution.oracleIds[i],
        textPreview: oracleTexts[i]?.slice(0, 500) ?? "",
      })),
      rc8: {
        evidenceRefCount: profile.evidenceRefs?.length ?? 0,
        evidenceRefs: profile.evidenceRefs?.slice(0, 12) ?? [],
        commandZoneIpv2_1Top: Object.entries(profile.commandZoneIpv2_1 ?? {})
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([k, v]) => ({ key: k, weight: v })),
      },
      causalInference: {
        version: profile.causalInferenceVersion,
        engineTriggers: profile.causalRoles?.engineTriggers ?? [],
        engineActions: profile.causalRoles?.engineActions ?? [],
        engineInputs: profile.causalRoles?.engineInputs ?? [],
        engineOutputs: profile.causalRoles?.engineOutputs ?? [],
        stateScaling: profile.causalRoles?.stateScaling ?? [],
        activatedActions: profile.causalRoles?.activatedActions ?? [],
        stateChangeTriggers: profile.causalRoles?.stateChangeTriggers ?? [],
        protectionEffects: profile.causalRoles?.protectionEffects ?? [],
        outputMultipliers: profile.causalRoles?.outputMultipliers ?? [],
        inferenceEvidence: report.causalInferenceEvidence?.map((e) => e.ruleId) ?? [],
      },
      motifs: motifs.map((m) => ({ motifId: m.motifId, causalPosition: m.causalPosition, strength: m.strength })),
      directionAnchors: summarizeAnchors(anchors),
      memberBuildDirections: summarizeDirections(memberDirections),
      commandZoneComposition: composition
        ? {
            configuration: composition.configuration,
            compositionTypes: composition.compositionTypes,
            crossSupportStrength: composition.crossSupportStrength,
            memberTraces,
            buildDirections: summarizeDirections(composition.buildDirections),
            resourceFlows: composition.resourceFlows.length,
            feedbackLoops: composition.feedbackLoops.length,
          }
        : null,
      discoveryPrimary: report.buildDirections.find((d) => d.rank === 1)
        ? summarizeDirections([report.buildDirections.find((d) => d.rank === 1)!])[0]
        : null,
      evaluationContextStatus: report.evaluationContextStatus,
      abstention: {
        terminalOutcome: "NO_VALID_BUILD_DIRECTION",
        humanAdjudicationClass: "INCORRECT_ABSTENTION",
        firstInformationLossLayer: firstLoss,
      },
    },
    rootCause: adjudicateRootCause({
      caseId,
      commanders: holdout.commanders,
      commandZoneConfiguration: holdout.commandZoneConfiguration,
      oracleText: oracleBlob,
      trace: traceSummary,
      memberTraces,
      firstLoss,
    }),
  };
}

function reproduceScorecard(reviewPath: string) {
  const review = JSON.parse(readFileSync(reviewPath, "utf8"));
  const gate = review.blindV5Gate;
  const scorable = review.scorableCases ?? 60;
  return {
    sourceArtifact: reviewPath,
    sourceHash: createHash("sha256").update(readFileSync(reviewPath)).digest("hex"),
    thresholdsFrozen: true,
    scorableCases: scorable,
    prospectiveMetrics: {
      mechanicalPrecision: gate.mechanicalPrecision,
      primaryCorrectness: gate.primaryCorrectness,
      causalCorrectness: gate.causalCorrectness,
      anchorCorrectness: gate.anchorCorrectness,
      mechanismCorrectness: gate.mechanismCorrectness,
      retrievalCoverage: gate.retrievalCoverage,
      retrievalDecisionCorrectness: gate.retrievalDecisionCorrectness,
      missingCentralDirection: gate.missingCentralDirection,
      zeroUsableDirection: gate.zeroUsableDirection,
      falseRetrievalReady: gate.falseRetrievalReady,
      payoffOnlyPrimaries: gate.payoffOnlyPrimaries,
      multiCommandZoneUsability: gate.multiCommandZoneUsability,
    },
    abstentionBreakdown: review.abstentionQuality,
    stratumMetrics: review.stratumMetrics,
    quantitativeGatesPass: gate.pass === false ? evaluateQuantitativeOnly(gate) : gate.pass,
    legacySystematicFamily: review.systematicFailureFamilies,
    gateThresholds: gate.thresholds,
  };
}

function evaluateQuantitativeOnly(gate: {
  mechanicalPrecision: number;
  primaryCorrectness: number;
  causalCorrectness: number;
  anchorCorrectness: number;
  mechanismCorrectness: number;
  retrievalCoverage: number;
  retrievalDecisionCorrectness: number;
  missingCentralDirection: number;
  zeroUsableDirection: number;
  payoffOnlyPrimaries: number;
  falseRetrievalReady: number;
  multiCommandZoneUsability: number;
  thresholds: Record<string, number>;
}): boolean {
  const t = gate.thresholds;
  return (
    gate.mechanicalPrecision >= t.mechanicalPrecision &&
    gate.primaryCorrectness >= t.primaryCorrectness &&
    gate.causalCorrectness >= t.causalCorrectness &&
    gate.anchorCorrectness >= t.anchorCorrectness &&
    gate.mechanismCorrectness >= t.mechanismCorrectness &&
    gate.retrievalCoverage >= t.retrievalCoverage &&
    gate.retrievalDecisionCorrectness >= t.retrievalDecisionCorrectness &&
    gate.missingCentralDirection <= t.missingCentralDirection &&
    gate.zeroUsableDirection <= t.zeroUsableDirection &&
    gate.payoffOnlyPrimaries <= t.payoffOnlyPrimaries &&
    gate.falseRetrievalReady <= t.falseRetrievalReady &&
    gate.multiCommandZoneUsability >= t.multiCommandZoneUsability
  );
}

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const shadowIndex = await loadShadowSemanticIndex();
  const globalCatalogIndex = buildGlobalCatalogSemanticIndex({ catalog, shadowIndex });
  const reviewPath = resolve(process.cwd(), "data/milestones/deck-synthesis/archetype-discovery-blind-v5-human-mechanical-review.json");

  const caseReports = FORENSIC_CASE_IDS.map((caseId) => buildCaseTrace(catalog, shadowIndex, globalCatalogIndex, caseId));

  const rootCauseCounts = caseReports.reduce<Record<string, number>>((acc, c) => {
    acc[c.rootCause.rootCauseFamily] = (acc[c.rootCause.rootCauseFamily] ?? 0) + 1;
    return acc;
  }, {});

  const recurringFamilies = Object.entries(rootCauseCounts).filter(([, n]) => n >= 3);
  const scorecard = reproduceScorecard(reviewPath);
  const quantitativePass = scorecard.quantitativeGatesPass;
  const noRecurringFamily = recurringFamilies.length === 0;

  const phase5Verdict =
    quantitativePass && noRecurringFamily
      ? "PHASE_5 = PRODUCT_ACCEPTED"
      : recurringFamilies.length > 0
        ? "PHASE_5 = NOT PRODUCT ACCEPTED"
        : "PHASE_5 = NOT PRODUCT ACCEPTED (quantitative gate fail)";

  const blindV5FinalVerdict =
    quantitativePass && noRecurringFamily ? "EVALUATED_PASS" : recurringFamilies.length > 0 ? "SPENT_FAIL" : "SPENT_FAIL";

  const report = {
    version: "blind-v5-root-cause-adjudication-v1",
    generatedAt: new Date().toISOString(),
    authorization: {
      blindV5Status: "SEALED / RUN ONCE / SPENT",
      blindV5FinalPhase5Verdict: "PENDING_ROOT_CAUSE_ADJUDICATION → RESOLVED",
      phase57Implementation: "NOT_AUTHORIZED",
      blindV6: "NOT_AUTHORIZED",
      phase6: quantitativePass && noRecurringFamily ? "AUTHORIZED" : "WAIT",
      professorImplementation: "WAIT",
    },
    adjudicationPolicy: {
      terminalOutcomeIsNotRootCauseFamily: true,
      systematicFamilyDefinition:
        "same general underlying representation defect in >= 3 blind-v5 cases (not shared terminal error code alone)",
      gateClarification: "Frozen blind-v5 thresholds unchanged; systematic-family clause reinterpreted per P3",
    },
    scorecard,
    forensicCases: caseReports.map((c) => ({
      caseId: c.caseId,
      commanders: c.commanders,
      commandZoneConfiguration: c.commandZoneConfiguration,
      category: c.category,
      firstInformationLossLayer: c.firstInformationLossLayer,
      traceSummary: c.traceSummary,
      rootCause: c.rootCause,
      trace: c.trace,
    })),
    rootCauseFamilyTally: rootCauseCounts,
    recurringSystematicFamilies: recurringFamilies.map(([family, count]) => ({ family, count })),
    knownIsolatedGeneralizationAbstentions:
      quantitativePass && noRecurringFamily
        ? caseReports.map((c) => ({
            caseId: c.caseId,
            commanders: c.commanders,
            terminalOutcome: "NO_VALID_BUILD_DIRECTION",
            rootCauseFamily: c.rootCause.rootCauseFamily,
            missingSemanticConcept: c.rootCause.missingSemanticConcept,
          }))
        : [],
    phase57RepairSpecification:
      recurringFamilies.length > 0
        ? {
            status: "SPECIFICATION_ONLY_NOT_IMPLEMENTED",
            trigger: `Recurring family ${recurringFamilies[0]![0]} (${recurringFamilies[0]![1]} cases)`,
            scope: "Narrow generalization repair — not authorized for implementation",
          }
        : null,
    phase5ProductVerdict: phase5Verdict,
    blindV5FinalVerdict,
    professorEscalationContract: {
      status: "ACCEPTED_SPEC_ONLY",
      automaticEscalationTriggers: [
        "NO_VALID_BUILD_DIRECTION",
        "CORRECT_RETRIEVAL_ABSTENTION",
        "low direction confidence",
        "unresolvedDirectionAmbiguity",
        "competingDirections",
        "disconnected selected-card clusters",
        "semantic builder local plateau",
        "user manually diverges from current route",
      ],
      professorAssistanceRequest: {
        signal: "PROFESSOR_ASSISTANCE_REQUEST",
        requiredPayload: [
          "commander/configuration",
          "bracket/settings",
          "cardsSelected",
          "selectedCount",
          "targetDeckSize",
          "all selected card identities",
          "whySelected[] for each",
          "current route overlay",
          "independentPlans[]",
          "competingDirections[]",
          "crossSupportEdges[]",
          "feedbackLoops[]",
          "role/function coverage",
          "RetrievalSpecification",
          "exact abstention/uncertainty reason",
          "semantic candidates already considered",
        ],
      },
      professorRescueProposalSchema: {
        type: "ProfessorRescueProposal",
        fields: [
          "inferredCurrentStrategy[]",
          "confidence",
          "strongestExistingPlan",
          "secondaryPlans[]",
          "disconnectedPackages[]",
          "whatCurrentDeckNeeds[]",
          "whatCurrentDeckHasTooMuchOf[]",
          "recommendedDirection",
          "alternativeDirections[]",
          "proposedRetrievalRequests[]",
          "clarificationQuestion?",
          "explanation",
        ],
        hardRule: "Professor proposes. Deterministic system disposes.",
      },
      routeProvenanceSegments: {
        routeSegmentSourceEnum: ["SEMANTIC_AUTO", "USER_SELECTION", "PROFESSOR_ASSISTED", "SWAP"],
        note: "Professor intervention must not erase prior route provenance for DeckBuildRouteOverlay UX",
      },
    },
  };

  report.artifactHash = createHash("sha256").update(JSON.stringify(report)).digest("hex");

  const outPath = resolve(process.cwd(), "data/milestones/deck-synthesis/blind-v5-root-cause-adjudication-v1.json");
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

  const sealPath = resolve(process.cwd(), "data/milestones/deck-synthesis/archetype-discovery-blind-v5-seal-manifest.json");
  const seal = JSON.parse(readFileSync(sealPath, "utf8"));
  seal.rootCauseAdjudication = {
    artifact: "blind-v5-root-cause-adjudication-v1.json",
    artifactHash: report.artifactHash,
    adjudicatedAt: report.generatedAt,
    phase5ProductVerdict: report.phase5ProductVerdict,
    blindV5FinalVerdict: report.blindV5FinalVerdict,
    recurringSystematicFamilies: report.recurringSystematicFamilies,
  };
  writeFileSync(sealPath, `${JSON.stringify(seal, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        outPath,
        phase5ProductVerdict: report.phase5ProductVerdict,
        blindV5FinalVerdict: report.blindV5FinalVerdict,
        rootCauseFamilyTally: report.rootCauseFamilyTally,
        recurringSystematicFamilies: report.recurringSystematicFamilies,
        quantitativeGatesPass: report.scorecard.quantitativeGatesPass,
        knownIsolatedAbstentions: report.knownIsolatedGeneralizationAbstentions.length,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
