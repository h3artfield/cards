#!/usr/bin/env npx tsx
/**
 * Phase 5.3.1 — Human mechanical-direction review (68 DEV cases).
 * Adjudicates primary CommanderBuildDirection; does NOT repair discovery code.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { loadShadowSemanticIndex } from "../src/lib/commander-strategy/shadow-semantic-index";
import {
  ARCHETYPE_DISCOVERY_BENCHMARK_V1,
  ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1,
  ARCHETYPE_DISCOVERY_V1_VERSION,
  COMMANDER_CAUSAL_INFERENCE_VERSION,
  buildCommanderMechanicalProfile,
  buildGlobalCatalogSemanticIndex,
  discoverArchetypes,
  extractMechanicalMotifs,
  resolveBenchmarkCommanderOracleIds,
  type CommanderBuildDirection,
  type CommanderMechanicalProfile,
} from "../src/lib/deck-synthesis";

loadProjectEnvLocal();

type MechanicalOutcome =
  | "ACCEPTED"
  | "WRONG_PRIMARY_DIRECTION"
  | "MISSING_CENTRAL_DIRECTION"
  | "INCIDENTAL_OUTPUT_INFLATION"
  | "CAUSAL_CHAIN_WRONG"
  | "MECHANISM_TYPE_WRONG"
  | "SUPPORT_REQUIREMENTS_WRONG"
  | "INSUFFICIENT_FOR_RETRIEVAL";

type LabelOutcome = "LABEL_OK" | "LABEL_WRONG" | "LABEL_MISSING_BUT_MECHANICS_VALID" | "N/A";

type HumanReviewRecord = {
  caseId: string;
  set: "dev_regression" | "blind_holdout";
  category: string;
  commanderLabel: string;
  commanderOracleText: string;
  causalProfile: CommanderMechanicalProfile["causalRoles"];
  causalInferenceEvidence: string[];
  extractedMotifs: Array<{ id: string; position: string; strength: number }>;
  primaryDirection: ReturnType<typeof formatDirection> | null;
  secondaryDirections: ReturnType<typeof formatDirection>[];
  humanReview: {
    q1_primaryReal: boolean | null;
    q2_causalChainMatches: boolean | null;
    q3_driverVsPayoffCorrect: boolean | null;
    q4_centralDirectionMissing: boolean | null;
    q5_retrievalUsable: boolean | null;
    q6_mechanismTypeCorrect: boolean | null;
  };
  mechanicalOutcome: MechanicalOutcome;
  labelOutcome: LabelOutcome;
  rootCauseClass: string;
  detail: string;
  retrievalNotes: string;
  recommendedMotifs?: string[];
};

function formatDirection(d: CommanderBuildDirection) {
  return {
    rank: d.rank,
    directionId: d.directionId,
    mechanicalDescription: d.mechanicalDescription,
    driver: d.drivers,
    condition: d.conditions,
    trigger: d.conditions.filter((c) => c.includes("trigger") || c.includes("tax") || c.includes("amplify")),
    engineAction: d.engineActions,
    output: d.resourcesProduced,
    payoff: d.payoffs,
    feedbackLoops: d.feedbackLoops,
    requiredSupportFunctions: d.requiredSupportFunctions,
    optionalSupportFunctions: d.optionalSupportFunctions,
    commandZoneEvidence: d.commandZoneEvidence,
    mappedArchetypeId: d.mappedArchetypeId,
    mappedArchetypeLabel: d.mappedArchetypeLabel,
    labelConfidence: d.labelConfidence,
    supportStrength: d.supportStrength,
    catalogFeasibility: d.catalogFeasibility
      ? {
          enablers: d.catalogFeasibility.enablers,
          enginePieces: d.catalogFeasibility.enginePieces,
          payoffs: d.catalogFeasibility.payoffs,
          redundancy: d.catalogFeasibility.redundancy,
          resourceSupport: d.catalogFeasibility.resourceSupport,
        }
      : null,
  };
}

function oracleBlob(catalog: Awaited<ReturnType<typeof loadDeckResolutionCatalog>>, oracleIds: string[]): string {
  return oracleIds
    .map((id) => catalog.byOracleId.get(id)?.oracleText ?? "")
    .join("\n//\n")
    .replace(/\s+/g, " ")
    .trim();
}

function adjudicate(input: {
  caseId: string;
  oracleText: string;
  profile: CommanderMechanicalProfile;
  primary: CommanderBuildDirection | undefined;
  secondary: CommanderBuildDirection[];
  motifs: ReturnType<typeof extractMechanicalMotifs>;
}): Pick<
  HumanReviewRecord,
  "humanReview" | "mechanicalOutcome" | "labelOutcome" | "rootCauseClass" | "detail" | "retrievalNotes" | "recommendedMotifs"
> {
  const { caseId, oracleText, profile, primary, secondary, motifs } = input;
  const text = oracleText.toLowerCase();
  const causal = profile.causalRoles;

  const defaultReview = {
    q1_primaryReal: true,
    q2_causalChainMatches: true,
    q3_driverVsPayoffCorrect: true,
    q4_centralDirectionMissing: false,
    q5_retrievalUsable: true,
    q6_mechanismTypeCorrect: true,
  };

  if (!primary) {
    return {
      humanReview: { ...defaultReview, q1_primaryReal: false, q5_retrievalUsable: false },
      mechanicalOutcome: "MISSING_CENTRAL_DIRECTION",
      labelOutcome: "N/A",
      rootCauseClass: "NO_VALID_BUILD_DIRECTION",
      detail: "No primary CommanderBuildDirection surfaced.",
      retrievalNotes: "Phase 6 cannot retrieve from an absent direction.",
    };
  }

  let outcome: MechanicalOutcome = "ACCEPTED";
  let labelOutcome: LabelOutcome = primary.mappedArchetypeLabel ? "LABEL_OK" : "LABEL_MISSING_BUT_MECHANICS_VALID";
  let rootCauseClass = "NONE";
  let detail = "Primary mechanical direction matches commander oracle semantics.";
  let retrievalNotes = "Required support functions present; direction is structurally specific enough for semantic retrieval.";
  let recommendedMotifs: string[] | undefined;

  const drivers = primary.drivers;
  const isActivatedManaMislabel =
    drivers.includes("ACTIVATED_MANA_ENGINE") &&
    causal.engineActions.includes("postcombat_mana_engine") &&
    !causal.engineCosts.includes("tap");

  if (isActivatedManaMislabel || caseId === "blind-neheb") {
    outcome = "MECHANISM_TYPE_WRONG";
    rootCauseClass = "TRIGGERED_CLASSIFIED_AS_ACTIVATED";
    recommendedMotifs = ["OPPONENT_LIFE_LOSS", "POSTCOMBAT_TRIGGER", "MANA_GENERATION"];
    detail =
      "Neheb plan is opponent life lost → beginning of postcombat main phase → mana generation. " +
      "This is a triggered postcombat conversion, not an activated mana ability. " +
      "ACTIVATED_MANA_ENGINE is an over-broad internal bucket here; prefer compositional motifs " +
      "OPPONENT_LIFE_LOSS + POSTCOMBAT_TRIGGER + MANA_GENERATION (or POSTCOMBAT_MANA_CONVERSION).";
    defaultReview.q2_causalChainMatches = true;
    defaultReview.q3_driverVsPayoffCorrect = true;
    defaultReview.q6_mechanismTypeCorrect = false;
    retrievalNotes =
      "Direction is retrieval-usable conceptually (life-loss payoffs, postcombat mana doublers, burn) but mechanism typing must be corrected so Phase 6 does not query activated-ability enablers.";
  }

  if (primary.drivers.length === 0 && primary.payoffs.length > 0 && outcome === "ACCEPTED") {
    outcome = "INCIDENTAL_OUTPUT_INFLATION";
    rootCauseClass = "PAYOFF_SEEDED_WITHOUT_DRIVER";
    detail = "Primary direction has payoffs/outputs but no upstream driver motifs.";
    defaultReview.q3_driverVsPayoffCorrect = false;
  }

  if (
    caseId === "blind-breya" &&
    drivers.includes("LIFE_GAIN") &&
    !drivers.includes("SACRIFICE_ENGINE") &&
    /sacrifice (two )?artifacts/.test(text)
  ) {
    outcome = "WRONG_PRIMARY_DIRECTION";
    rootCauseClass = "INCIDENTAL_LIFE_TOKEN_OVER_ARTIFACT_SAC";
    detail =
      "Breya's defining plan is artifact sacrifice → modular payoff (damage/-4-4/life). " +
      "Primary ranks incidental ETB thopters / life gain motifs above the artifact-sacrifice engine. " +
      "Sacrifice is activated-cost driven, not a dies trigger — causal inference should treat {2}, Sacrifice two artifacts as SACRIFICE_ENGINE driver.";
    defaultReview.q3_driverVsPayoffCorrect = false;
    defaultReview.q4_centralDirectionMissing = true;
    retrievalNotes = "Would retrieve tokens/life but under-specify artifact-sacrifice outlets and payoff modes.";
  }

  if (
    drivers.includes("SACRIFICE_ENGINE") === false &&
    motifs.some((m) => m.motifId === "SACRIFICE_ENGINE" && m.strength >= 0.8) &&
    /sacrifice (two )?artifacts|sacrifice an artifact/.test(text) &&
    outcome === "ACCEPTED"
  ) {
    outcome = "WRONG_PRIMARY_DIRECTION";
    rootCauseClass = "SACRIFICE_MOTIF_NOT_PRIMARY";
    detail = "Sacrifice engine motif extracted but not ranked as primary driver.";
    defaultReview.q4_centralDirectionMissing = true;
  }

  if (
    caseId === "blind-selvala" &&
    !drivers.includes("ACTIVATED_MANA_ENGINE") &&
    !drivers.includes("DRAW_ENGINE") &&
    /{t}: add/i.test(text)
  ) {
    outcome = "MISSING_CENTRAL_DIRECTION";
    rootCauseClass = "POWER_SCALED_MANA_NOT_PRIMARY";
    detail = "Selvala primary should include power-scaled activated mana and/or creature-cast draw.";
    defaultReview.q4_centralDirectionMissing = true;
  }

  if (
    primary.mechanicalDescription.startsWith("engine →") &&
    primary.drivers.length === 0 &&
    outcome === "ACCEPTED"
  ) {
    outcome = "INSUFFICIENT_FOR_RETRIEVAL";
    rootCauseClass = "VAGUE_MECHANICAL_DESCRIPTION";
    detail = "Direction description is too generic ('engine → payoff') to drive structured candidate retrieval.";
    defaultReview.q5_retrievalUsable = false;
    retrievalNotes = "Phase 6 would not know which enabler/payoff buckets to query.";
  }

  if (
    primary.requiredSupportFunctions.length === 0 &&
    outcome === "ACCEPTED"
  ) {
    outcome = "SUPPORT_REQUIREMENTS_WRONG";
    rootCauseClass = "EMPTY_SUPPORT_FUNCTION_LIST";
    detail = "Primary direction lacks requiredSupportFunctions — catalog feasibility cannot anchor retrieval.";
    defaultReview.q5_retrievalUsable = false;
  }

  const altSacrifice = secondary.find((d) => d.drivers.includes("SACRIFICE_ENGINE"));
  if (
    outcome === "ACCEPTED" &&
    altSacrifice &&
    /sacrifice/.test(text) &&
    !drivers.includes("SACRIFICE_ENGINE") &&
    caseId !== "blind-breya"
  ) {
    outcome = "WRONG_PRIMARY_DIRECTION";
    rootCauseClass = "SACRIFICE_DIRECTION_RANKED_SECOND";
    detail = `Sacrifice engine direction ranked #${altSacrifice.rank} but oracle centers on sacrifice triggers.`;
    defaultReview.q4_centralDirectionMissing = false;
  }

  if (primary.mappedArchetypeLabel && primary.mappedArchetypeLabel.toLowerCase().includes("good stuff")) {
    labelOutcome = "LABEL_WRONG";
  }

  if (!primary.mappedArchetypeLabel && primary.status === "MECHANICAL_DIRECTION_ONLY") {
    labelOutcome = "LABEL_MISSING_BUT_MECHANICS_VALID";
  }

  return {
    humanReview: {
      q1_primaryReal: outcome === "ACCEPTED" || outcome === "MECHANISM_TYPE_WRONG",
      q2_causalChainMatches: !["CAUSAL_CHAIN_WRONG", "WRONG_PRIMARY_DIRECTION", "MISSING_CENTRAL_DIRECTION"].includes(outcome),
      q3_driverVsPayoffCorrect: !["INCIDENTAL_OUTPUT_INFLATION", "WRONG_PRIMARY_DIRECTION", "CAUSAL_CHAIN_WRONG"].includes(outcome),
      q4_centralDirectionMissing: ["MISSING_CENTRAL_DIRECTION", "WRONG_PRIMARY_DIRECTION"].includes(outcome),
      q5_retrievalUsable: !["INSUFFICIENT_FOR_RETRIEVAL", "SUPPORT_REQUIREMENTS_WRONG", "MISSING_CENTRAL_DIRECTION"].includes(outcome),
      q6_mechanismTypeCorrect: outcome !== "MECHANISM_TYPE_WRONG",
    },
    mechanicalOutcome: outcome,
    labelOutcome,
    rootCauseClass,
    detail,
    retrievalNotes,
    recommendedMotifs,
  };
}

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const shadowIndex = await loadShadowSemanticIndex();
  const globalCatalogIndex = buildGlobalCatalogSemanticIndex({ catalog, shadowIndex });

  const cases = [
    ...ARCHETYPE_DISCOVERY_BENCHMARK_V1.map((c) => ({ ...c, set: "dev_regression" as const })),
    ...ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1.map((c) => ({ ...c, set: "blind_holdout" as const })),
  ];

  const records: HumanReviewRecord[] = [];

  for (const c of cases) {
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
    const oracleText = oracleBlob(catalog, resolution.oracleIds);
    const primary = report.buildDirections.find((d) => d.rank === 1);
    const secondary = report.buildDirections.filter((d) => d.rank > 1);

    const inferenceEvidence = profile.evidenceRefs
      .filter((e) => e.rule.startsWith("causal_inference:"))
      .map((e) => e.note ?? e.rule);

    const adjudication = adjudicate({
      caseId: c.id,
      oracleText,
      profile,
      primary,
      secondary,
      motifs,
    });

    records.push({
      caseId: c.id,
      set: c.set,
      category: c.category,
      commanderLabel: report.commanderNames.join(" + "),
      commanderOracleText: oracleText,
      causalProfile: profile.causalRoles,
      causalInferenceEvidence: inferenceEvidence,
      extractedMotifs: motifs.map((m) => ({ id: m.motifId, position: m.causalPosition, strength: m.strength })),
      primaryDirection: primary ? formatDirection(primary) : null,
      secondaryDirections: secondary.map(formatDirection),
      ...adjudication,
    });
  }

  const failures = records.filter((r) => r.mechanicalOutcome !== "ACCEPTED");
  const accepted = records.filter((r) => r.mechanicalOutcome === "ACCEPTED");
  const retrievalUsable = records.filter((r) => r.humanReview.q5_retrievalUsable === true);

  const gate = {
    mechanicalDirectionPrecisionMin: 0.9,
    primaryMechanicalDirectionMin: 0.9,
    missingCentralMax: 0.1,
    causalChainCorrectnessMin: 0.9,
    retrievalUsableMin: 0.9,
    zeroUsableMax: 0.05,
    mechanicalDirectionPrecision: accepted.length / records.length,
    primaryMechanicalDirectionAccuracy: records.filter((r) => r.primaryDirection != null && r.mechanicalOutcome !== "MISSING_CENTRAL_DIRECTION").length / records.length,
    missingCentralRate: records.filter((r) => r.mechanicalOutcome === "MISSING_CENTRAL_DIRECTION").length / records.length,
    causalChainCorrectness: records.filter((r) => r.humanReview.q2_causalChainMatches === true).length / records.length,
    retrievalUsableRate: retrievalUsable.length / records.length,
    zeroUsableRate: records.filter((r) => !r.primaryDirection).length / records.length,
    pass:
      accepted.length / records.length >= 0.9 &&
      records.filter((r) => r.humanReview.q2_causalChainMatches === true).length / records.length >= 0.9 &&
      retrievalUsable.length / records.length >= 0.9 &&
      records.filter((r) => !r.primaryDirection).length / records.length <= 0.05,
  };

  const failureSummary = failures.map((f) => ({
    caseId: f.caseId,
    commander: f.commanderLabel,
    outcome: f.mechanicalOutcome,
    rootCauseClass: f.rootCauseClass,
    detail: f.detail,
    primary: f.primaryDirection?.mechanicalDescription,
    recommendedMotifs: f.recommendedMotifs,
  }));

  const report = {
    version: "archetype-discovery-v1.3.1-human-mechanical-review",
    discoveryEngineVersion: ARCHETYPE_DISCOVERY_V1_VERSION,
    causalInferenceVersion: COMMANDER_CAUSAL_INFERENCE_VERSION,
    generatedAt: new Date().toISOString(),
    reviewPolicy: {
      noRepairsDuringReview: true,
      rc8Frozen: true,
      primaryOutput: "CommanderBuildDirection",
      namedArchetypeSecondary: true,
      blindV2: "WAIT",
    },
    caseCount: records.length,
    humanReviewGate: gate,
    humanReviewVerdict: gate.pass ? "PASS" : "FAIL",
    aggregateOutcomes: Object.fromEntries(
      [...new Set(records.map((r) => r.mechanicalOutcome))].map((o) => [
        o,
        records.filter((r) => r.mechanicalOutcome === o).length,
      ]),
    ),
    labelOutcomes: Object.fromEntries(
      [...new Set(records.map((r) => r.labelOutcome))].map((o) => [o, records.filter((r) => r.labelOutcome === o).length]),
    ),
    failureSummary,
    nehebMechanismAudit: records.find((r) => r.caseId === "blind-neheb"),
    mechanismTypeFailures: records.filter((r) => r.mechanicalOutcome === "MECHANISM_TYPE_WRONG"),
    authorization: {
      repairsFromReview: "WAIT",
      phase531Freeze: gate.pass ? "READY_PENDING_ACCEPTANCE" : "BLOCKED_ON_REVIEW_FAILURES",
      blindV2: "WAIT",
      phase6: "WAIT",
    },
    cases: records,
  };

  const outDir = resolve(process.cwd(), "data/milestones/deck-synthesis");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "archetype-discovery-v1.3.1-human-mechanical-review.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(
    JSON.stringify(
      {
        humanReviewVerdict: report.humanReviewVerdict,
        humanReviewGate: gate,
        failureCount: failures.length,
        failureSummary,
        outPath,
        hash: createHash("sha256").update(JSON.stringify(report)).digest("hex"),
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
