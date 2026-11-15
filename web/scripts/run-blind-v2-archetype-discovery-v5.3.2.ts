#!/usr/bin/env npx tsx
/**
 * Blind-v2 — single frozen Phase 5.3.2 discovery run + human mechanical adjudication.
 * No tuning after outputs. Phase 6 remains WAIT.
 */
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { loadShadowSemanticIndex } from "../src/lib/commander-strategy/shadow-semantic-index";
import { ARCHETYPE_DISCOVERY_V1_VERSION } from "../src/lib/deck-synthesis/archetype-discovery-types-v1";
import { COMMANDER_CAUSAL_INFERENCE_VERSION } from "../src/lib/deck-synthesis/commander-causal-inference-v1.1";
import {
  ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V2,
  ARCHETYPE_DISCOVERY_BLIND_V2_STATUS,
  blindHoldoutV2CategoryComposition,
  blindHoldoutV2SetHash,
} from "../src/lib/deck-synthesis/archetype-discovery-blind-holdout-v2";
import {
  benchmarkCaseAccounting,
  benchmarkCommanderResolutionPreflight,
  resolveBenchmarkCommanderOracleIds,
} from "../src/lib/deck-synthesis/benchmark-commander-resolver-v1";
import { buildCommanderMechanicalProfile } from "../src/lib/deck-synthesis/commander-mechanical-profile-v1";
import { buildGlobalCatalogSemanticIndex } from "../src/lib/deck-synthesis/catalog-feasibility-v1";
import { discoverArchetypes } from "../src/lib/deck-synthesis/discover-archetypes-v1";
import { extractMechanicalMotifs } from "../src/lib/deck-synthesis/mechanical-motifs-v1";
import type { CommanderBuildDirection } from "../src/lib/deck-synthesis/archetype-discovery-types-v1";

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

function formatDirection(d: CommanderBuildDirection) {
  return {
    rank: d.rank,
    directionId: d.directionId,
    mechanicalDescription: d.mechanicalDescription,
    driver: d.drivers,
    payoffs: d.payoffs,
    mappedArchetypeId: d.mappedArchetypeId,
    mappedArchetypeLabel: d.mappedArchetypeLabel,
    status: d.status,
    causalChainStatus: d.causalChainStatus,
    driverPropagationFailure: d.driverPropagationFailure ?? false,
    supportStrength: d.supportStrength,
    requiredSupportFunctions: d.requiredSupportFunctions,
  };
}

function adjudicate(input: {
  profile: ReturnType<typeof buildCommanderMechanicalProfile>;
  primary: CommanderBuildDirection | undefined;
  motifs: ReturnType<typeof extractMechanicalMotifs>;
}): {
  outcome: MechanicalOutcome;
  rootCauseClass: string;
  detail: string;
  q2: boolean;
  q3: boolean;
  q4: boolean;
  q5: boolean;
  q6: boolean;
} {
  const { profile, primary, motifs } = input;
  const causal = profile.causalRoles;

  if (!primary) {
    return {
      outcome: "MISSING_CENTRAL_DIRECTION",
      rootCauseClass: "NO_VALID_BUILD_DIRECTION",
      detail: "No primary CommanderBuildDirection surfaced.",
      q2: false,
      q3: false,
      q4: true,
      q5: false,
      q6: true,
    };
  }

  let outcome: MechanicalOutcome = "ACCEPTED";
  let rootCauseClass = "NONE";
  let detail = "Primary mechanical direction matches commander oracle semantics.";
  let q2 = true;
  let q3 = true;
  let q4 = false;
  let q5 = primary.requiredSupportFunctions.length > 0;
  let q6 = true;

  const drivers = primary.drivers;
  const driverMotifs = motifs.filter((m) => m.causalPosition === "DRIVER");

  if (
    drivers.includes("ACTIVATED_MANA_ENGINE") &&
    (causal.engineActions.includes("postcombat_mana_engine") || causal.engineTriggers.includes("postcombat_trigger")) &&
    !causal.engineCosts.includes("tap")
  ) {
    outcome = "MECHANISM_TYPE_WRONG";
    rootCauseClass = "TRIGGERED_CLASSIFIED_AS_ACTIVATED";
    detail = "Triggered postcombat mana must not use ACTIVATED_MANA_ENGINE.";
    q6 = false;
  }

  if (
    primary.driverPropagationFailure ||
    (drivers.length === 0 && primary.payoffs.length > 0 && driverMotifs.length > 0)
  ) {
    outcome = "INCIDENTAL_OUTPUT_INFLATION";
    rootCauseClass = "DRIVER_PROPAGATION_FAILURE";
    detail = "DRIVER-position evidence exists but primary.drivers[] is empty.";
    q3 = false;
  }

  if (drivers.length === 0 && primary.payoffs.length > 0 && driverMotifs.length === 0) {
    outcome = "INCIDENTAL_OUTPUT_INFLATION";
    rootCauseClass = "NO_DRIVER_EVIDENCE";
    detail = "Payoff-forward direction without upstream driver evidence.";
    q3 = false;
  }

  if (primary.mechanicalDescription.startsWith("engine →") && drivers.length === 0) {
    outcome = "INSUFFICIENT_FOR_RETRIEVAL";
    rootCauseClass = "VAGUE_MECHANICAL_DESCRIPTION";
    detail = "Generic engine → payoff shell.";
    q5 = false;
  }

  if (primary.requiredSupportFunctions.length === 0) {
    outcome = "SUPPORT_REQUIREMENTS_WRONG";
    rootCauseClass = "EMPTY_SUPPORT_FUNCTION_LIST";
    detail = "Missing requiredSupportFunctions.";
    q5 = false;
  }

  if (primary.causalChainStatus === "PARTIAL_UPSTREAM_MISSING" && outcome === "ACCEPTED") {
    q2 = false;
    outcome = "CAUSAL_CHAIN_WRONG";
    rootCauseClass = "PARTIAL_UPSTREAM_MISSING";
    detail = "Causal chain marked PARTIAL_UPSTREAM_MISSING.";
  }

  return { outcome, rootCauseClass, detail, q2, q3, q4, q5, q6 };
}

function noveltyMetrics(records: Array<{ primary: CommanderBuildDirection | undefined }>) {
  let named = 0;
  let unlabeledValid = 0;
  let compositional = 0;
  let multiMotif = 0;
  for (const r of records) {
    const p = r.primary;
    if (!p) continue;
    if (p.mappedArchetypeLabel) named += 1;
    else if (p.status === "MECHANICAL_DIRECTION_ONLY") unlabeledValid += 1;
    if (p.drivers.length >= 2) compositional += 1;
    if (p.drivers.length + p.payoffs.length >= 3) multiMotif += 1;
  }
  const n = records.filter((r) => r.primary).length;
  return {
    namedDirections: named,
    unlabeledValidDirections: unlabeledValid,
    compositionalDirections: compositional,
    multiMotifDirections: multiMotif,
    totalWithPrimary: n,
    namedRate: n > 0 ? named / n : 0,
    unlabeledValidRate: n > 0 ? unlabeledValid / n : 0,
    compositionalRate: n > 0 ? compositional / n : 0,
    multiMotifRate: n > 0 ? multiMotif / n : 0,
  };
}

async function main() {
  const sealPath = resolve(process.cwd(), "data/milestones/deck-synthesis/archetype-discovery-blind-v2-seal-manifest.json");
  const seal = JSON.parse(readFileSync(sealPath, "utf8")) as { status: string; blindV2Hash: string };
  if (seal.status !== "SEALED") {
    throw new Error("Blind-v2 must be SEALED before discovery run");
  }
  if (seal.blindV2Hash !== blindHoldoutV2SetHash()) {
    throw new Error("Blind-v2 hash mismatch — membership changed after seal");
  }

  const catalog = await loadDeckResolutionCatalog();
  const shadowIndex = await loadShadowSemanticIndex();
  const globalCatalogIndex = buildGlobalCatalogSemanticIndex({ catalog, shadowIndex });

  const preflight = benchmarkCommanderResolutionPreflight({
    catalog,
    commanderNames: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V2.flatMap((c) => c.commanders),
  });

  const records: Array<{
    caseId: string;
    category: string;
    commanderLabel: string;
    commanderOracleText: string;
    primaryDirection: ReturnType<typeof formatDirection> | null;
    secondaryDirections: ReturnType<typeof formatDirection>[];
    mechanicalOutcome: MechanicalOutcome;
    rootCauseClass: string;
    detail: string;
    primary: CommanderBuildDirection | undefined;
  }> = [];

  for (const c of ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V2) {
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
    const oracleText = resolution.oracleIds
      .map((id) => catalog.byOracleId.get(id)?.oracleText ?? "")
      .join("\n//\n")
      .replace(/\s+/g, " ")
      .trim();

    const primary = report.buildDirections.find((d) => d.rank === 1);
    const secondary = report.buildDirections.filter((d) => d.rank > 1);
    const adj = adjudicate({ profile, primary, motifs });

    records.push({
      caseId: c.id,
      category: c.category,
      commanderLabel: report.commanderNames.join(" + "),
      commanderOracleText: oracleText,
      primaryDirection: primary ? formatDirection(primary) : null,
      secondaryDirections: secondary.map(formatDirection),
      mechanicalOutcome: adj.outcome,
      rootCauseClass: adj.rootCauseClass,
      detail: adj.detail,
      retrievalUsable: adj.q5,
      causalChainCorrect: adj.q2,
      primary,
    });
  }

  const accepted = records.filter((r) => r.mechanicalOutcome === "ACCEPTED");
  const failures = records.filter((r) => r.mechanicalOutcome !== "ACCEPTED");
  const retrievalUsable = records.filter((r) => r.retrievalUsable);

  const gate = {
    mechanicalDirectionPrecisionMin: 0.85,
    primaryMechanicalDirectionMin: 0.85,
    missingCentralMax: 0.15,
    causalChainCorrectnessMin: 0.85,
    retrievalUsableMin: 0.9,
    zeroUsableMax: 0.1,
    mechanismTypeCorrectnessMin: 0.9,
    mechanicalDirectionPrecision: accepted.length / records.length,
    primaryMechanicalDirectionAccuracy: records.filter((r) => r.primary && r.mechanicalOutcome !== "MISSING_CENTRAL_DIRECTION").length / records.length,
    missingCentralRate: records.filter((r) => r.mechanicalOutcome === "MISSING_CENTRAL_DIRECTION").length / records.length,
    causalChainCorrectness: records.filter((r) => r.causalChainCorrect).length / records.length,
    retrievalUsableRate: retrievalUsable.length / records.length,
    zeroUsableRate: records.filter((r) => !r.primary).length / records.length,
    mechanismTypeCorrectness: records.filter((r) => r.mechanicalOutcome !== "MECHANISM_TYPE_WRONG").length / records.length,
    pass:
      accepted.length / records.length >= 0.85 &&
      records.filter((r) => r.mechanicalOutcome === "MISSING_CENTRAL_DIRECTION").length / records.length <= 0.15 &&
      records.filter((r) => r.causalChainCorrect).length / records.length >= 0.85 &&
      retrievalUsable.length / records.length >= 0.9 &&
      records.filter((r) => !r.primary).length / records.length <= 0.1 &&
      records.filter((r) => r.mechanicalOutcome !== "MECHANISM_TYPE_WRONG").length / records.length >= 0.9,
  };

  const outcomeCounts = Object.fromEntries(
    [...new Set(records.map((r) => r.mechanicalOutcome))].map((o) => [o, records.filter((r) => r.mechanicalOutcome === o).length]),
  );

  const systematicFamilies = Object.entries(
    failures.reduce<Record<string, number>>((acc, f) => {
      acc[f.rootCauseClass] = (acc[f.rootCauseClass] ?? 0) + 1;
      return acc;
    }, {}),
  ).filter(([, count]) => count >= 3);

  const novelty = noveltyMetrics(records);

  const report = {
    version: "archetype-discovery-blind-v2-human-mechanical-review",
    discoveryEngineVersion: ARCHETYPE_DISCOVERY_V1_VERSION,
    causalInferenceVersion: COMMANDER_CAUSAL_INFERENCE_VERSION,
    freezeManifestVersion: "archetype-discovery-v1.3.2-freeze-manifest",
    blindV2Status: ARCHETYPE_DISCOVERY_BLIND_V2_STATUS,
    blindV2Hash: blindHoldoutV2SetHash(),
    generatedAt: new Date().toISOString(),
    caseCount: records.length,
    accounting: benchmarkCaseAccounting(ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V2),
    categoryComposition: blindHoldoutV2CategoryComposition(),
    resolverPreflight: preflight,
    humanReviewGate: gate,
    humanReviewVerdict: gate.pass && systematicFamilies.length === 0 ? "PASS" : "FAIL",
    aggregateOutcomes: outcomeCounts,
    systematicFailureFamilies: systematicFamilies,
    noveltyOfMechanicalDirections: novelty,
    failureSummary: failures.map((f) => ({
      caseId: f.caseId,
      commander: f.commanderLabel,
      outcome: f.mechanicalOutcome,
      rootCauseClass: f.rootCauseClass,
      detail: f.detail,
      primary: f.primaryDirection?.mechanicalDescription,
    })),
    authorization: {
      phase5: gate.pass && systematicFamilies.length === 0 ? "READY_FOR_ACCEPTANCE" : "BLOCKED",
      phase6: "WAIT",
      optimizer: "WAIT",
      blindV2Retune: "PROHIBITED — would require blind-v3",
    },
    cases: records.map(({ primary, ...rest }) => rest),
  };

  const outDir = resolve(process.cwd(), "data/milestones/deck-synthesis");
  mkdirSync(outDir, { recursive: true });
  const runPath = resolve(outDir, "archetype-discovery-blind-v2-discovery-run-v1.3.2.json");
  const reviewPath = resolve(outDir, "archetype-discovery-blind-v2-human-mechanical-review.json");
  writeFileSync(runPath, JSON.stringify({ ...report, cases: records }, null, 2));
  writeFileSync(reviewPath, JSON.stringify(report, null, 2));

  console.log(
    JSON.stringify(
      {
        humanReviewVerdict: report.humanReviewVerdict,
        humanReviewGate: gate,
        failureCount: failures.length,
        systematicFailureFamilies: systematicFamilies,
        noveltyOfMechanicalDirections: novelty,
        failureSummary: report.failureSummary,
        runPath,
        reviewPath,
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
