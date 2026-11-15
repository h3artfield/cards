/**
 * PROFESSOR v4.17 Slice 5.4 — freeze Chatterfang pre-Critic review bundle + independent verification.
 * Does NOT call Critic or Head Professor / GPT-5.6 Sol.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadDeckResolutionCatalog, isCurrentlyCommanderLegal } from "./lib/load-deck-resolution-catalog";
import { commanderLegalInIdentity } from "@/lib/semantic-visualization/filters-v1";
import {
  SLICE3_LIVE_COMMANDER_SPECS_V417,
  resolveCommanderBlueprintFromCatalogV417,
} from "../src/lib/deck-synthesis/professor-commander-catalog-v4-17-v1";
import { buildBlueprintFromSolProposalV417 } from "../src/lib/deck-synthesis/professor-sol-blueprint-live-v4-17-v1";
import { validateSolBlueprintProposalV417 } from "../src/lib/deck-synthesis/professor-sol-blueprint-proposal-v4-17-v1";
import { coerceSolBlueprintProposalRawV417 } from "../src/lib/deck-synthesis/professor-sol-blueprint-coercion-v4-17-v1";
import { assembleDeckFromBlueprintV417 } from "../src/lib/deck-synthesis/professor-brew-blueprint-assembly-v4-17-v1";
import {
  freezePreCriticDeckV417,
  runDeterministicAuditsV417,
} from "../src/lib/deck-synthesis/professor-brew-blueprint-audit-v4-17-v1";
import { libraryCountV417 } from "../src/lib/deck-synthesis/professor-brew-blueprint-mana-v4-17-v1";
import {
  computeFunctionalDensityStatesV417,
  mandatoryStructureSatisfiedV417,
  preferredCoverageRemainingV417,
} from "../src/lib/deck-synthesis/professor-brew-blueprint-functional-density-v4-17-v1";
import { computePackageDensityStatesV417 } from "../src/lib/deck-synthesis/professor-brew-blueprint-package-density-v4-17-v1";
import { buildAccessPortfolioStateV417 } from "../src/lib/deck-synthesis/professor-brew-blueprint-access-v4-17-v1";
import type { VerifiedAccessRouteV4164 } from "../src/lib/deck-synthesis/professor-verified-access-route-v4-16-4-v1";
import { COMMANDER_DECK_LIBRARY_SIZE_V47 } from "../src/lib/deck-synthesis/professor-deck-completion-v4-7-v1";

const VERSION = "professor-v4-17-slice5-4-review-bundle-v1";

function loadEnvLocal() {
  for (const rel of [".env.local", "web/.env.local"]) {
    const path = resolve(process.cwd(), rel);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

loadEnvLocal();

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function loadSavedProposal(caseId: string) {
  const inDir = existsSync(resolve(process.cwd(), "data/milestones/deck-synthesis/v4-17-slice3-live-sol"))
    ? resolve(process.cwd(), "data/milestones/deck-synthesis/v4-17-slice3-live-sol")
    : resolve(process.cwd(), "web/data/milestones/deck-synthesis/v4-17-slice3-live-sol");
  const saved = JSON.parse(readFileSync(resolve(inDir, `${caseId}-report.json`), "utf8")) as Record<string, unknown>;
  const spec = SLICE3_LIVE_COMMANDER_SPECS_V417.find((s) => s.caseId === caseId)!;
  let proposal = saved.proposal as Record<string, unknown> | undefined;
  if (!proposal && saved.rawParsed) {
    proposal = validateSolBlueprintProposalV417(
      coerceSolBlueprintProposalRawV417(saved.rawParsed as Record<string, unknown>, {
        requestedBracket: spec.requestedBracket,
      }),
    ) as unknown as Record<string, unknown>;
  }
  return { spec, proposal: validateSolBlueprintProposalV417(proposal!) };
}

function analyzeAccessRoutes(routes: VerifiedAccessRouteV4164[]) {
  const uniquePairs = new Set(routes.map((r) => `${r.sourceOracleId}→${r.targetOracleId}`));
  const uniqueTargets = new Set(routes.map((r) => r.targetOracleId));
  const uniqueSources = new Set(routes.map((r) => r.sourceOracleId));
  const byRestriction = new Map<string, number>();
  for (const r of routes) {
    byRestriction.set(r.searchRestriction, (byRestriction.get(r.searchRestriction) ?? 0) + 1);
  }
  const duplicateEquivalentTargets = routes.filter(
    (r, i, arr) => arr.findIndex((x) => x.targetOracleId === r.targetOracleId && x.sourceOracleId === r.sourceOracleId) !== i,
  );
  return {
    rawRouteCount: routes.length,
    uniqueSourceTargetPairs: uniquePairs.size,
    uniqueTargetOracleIds: uniqueTargets.size,
    uniqueSourceOracleIds: uniqueSources.size,
    routesPerToolAvg: uniqueSources.size ? routes.length / uniqueSources.size : 0,
    restrictionBreakdown: Object.fromEntries(byRestriction),
    duplicatePairCount: duplicateEquivalentTargets.length,
    inflationRisk:
      routes.length > uniquePairs.size
        ? "DUPLICATE_PAIRS_PRESENT"
        : [...byRestriction.entries()].some(([k, n]) => n > 15 && /creature|any|land/.test(k))
          ? "BROAD_RESTRICTION_MANY_TARGETS"
          : "LOW",
  };
}

function verifyDeckFromCatalog(args: {
  commanderOracleId: string;
  nonlandOracleIds: string[];
  landNames: string[];
  catalog: Awaited<ReturnType<typeof loadDeckResolutionCatalog>>;
}) {
  const issues: string[] = [];
  const commander = args.catalog.byOracleId.get(args.commanderOracleId);
  if (!commander) issues.push(`COMMANDER_NOT_IN_CATALOG:${args.commanderOracleId}`);
  const colorIdentity = commander?.colorIdentity ?? commander?.colors ?? [];

  const nonlandDupes = args.nonlandOracleIds.filter((id, i) => args.nonlandOracleIds.indexOf(id) !== i);
  if (nonlandDupes.length) issues.push(`NONLAND_DUPLICATE_ORACLE_IDS:${nonlandDupes.length}`);

  const landDupes = args.landNames.filter((n, i) => args.landNames.indexOf(n) !== i);
  if (landDupes.length) issues.push(`LAND_DUPLICATE_NAMES:${landDupes.length}`);

  const offColor: string[] = [];
  const notLegal: string[] = [];
  const nonlandCards = args.nonlandOracleIds.map((id) => {
    const card = args.catalog.byOracleId.get(id);
    if (!card) {
      issues.push(`NONLAND_MISSING_FROM_CATALOG:${id}`);
      return null;
    }
    if (!isCurrentlyCommanderLegal(card)) notLegal.push(card.canonicalName);
    if (!commanderLegalInIdentity(card.colorIdentity ?? card.colors ?? [], colorIdentity)) offColor.push(card.canonicalName);
    return card;
  });

  const mainDeckCount = args.nonlandOracleIds.length + args.landNames.length;
  if (mainDeckCount !== COMMANDER_DECK_LIBRARY_SIZE_V47) {
    issues.push(`MAIN_DECK_COUNT:${mainDeckCount}_EXPECTED_${COMMANDER_DECK_LIBRARY_SIZE_V47}`);
  }

  return {
    pass: issues.length === 0 && notLegal.length === 0 && offColor.length === 0,
    mainDeckCount,
    commanderName: commander?.canonicalName ?? null,
    commanderColorIdentity: colorIdentity,
    nonlandCount: args.nonlandOracleIds.length,
    landCount: args.landNames.length,
    landNamesListed: args.landNames,
    duplicateNonlandOracleIds: [...new Set(nonlandDupes)],
    duplicateLandNames: [...new Set(landDupes)],
    offColorCards: offColor,
    notCommanderLegalCards: notLegal,
    issues,
    nonlandCardList: nonlandCards
      .filter(Boolean)
      .map((c) => ({ oracleId: c!.oracleId, name: c!.canonicalName, colors: c!.colorIdentity ?? c!.colors ?? [] })),
  };
}

function roleBucket(primaryFunction: string): string {
  const map: Record<string, string> = {
    ENGINE: "ENGINE",
    ENGINE_ENABLER: "ENABLER",
    ENGINE_PAYOFF: "PAYOFF",
    GRAVEYARD_ENABLER: "ENABLER",
    RESOURCE_PRODUCTION: "FUEL",
    RESOURCE_CONSUMER: "CONVERSION",
    PROTECTION: "PROTECTION",
    RECOVERY: "RECOVERY",
    WIN_COMPONENT: "FINISHER",
    INTERACTION: "INTERACTION",
    ACCESS: "ACCESS",
    ACCELERATION: "MANA",
    CARD_VELOCITY: "FUEL",
    FLEX: "FLEX",
  };
  return map[primaryFunction] ?? primaryFunction;
}

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const sliceDir = existsSync(resolve(process.cwd(), "web/data/milestones/deck-synthesis/v4-17-slice5-4-assembly"))
    ? resolve(process.cwd(), "web/data/milestones/deck-synthesis/v4-17-slice5-4-assembly")
    : resolve(process.cwd(), "data/milestones/deck-synthesis/v4-17-slice5-4-assembly");
  const outDir = resolve(sliceDir, "../v4-17-slice5-4-review-bundle");
  mkdirSync(outDir, { recursive: true });

  const artifactHashes = {
    slice54Summary: sha256File(resolve(sliceDir, "slice5-4-summary.json")),
    chatterfangReport: sha256File(resolve(sliceDir, "tokens-chatterfang-slice5-4-report.json")),
    kessReport: sha256File(resolve(sliceDir, "spellslinger-kess-slice5-4-report.json")),
  };

  // Re-assemble Chatterfang deterministically to capture full blueprint + audits
  const { spec: cfSpec, proposal: cfProposal } = loadSavedProposal("tokens-chatterfang");
  const cfCommander = resolveCommanderBlueprintFromCatalogV417({ catalog, commanderName: cfSpec.commanderName });
  const cfBlueprint0 = buildBlueprintFromSolProposalV417({
    commander: cfCommander,
    userIntent: {
      format: "Commander",
      bracket: cfSpec.requestedBracket,
      playStyle: cfSpec.archetype,
      commanderDependence: "medium",
      comboPolicy: "no infinite combos",
    },
    proposal: cfProposal,
  });
  const cfAssembly = assembleDeckFromBlueprintV417(cfBlueprint0, {
    catalog,
    maxIterations: 96,
    maxScan: 12000,
    maxEvaluate: 500,
    minQualityScore: 35,
  });
  const bp = cfAssembly.blueprint;
  const preCritic = freezePreCriticDeckV417(bp);
  const audits = runDeterministicAuditsV417(bp);
  const accessPortfolio = buildAccessPortfolioStateV417({ blueprint: bp, catalog });
  const landNames = bp.manaPlan.selectedLands;

  const independentVerification = verifyDeckFromCatalog({
    commanderOracleId: preCritic.commanderOracleId,
    nonlandOracleIds: preCritic.nonlandOracleIds,
    landNames,
    catalog,
  });

  const functionalDensities = computeFunctionalDensityStatesV417(bp, catalog);
  const packageDensities = computePackageDensityStatesV417(bp);

  const roleBreakdown: Record<string, number> = {};
  for (const card of bp.selectedCards) {
    const bucket = roleBucket(card.primaryFunction);
    roleBreakdown[bucket] = (roleBreakdown[bucket] ?? 0) + 1;
  }

  const deckCapacityLedger = {
    version: VERSION,
    caseId: "tokens-chatterfang",
    frozenAt: "pre-critic",
    targetDeckSize: COMMANDER_DECK_LIBRARY_SIZE_V47 + 1,
    commandZoneCount: 1,
    mainDeckTarget: COMMANDER_DECK_LIBRARY_SIZE_V47,
    selectedNonlands: bp.selectedCards.length,
    selectedLands: landNames.length,
    mainDeckCount: libraryCountV417(bp),
    openSlots: Math.max(0, COMMANDER_DECK_LIBRARY_SIZE_V47 - libraryCountV417(bp)),
    commander: {
      name: bp.commander.name,
      oracleId: bp.commander.oracleId,
      colorIdentity: bp.commander.colorIdentity,
    },
    roleBreakdown,
    packageBudgets: packageDensities.map((p) => ({
      packageId: p.packageId,
      current: p.currentPhysicalContribution,
      minimum: p.minimumPhysicalContribution,
      preferred: p.preferredPhysicalContribution,
      status: p.status,
    })),
    functionalBudgets: functionalDensities
      .filter((d) => d.status !== "UNRESOLVED" && d.category !== "lands")
      .map((d) => ({
        budgetId: d.budgetId,
        category: d.category,
        current: d.currentDistinctContributors,
        minimum: d.minimum,
        preferred: d.preferred,
        status: d.status,
      })),
    mandatoryStructureSatisfied: mandatoryStructureSatisfiedV417(bp),
    preferredCoverageRemaining: preferredCoverageRemainingV417(bp),
    openRequirements: bp.openRequirements
      .filter((r) => r.status === "OPEN" || r.status === "PARTIAL")
      .map((r) => ({ requirementId: r.requirementId, status: r.status, family: r.family })),
  };

  const accessRouteAnalysis = analyzeAccessRoutes(accessPortfolio.verifiedRoutes);

  const chatterfangBundle = {
    version: VERSION,
    status: "FROZEN_PRE_CRITIC_HOLD",
    authorization: {
      critic: "NOT_AUTHORIZED",
      headProfessorSol: "NOT_AUTHORIZED",
      commander10: "NOT_AUTHORIZED",
    },
    assembly: {
      success: cfAssembly.success,
      failure: cfAssembly.failure,
      summary: cfAssembly.summary,
      pickCount: cfAssembly.decisions.length,
      structuralNonlandClosure: bp.selectedCards.length,
      chosenLandCount: landNames.length,
    },
    deckCapacityLedger,
    preCriticDeck: {
      ...preCritic,
      commander: { name: bp.commander.name, oracleId: bp.commander.oracleId },
      nonlands: bp.selectedCards.map((c) => ({
        oracleId: c.oracleId,
        name: c.name,
        primaryRequirementId: c.primaryRequirementId,
        primaryFunction: c.primaryFunction,
        satisfiedFunctions: c.satisfiedFunctions,
        packageIds: c.packageIds,
      })),
      lands: landNames.map((name) => ({ name, quantity: 1 })),
    },
    independentVerification,
    deterministicAudit: audits,
    manaFrontier: cfAssembly.manaFrontier,
    frontierTermination: {
      recommendation: cfAssembly.manaFrontier?.recommendation,
      nextNonlandMarginalUtility: cfAssembly.manaFrontier?.nextNonlandMarginalUtility,
      mandatoryStructureSatisfied: cfAssembly.manaFrontier?.mandatoryStructureSatisfied,
      reason:
        cfAssembly.manaFrontier?.recommendation === "ADD_LAND"
          ? "Mandatory minima satisfied; flex/marginal utility exhausted; remaining capacity filled with lands"
          : cfAssembly.manaFrontier?.recommendation,
    },
    accessPortfolio: {
      distinctAccessTools: accessPortfolio.distinctAccessTools,
      routeCount: accessPortfolio.routeCount,
      status: accessPortfolio.status,
      minimumToolTarget: accessPortfolio.minimumToolTarget,
      accessTools: accessPortfolio.accessTools.map((t) => ({
        oracleId: t.oracleId,
        name: t.name,
        restriction: t.restriction,
        destination: t.destination,
        routeCount: t.verifiedRoutes.length,
        targetClassesReached: t.targetClassesReached,
      })),
      routeAnalysis: accessRouteAnalysis,
      criticalTargetCount: accessPortfolio.criticalTargets.length,
      sampleRoutes: accessPortfolio.verifiedRoutes.slice(0, 10),
    },
    constructionHistory: {
      decisionCount: cfAssembly.decisions.length,
      tailRepair: cfAssembly.tailRepair,
      tailExhaustions: cfAssembly.tailExhaustions,
      lastCheckpoint: cfAssembly.checkpoints[cfAssembly.checkpoints.length - 1]?.convergence ?? null,
    },
    unresolvedDeficits: {
      openRequirements: deckCapacityLedger.openRequirements,
      functionalBelowMinimum: functionalDensities.filter((d) => d.status === "BELOW_MINIMUM").map((d) => d.budgetId),
      packageBelowMinimum: packageDensities.filter((d) => d.status === "BELOW_MINIMUM").map((d) => d.packageId),
      accessPortfolioStatus: accessPortfolio.status,
    },
    qualityGateNotes: {
      mathematicallyComplete99: libraryCountV417(bp) === COMMANDER_DECK_LIBRARY_SIZE_V47,
      worthCriticizing:
        "UNKNOWN — requires human review of role coherence, engine synergy, and whether 62+37 reflects strategy vs frontier arithmetic only",
      accessRoutePrecision:
        accessRouteAnalysis.inflationRisk === "BROAD_RESTRICTION_MANY_TARGETS"
          ? "Routes are deduplicated per source→target but restriction is broad (e.g. creature or land); counts reflect reachable targets not strategic tutoring"
          : accessRouteAnalysis.inflationRisk,
    },
  };

  // Kess relational access evidence (from frozen assembly report + re-derived portfolio)
  const kessReport = JSON.parse(readFileSync(resolve(sliceDir, "spellslinger-kess-slice5-4-report.json"), "utf8"));
  const { spec: kessSpec, proposal: kessProposal } = loadSavedProposal("spellslinger-kess");
  const kessCommander = resolveCommanderBlueprintFromCatalogV417({ catalog, commanderName: kessSpec.commanderName });
  const kessBp0 = buildBlueprintFromSolProposalV417({
    commander: kessCommander,
    userIntent: {
      format: "Commander",
      bracket: kessSpec.requestedBracket,
      playStyle: kessSpec.archetype,
      commanderDependence: "medium",
      comboPolicy: "no infinite combos",
    },
    proposal: kessProposal,
  });
  const kessAssembly = assembleDeckFromBlueprintV417(kessBp0, {
    catalog,
    maxIterations: 96,
    maxScan: 12000,
    maxEvaluate: 500,
    minQualityScore: 35,
  });
  const kessPortfolio = buildAccessPortfolioStateV417({ blueprint: kessAssembly.blueprint, catalog });
  const kessRouteAnalysis = analyzeAccessRoutes(kessPortfolio.verifiedRoutes);

  const kessEvidence = {
    version: VERSION,
    caseId: "spellslinger-kess",
    priorGenericAccessFailure: {
      slice53: "279 ACCESS-prefiltered → 0 generic semantic-eligible on fd-tutorsandaccess-4",
      densityChallengeCandidate: true,
    },
    slice54RelationalResult: {
      picks: kessAssembly.decisions.length,
      distinctAccessTools: kessPortfolio.distinctAccessTools,
      minimumToolTarget: kessPortfolio.minimumToolTarget,
      status: kessPortfolio.status,
      routeCount: kessPortfolio.routeCount,
      routeAnalysis: kessRouteAnalysis,
      engineCoverage: kessPortfolio.engineCoverage,
      winCoverage: kessPortfolio.winCoverage,
      accessTools: kessPortfolio.accessTools.map((t) => ({
        name: t.name,
        oracleId: t.oracleId,
        restriction: t.restriction,
        destination: t.destination,
        routeCount: t.verifiedRoutes.length,
      })),
      sampleRejectedTools: kessPortfolio.rejectedTools.slice(0, 15),
    },
    conclusion:
      "Relational ACCESS portfolio counts verified tool→target routes; generic ACCESS density was undercounting valid tutors",
    reportExcerpt: {
      failure: kessReport.failure,
      accessPortfolioFromReport: kessReport.accessPortfolio,
    },
  };

  const index = {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    holdStatus: "SLICE_5_4_REPORT_RECEIVED_HOLD_EXECUTION",
    acceptance: {
      slice5Minimum: "MET (Chatterfang legal 99)",
      slice5Strong: "NOT MET",
      fullSlice5: "NOT ACCEPTED",
      commander10: "NOT AUTHORIZED",
    },
    artifactIntegrity: artifactHashes,
    files: {
      chatterfangReviewBundle: "chatterfang-pre-critic-review-bundle.json",
      chatterfangDeckCapacityLedger: "chatterfang-deck-capacity-ledger.json",
      chatterfangIndependentVerification: "chatterfang-independent-verification.json",
      kessRelationalAccessEvidence: "kess-relational-access-evidence.json",
    },
    nextAuthorizedStep:
      "IF independent verification passes → deterministic audit → Critic → ONE Head Professor GPT-5.6 Sol review",
  };

  writeFileSync(resolve(outDir, "chatterfang-pre-critic-review-bundle.json"), JSON.stringify(chatterfangBundle, null, 2));
  writeFileSync(resolve(outDir, "chatterfang-deck-capacity-ledger.json"), JSON.stringify(deckCapacityLedger, null, 2));
  writeFileSync(resolve(outDir, "chatterfang-independent-verification.json"), JSON.stringify(independentVerification, null, 2));
  writeFileSync(resolve(outDir, "kess-relational-access-evidence.json"), JSON.stringify(kessEvidence, null, 2));
  writeFileSync(resolve(outDir, "REVIEW-BUNDLE-INDEX.json"), JSON.stringify(index, null, 2));

  console.log(`Wrote review bundle to ${outDir}`);
  console.log(`Chatterfang IV pass=${independentVerification.pass} main=${independentVerification.mainDeckCount} nl=${independentVerification.nonlandCount} lands=${independentVerification.landCount}`);
  console.log(`Chatterfang access routes: raw=${accessRouteAnalysis.rawRouteCount} uniquePairs=${accessRouteAnalysis.uniqueSourceTargetPairs} inflation=${accessRouteAnalysis.inflationRisk}`);
  console.log(`Kess access tools=${kessPortfolio.distinctAccessTools} routes=${kessPortfolio.routeCount} inflation=${kessRouteAnalysis.inflationRisk}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
