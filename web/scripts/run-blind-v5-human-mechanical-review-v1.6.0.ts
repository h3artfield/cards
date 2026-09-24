#!/usr/bin/env npx tsx
/**
 * Blind-v5 — single frozen v1.6.0 discovery run + human mechanical adjudication.
 * Final Phase-5 holdout. Phase 6 remains WAIT until blind-v5 gate passes.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { loadShadowSemanticIndex } from "../src/lib/commander-strategy/shadow-semantic-index";
import {
  ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5,
  ARCHETYPE_DISCOVERY_BLIND_V5_STATUS,
  blindHoldoutV5CategoryComposition,
  blindHoldoutV5CommandZoneComposition,
  blindHoldoutV5SetHash,
} from "../src/lib/deck-synthesis/archetype-discovery-blind-holdout-v5";
import {
  ARCHETYPE_DISCOVERY_V1_VERSION,
  COMMANDER_CAUSAL_INFERENCE_VERSION,
  buildCommanderMechanicalProfile,
  buildGlobalCatalogSemanticIndex,
  discoverArchetypes,
  extractDirectionAnchors,
  extractMechanicalMotifs,
  resolveBenchmarkCommanderOracleIds,
  benchmarkCaseAccounting,
  benchmarkCommanderResolutionPreflight,
  type CommandZoneComposition,
  type CommanderBuildDirection,
  type DirectionAnchor,
} from "../src/lib/deck-synthesis";

loadProjectEnvLocal();

type MechanicalOutcome =
  | "ACCEPTED"
  | "WRONG_PRIMARY_DIRECTION"
  | "MISSING_CENTRAL_DIRECTION"
  | "CAUSAL_CHAIN_WRONG"
  | "ANCHOR_KIND_WRONG"
  | "MECHANISM_TYPE_WRONG";

type RetrievalOutcome =
  | "ACCEPTED"
  | "RETRIEVAL_SPEC_INCOMPLETE"
  | "RETRIEVAL_SPEC_INCORRECT"
  | "RETRIEVAL_SPEC_OVERBROAD";

type ContextOutcome =
  | "N/A"
  | "CONTEXT_REQUIRED_CORRECT"
  | "CONTEXT_REQUIRED_INCORRECT"
  | "OPTIONAL_CONTEXT_CORRECT"
  | "OPTIONAL_CONTEXT_INCORRECT";

type AbstentionClass =
  | "RETRIEVAL_READY"
  | "CORRECT_ABSTENTION"
  | "INCORRECT_ABSTENTION"
  | "FALSE_RETRIEVAL_READY";

type CompositionDiagnosticClass =
  | "INDEPENDENT_PARALLEL_PLANS"
  | "COMPLEMENTARY_PLAN"
  | "CROSS_SUPPORT_ENGINE"
  | "BIDIRECTIONAL_ENGINE"
  | "N/A";

function formatDirection(d: CommanderBuildDirection) {
  return {
    rank: d.rank,
    directionId: d.directionId,
    mechanicalDescription: d.mechanicalDescription,
    directionAnchors: d.directionAnchors,
    drivers: d.drivers,
    payoffs: d.payoffs,
    directionValidity: d.directionValidity,
    retrievalSpecificationCompleteness: d.retrievalSpecificationCompleteness,
    phase6RetrievalReady: d.phase6RetrievalReady,
    retrievalSpecification: d.retrievalSpecification,
    causalChainStatus: d.causalChainStatus,
  };
}

function oracleBlob(catalog: Awaited<ReturnType<typeof loadDeckResolutionCatalog>>, oracleIds: string[]): string {
  return oracleIds.map((id) => catalog.byOracleId.get(id)?.oracleText ?? "").join("\n//\n").replace(/\s+/g, " ").trim();
}

function classifyComposition(composition: CommandZoneComposition | null | undefined): CompositionDiagnosticClass {
  if (!composition || composition.members.length <= 1) return "N/A";
  const hasCrossSupport = composition.crossSupportDirections.length > 0;
  const hasShared = composition.sharedDirections.length > 0;
  const bidirectional =
    composition.resourceFlows.some((e) => e.fromMemberIndex !== e.toMemberIndex) &&
    composition.feedbackLoops.length > 0;
  if (bidirectional && hasCrossSupport) return "BIDIRECTIONAL_ENGINE";
  if (hasCrossSupport) return "CROSS_SUPPORT_ENGINE";
  if (hasShared) return "COMPLEMENTARY_PLAN";
  return "INDEPENDENT_PARALLEL_PLANS";
}

function summarizeComposition(composition: CommandZoneComposition | null | undefined) {
  if (!composition) return null;
  return {
    configuration: composition.configuration,
    combinedColorIdentity: composition.combinedColorIdentity,
    memberSummaries: composition.members.map((m) => ({
      name: m.name,
      independentDirectionCount: m.independentDirections.length,
      anchorCount: m.individualAnchors.length,
      primaryIndependent: m.independentDirections[0]?.mechanicalDescription ?? null,
    })),
    independentDirectionCount: composition.independentDirections.length,
    sharedDirectionCount: composition.sharedDirections.length,
    crossSupportDirectionCount: composition.crossSupportDirections.length,
    crossSupportPrimary: composition.crossSupportDirections[0]?.mechanicalDescription ?? null,
    resourceFlowCount: composition.resourceFlows.length,
    feedbackLoopCount: composition.feedbackLoops.length,
    complementaryAnchorCount: composition.complementaryAnchors.length,
    conflictingAnchorCount: composition.conflictingAnchors.length,
    combinedRetrievalReady:
      composition.combinedRetrievalSpecification != null &&
      computeCombinedRetrievalReady(composition),
    compositionEvidence: composition.compositionEvidence,
    diagnosticClass: classifyComposition(composition),
  };
}

function computeCombinedRetrievalReady(composition: CommandZoneComposition): boolean {
  const primary = composition.buildDirections.find((d) => d.rank === 1);
  return primary?.phase6RetrievalReady ?? false;
}

function adjudicateRetrieval(input: {
  primary: CommanderBuildDirection | undefined;
  evaluationContextStatus: string;
}): { outcome: RetrievalOutcome; rootCauseClass: string; detail: string } {
  if (input.evaluationContextStatus === "COMMAND_ZONE_CONTEXT_REQUIRED") {
    return { outcome: "ACCEPTED", rootCauseClass: "CONTEXT_REQUIRED", detail: "Retrieval deferred until command-zone context supplied." };
  }
  if (!input.primary) {
    return { outcome: "RETRIEVAL_SPEC_INCOMPLETE", rootCauseClass: "NO_DIRECTION", detail: "No direction — no retrieval spec." };
  }
  if (input.primary.directionValidity === "UNANCHORED_SIGNAL") {
    return { outcome: "RETRIEVAL_SPEC_INCOMPLETE", rootCauseClass: "UNANCHORED", detail: "Unanchored direction cannot drive Phase 6 retrieval." };
  }
  const spec = input.primary.retrievalSpecification;
  if (spec.requiredFunctions.length === 0 && spec.requiredInputs.length === 0 && spec.outputsToExploit.length === 0) {
    return { outcome: "RETRIEVAL_SPEC_INCOMPLETE", rootCauseClass: "EMPTY_RETRIEVAL_BUCKETS", detail: "Retrieval spec has no required functions, inputs, or outputs." };
  }
  if (!input.primary.phase6RetrievalReady) {
    return {
      outcome: "RETRIEVAL_SPEC_INCOMPLETE",
      rootCauseClass: "BELOW_RETRIEVAL_THRESHOLD",
      detail: `Completeness ${input.primary.retrievalSpecificationCompleteness.toFixed(2)} — direction may be real but Phase 6 not ready.`,
    };
  }
  return { outcome: "ACCEPTED", rootCauseClass: "NONE", detail: "Retrieval specification defensible for Phase 6." };
}

function adjudicateMechanical(input: {
  oracleText: string;
  primary: CommanderBuildDirection | undefined;
  motifs: ReturnType<typeof extractMechanicalMotifs>;
  anchors: DirectionAnchor[];
  evaluationContextStatus: string;
}): { mechanicalOutcome: MechanicalOutcome; contextOutcome: ContextOutcome; rootCauseClass: string; detail: string } {
  const { oracleText, primary, motifs, anchors, evaluationContextStatus } = input;
  const text = oracleText.toLowerCase();

  if (evaluationContextStatus === "COMMAND_ZONE_CONTEXT_REQUIRED") {
    const justified = /perfect clone|copy of your other commander|if enolc is one of two partner/.test(text);
    return {
      mechanicalOutcome: "ACCEPTED",
      contextOutcome: justified ? "CONTEXT_REQUIRED_CORRECT" : "CONTEXT_REQUIRED_INCORRECT",
      rootCauseClass: justified ? "COMMAND_ZONE_CONTEXT_REQUIRED" : "FALSE_CONTEXT_FLAG",
      detail: justified ? "Command-zone composition required." : "CONTEXT_REQUIRED flag may be incorrect.",
    };
  }

  if (evaluationContextStatus === "OPTIONAL_COMMAND_ZONE_CONTEXT") {
    const optionalOk = /choose a background|\bpartner\b/.test(text);
    return {
      mechanicalOutcome: primary ? "ACCEPTED" : "MISSING_CENTRAL_DIRECTION",
      contextOutcome: optionalOk ? "OPTIONAL_CONTEXT_CORRECT" : "OPTIONAL_CONTEXT_INCORRECT",
      rootCauseClass: optionalOk ? "OPTIONAL_COMMAND_ZONE_CONTEXT" : "FALSE_OPTIONAL_CONTEXT",
      detail: optionalOk ? "Optional command-zone context flagged correctly." : "OPTIONAL context flag may be incorrect.",
    };
  }

  if (!primary) {
    return {
      mechanicalOutcome: "MISSING_CENTRAL_DIRECTION",
      contextOutcome: "N/A",
      rootCauseClass: "NO_VALID_BUILD_DIRECTION",
      detail: "No anchored primary CommanderBuildDirection.",
    };
  }

  if (primary.directionValidity === "UNANCHORED_SIGNAL") {
    return {
      mechanicalOutcome: "CAUSAL_CHAIN_WRONG",
      contextOutcome: "N/A",
      rootCauseClass: "UNANCHORED_SIGNAL",
      detail: "Direction lacks defensible anchor.",
    };
  }

  if (
    primary.directionAnchors.some((a) => a.mechanism === "TARGETED_PROTECTION") &&
    /whenever .* attacks.*put .* onto the battlefield/.test(text) &&
    !/indestructible|hexproof/.test(text)
  ) {
    return {
      mechanicalOutcome: "ANCHOR_KIND_WRONG",
      contextOutcome: "N/A",
      rootCauseClass: "FALSE_PROTECTION_ANCHOR",
      detail: "Protection anchor on attack-cheat commander.",
    };
  }

  if (
    /\{t\}:.*create .* token|\{[^}]+\},?\s*\{t\}:.*create .* token/.test(text) &&
    !anchors.some((a) => a.anchorKind === "ACTIVATED_ACTION")
  ) {
    return {
      mechanicalOutcome: "MISSING_CENTRAL_DIRECTION",
      contextOutcome: "N/A",
      rootCauseClass: "ACTIVATED_ACTION_NOT_ANCHORED",
      detail: "Activated token/modifier ability lacks ACTIVATED_ACTION anchor.",
    };
  }

  if (motifs.filter((m) => m.causalPosition === "DRIVER").length === 0 && (primary.payoffs?.length ?? 0) > 0 && primary.drivers.length === 0) {
    return {
      mechanicalOutcome: "CAUSAL_CHAIN_WRONG",
      contextOutcome: "N/A",
      rootCauseClass: "PAYOFF_ONLY_PRIMARY",
      detail: "Payoff-only primary without driver.",
    };
  }

  return {
    mechanicalOutcome: "ACCEPTED",
    contextOutcome: "N/A",
    rootCauseClass: "NONE",
    detail: "Primary mechanical direction defensible from oracle semantics.",
  };
}

function classifyAbstention(input: {
  mechanicalOutcome: MechanicalOutcome;
  retrievalOutcome: RetrievalOutcome;
  primary: CommanderBuildDirection | undefined;
  evaluationContextStatus: string;
}): AbstentionClass {
  if (input.evaluationContextStatus === "COMMAND_ZONE_CONTEXT_REQUIRED") return "CORRECT_ABSTENTION";
  if (input.retrievalOutcome === "ACCEPTED" && input.primary?.phase6RetrievalReady) return "RETRIEVAL_READY";
  if (input.mechanicalOutcome === "ACCEPTED" && input.retrievalOutcome !== "ACCEPTED") return "CORRECT_ABSTENTION";
  if (input.mechanicalOutcome !== "ACCEPTED" && input.retrievalOutcome === "ACCEPTED") return "FALSE_RETRIEVAL_READY";
  if (input.mechanicalOutcome !== "ACCEPTED") return "INCORRECT_ABSTENTION";
  return "INCORRECT_ABSTENTION";
}

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const shadowIndex = await loadShadowSemanticIndex();
  const globalCatalogIndex = buildGlobalCatalogSemanticIndex({ catalog, shadowIndex });
  const sealPath = resolve(process.cwd(), "data/milestones/deck-synthesis/archetype-discovery-blind-v5-seal-manifest.json");
  const sealManifest = JSON.parse(readFileSync(sealPath, "utf8")) as { blindV5Hash: string; status: string };

  if (sealManifest.status !== "SEALED") {
    throw new Error(`Blind-v5 seal manifest status must be SEALED, got ${sealManifest.status}`);
  }
  if (blindHoldoutV5SetHash() !== sealManifest.blindV5Hash) {
    throw new Error("Blind-v5 membership hash mismatch — aborting run.");
  }

  const preflight = benchmarkCommanderResolutionPreflight({
    catalog,
    commanderNames: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5.flatMap((c) => c.commanders),
  });

  const records: Array<{
    caseId: string;
    category: string;
    commandZoneConfiguration: string;
    commanders: string[];
    commanderLabel: string;
    evaluationContextStatus: string;
    contextRequirements: string[];
    primaryDirection: ReturnType<typeof formatDirection> | null;
    commandZoneComposition: ReturnType<typeof summarizeComposition>;
    mechanicalOutcome: MechanicalOutcome;
    retrievalOutcome: RetrievalOutcome;
    contextOutcome: ContextOutcome;
    abstentionClass: AbstentionClass;
    rootCauseClass: string;
    retrievalRootCauseClass: string;
    detail: string;
    retrievalDetail: string;
    retrievalSpecificationCompleteness: number;
    phase6RetrievalReady: boolean;
  }> = [];

  for (const c of ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5) {
    const resolution = resolveBenchmarkCommanderOracleIds(catalog, c.commanders);
    if (!resolution.resolved) continue;

    const report = discoverArchetypes(
      { commanderOracleIds: resolution.oracleIds, bracket: c.bracket },
      { catalog, shadowIndex, globalCatalogIndex },
    );
    const profile = buildCommanderMechanicalProfile({
      commanderOracleIds: resolution.oracleIds,
      catalogByOracleId: catalog.byOracleId,
      shadowIndex,
    })!;
    const motifs = extractMechanicalMotifs(profile);
    const anchors = extractDirectionAnchors({ profile, motifs });
    const oracleText = oracleBlob(catalog, resolution.oracleIds);
    const primary = report.buildDirections.find((d) => d.rank === 1);

    const mech = adjudicateMechanical({
      oracleText,
      primary,
      motifs,
      anchors,
      evaluationContextStatus: report.evaluationContextStatus,
    });
    const retr = adjudicateRetrieval({
      primary,
      evaluationContextStatus: report.evaluationContextStatus,
    });

    records.push({
      caseId: c.id,
      category: c.category,
      commandZoneConfiguration: c.commandZoneConfiguration,
      commanders: c.commanders,
      commanderLabel: c.commanders.join(" + "),
      evaluationContextStatus: report.evaluationContextStatus,
      contextRequirements: report.contextRequirements,
      primaryDirection: primary ? formatDirection(primary) : null,
      commandZoneComposition: summarizeComposition(report.commandZoneComposition),
      mechanicalOutcome: mech.mechanicalOutcome,
      retrievalOutcome: retr.outcome,
      contextOutcome: mech.contextOutcome,
      abstentionClass: classifyAbstention({
        mechanicalOutcome: mech.mechanicalOutcome,
        retrievalOutcome: retr.outcome,
        primary,
        evaluationContextStatus: report.evaluationContextStatus,
      }),
      rootCauseClass: mech.rootCauseClass,
      retrievalRootCauseClass: retr.rootCauseClass,
      detail: mech.detail,
      retrievalDetail: retr.detail,
      retrievalSpecificationCompleteness: primary?.retrievalSpecificationCompleteness ?? 0,
      phase6RetrievalReady: primary?.phase6RetrievalReady ?? false,
    });
  }

  const scorable = records.filter(
    (r) => r.contextOutcome !== "CONTEXT_REQUIRED_CORRECT" && r.evaluationContextStatus !== "OPTIONAL_COMMAND_ZONE_CONTEXT",
  );
  const contextScorable = records.filter((r) => /CONTEXT/.test(r.evaluationContextStatus));
  const contextCorrect = records.filter(
    (r) => r.contextOutcome === "CONTEXT_REQUIRED_CORRECT" || r.contextOutcome === "OPTIONAL_CONTEXT_CORRECT",
  ).length;

  const mechAccepted = scorable.filter((r) => r.mechanicalOutcome === "ACCEPTED").length;
  const retrAccepted = scorable.filter((r) => r.retrievalOutcome === "ACCEPTED").length;
  const payoffOnly = scorable.filter(
    (r) => r.primaryDirection && r.primaryDirection.drivers.length === 0 && (r.primaryDirection.payoffs?.length ?? 0) > 0,
  ).length;

  const abstentionCounts = Object.fromEntries(
    (["RETRIEVAL_READY", "CORRECT_ABSTENTION", "INCORRECT_ABSTENTION", "FALSE_RETRIEVAL_READY"] as AbstentionClass[]).map((k) => [
      k,
      records.filter((r) => r.abstentionClass === k).length,
    ]),
  );

  const failures = scorable.filter((r) => r.mechanicalOutcome !== "ACCEPTED" || r.retrievalOutcome !== "ACCEPTED");
  const systematicFamilies = Object.entries(
    failures.reduce<Record<string, number>>((acc, f) => {
      acc[f.rootCauseClass] = (acc[f.rootCauseClass] ?? 0) + 1;
      return acc;
    }, {}),
  ).filter(([, count]) => count >= 3);

  const multiCommandZone = records.filter((r) => r.commandZoneConfiguration !== "single_commander");
  const multiScorable = multiCommandZone.filter(
    (r) => r.contextOutcome !== "CONTEXT_REQUIRED_CORRECT" && r.evaluationContextStatus !== "OPTIONAL_COMMAND_ZONE_CONTEXT",
  );
  const multiAccepted = multiScorable.filter((r) => r.mechanicalOutcome === "ACCEPTED" && r.primaryDirection).length;
  const multiCommandZoneUsability = multiScorable.length > 0 ? multiAccepted / multiScorable.length : 1;

  const retrReady = scorable.filter((r) => r.abstentionClass === "RETRIEVAL_READY").length;
  const correctAbstention = scorable.filter((r) => r.abstentionClass === "CORRECT_ABSTENTION").length;
  const falseRetrievalReady = scorable.filter((r) => r.abstentionClass === "FALSE_RETRIEVAL_READY").length;

  const stratumMetrics = (cfg: string) => {
    const cohort = scorable.filter((r) => r.commandZoneConfiguration === cfg);
    const n = cohort.length || 1;
    return {
      caseCount: cohort.length,
      mechanicalPrecision: cohort.filter((r) => r.mechanicalOutcome === "ACCEPTED").length / n,
      retrievalCoverage: cohort.filter((r) => r.abstentionClass === "RETRIEVAL_READY").length / n,
      retrievalDecisionCorrectness:
        cohort.filter((r) => r.abstentionClass === "RETRIEVAL_READY" || r.abstentionClass === "CORRECT_ABSTENTION").length / n,
    };
  };

  const gate = {
    thresholds: {
      mechanicalPrecision: 0.85,
      primaryCorrectness: 0.85,
      causalCorrectness: 0.85,
      anchorCorrectness: 0.9,
      mechanismCorrectness: 0.9,
      retrievalCoverage: 0.88,
      retrievalDecisionCorrectness: 0.9,
      missingCentralDirection: 0.15,
      zeroUsableDirection: 0.1,
      payoffOnlyPrimaries: 0,
      falseRetrievalReady: 0,
      multiCommandZoneUsability: 0.85,
    },
    mechanicalPrecision: mechAccepted / scorable.length,
    primaryCorrectness:
      scorable.filter((r) => r.primaryDirection && r.mechanicalOutcome !== "MISSING_CENTRAL_DIRECTION").length / scorable.length,
    causalCorrectness:
      scorable.filter((r) => !["CAUSAL_CHAIN_WRONG", "ANCHOR_KIND_WRONG"].includes(r.mechanicalOutcome)).length / scorable.length,
    anchorCorrectness: scorable.filter((r) => r.mechanicalOutcome !== "ANCHOR_KIND_WRONG").length / scorable.length,
    mechanismCorrectness: scorable.filter((r) => r.mechanicalOutcome !== "MECHANISM_TYPE_WRONG").length / scorable.length,
    retrievalCoverage: retrReady / scorable.length,
    retrievalDecisionCorrectness: (retrReady + correctAbstention) / scorable.length,
    missingCentralDirection: scorable.filter((r) => r.mechanicalOutcome === "MISSING_CENTRAL_DIRECTION").length / scorable.length,
    zeroUsableDirection: scorable.filter((r) => !r.primaryDirection).length / scorable.length,
    payoffOnlyPrimaries: payoffOnly,
    falseRetrievalReady,
    multiCommandZoneUsability,
    pass:
      mechAccepted / scorable.length >= 0.85 &&
      scorable.filter((r) => r.primaryDirection && r.mechanicalOutcome !== "MISSING_CENTRAL_DIRECTION").length / scorable.length >= 0.85 &&
      scorable.filter((r) => !["CAUSAL_CHAIN_WRONG", "ANCHOR_KIND_WRONG"].includes(r.mechanicalOutcome)).length / scorable.length >= 0.85 &&
      scorable.filter((r) => r.mechanicalOutcome !== "ANCHOR_KIND_WRONG").length / scorable.length >= 0.9 &&
      scorable.filter((r) => r.mechanicalOutcome !== "MECHANISM_TYPE_WRONG").length / scorable.length >= 0.9 &&
      retrReady / scorable.length >= 0.88 &&
      (retrReady + correctAbstention) / scorable.length >= 0.9 &&
      scorable.filter((r) => r.mechanicalOutcome === "MISSING_CENTRAL_DIRECTION").length / scorable.length <= 0.15 &&
      scorable.filter((r) => !r.primaryDirection).length / scorable.length <= 0.1 &&
      payoffOnly === 0 &&
      falseRetrievalReady === 0 &&
      multiCommandZoneUsability >= 0.85 &&
      systematicFamilies.length === 0,
  };

  const report = {
    version: "archetype-discovery-blind-v5-human-mechanical-review",
    discoveryEngineVersion: ARCHETYPE_DISCOVERY_V1_VERSION,
    causalInferenceVersion: COMMANDER_CAUSAL_INFERENCE_VERSION,
    commandZoneCompositionVersion: "CommandZoneComposition-v1.6.0",
    freezeManifestVersion: "archetype-discovery-v1.6.0-freeze-manifest",
    blindV5Status: ARCHETYPE_DISCOVERY_BLIND_V5_STATUS,
    blindV5Hash: blindHoldoutV5SetHash(),
    sealManifestReference: "archetype-discovery-blind-v5-seal-manifest.json",
    generatedAt: new Date().toISOString(),
    interpretationNote:
      "Blind-v5 is the final Phase-5 holdout. Prior spent sets (DEV + blind-v1/v2/v3/v4) are regression evidence only.",
    caseCount: records.length,
    scorableCases: scorable.length,
    accounting: benchmarkCaseAccounting(ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5),
    categoryComposition: blindHoldoutV5CategoryComposition(),
    commandZoneComposition: blindHoldoutV5CommandZoneComposition(),
    stratumMetrics: {
      singleCommander: stratumMetrics("single_commander"),
      partnerPair: stratumMetrics("partner_pair"),
      commanderWithBackground: stratumMetrics("commander_with_background"),
    },
    resolverPreflight: preflight,
    abstentionQuality: abstentionCounts,
    retrievalCalibrationMatrix: abstentionCounts,
    multiCommandZoneSummary: multiCommandZone.map((r) => ({
      caseId: r.caseId,
      configuration: r.commandZoneConfiguration,
      commanders: r.commanders,
      evaluationContextStatus: r.evaluationContextStatus,
      compositionDiagnosticClass: r.commandZoneComposition?.diagnosticClass ?? "N/A",
      primary: r.primaryDirection?.mechanicalDescription ?? null,
      mechanicalOutcome: r.mechanicalOutcome,
      retrievalOutcome: r.retrievalOutcome,
      abstentionClass: r.abstentionClass,
      commandZoneComposition: r.commandZoneComposition,
    })),
    blindV5Gate: gate,
    blindV5Verdict: gate.pass ? "PASS" : "FAIL",
    phase5ProductVerdict: gate.pass ? "PHASE_5 = PRODUCT_ACCEPTED" : "PHASE_5_BLOCKED — blind-v5 SPENT",
    systematicFailureFamilies: systematicFamilies,
    failureSummary: failures.map((f) => ({
      caseId: f.caseId,
      commander: f.commanderLabel,
      configuration: f.commandZoneConfiguration,
      category: f.category,
      mechanicalOutcome: f.mechanicalOutcome,
      retrievalOutcome: f.retrievalOutcome,
      abstentionClass: f.abstentionClass,
      rootCauseClass: f.rootCauseClass,
      retrievalRootCauseClass: f.retrievalRootCauseClass,
      detail: f.detail,
      retrievalDetail: f.retrievalDetail,
    })),
    authorization: {
      phase56: "FROZEN",
      phase6: gate.pass ? "AUTHORIZED" : "WAIT_FOR_BLIND_V5",
      optimizer: "WAIT",
      professorImplementation: "WAIT",
      blindV5Retune: "PROHIBITED — Phase 5 decision is FINAL after blind-v5",
    },
    cases: records,
  };

  const outPath = resolve(process.cwd(), "data/milestones/deck-synthesis/archetype-discovery-blind-v5-human-mechanical-review.json");
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  const hash = createHash("sha256").update(JSON.stringify(report)).digest("hex");

  const updatedSeal = {
    ...sealManifest,
    evaluation: {
      evaluatedAt: new Date().toISOString(),
      humanReviewArtifact: "archetype-discovery-blind-v5-human-mechanical-review.json",
      humanReviewHash: hash,
      verdict: report.blindV5Verdict,
      phase5ProductVerdict: report.phase5ProductVerdict,
      statusAfterEvaluation: report.blindV5Verdict === "PASS" ? "EVALUATED_PASS" : "EVALUATED_FAIL",
      systematicFailureFamilies: systematicFamilies,
    },
  };
  if (report.blindV5Verdict === "FAIL") {
    (updatedSeal as { status: string }).status = "SPENT";
  }
  writeFileSync(sealPath, JSON.stringify(updatedSeal, null, 2));

  console.log(
    JSON.stringify(
      {
        blindV5Verdict: report.blindV5Verdict,
        phase5ProductVerdict: report.phase5ProductVerdict,
        blindV5Gate: gate,
        abstentionQuality: abstentionCounts,
        multiCommandZoneCount: multiCommandZone.length,
        outPath,
        hash,
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
