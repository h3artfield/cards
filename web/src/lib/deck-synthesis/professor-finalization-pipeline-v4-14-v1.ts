/**
 * Professor v4.14 — verified metrics + package-level win refinement.
 */
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { DeckCharterV45 } from "./professor-council-state-v4-5-v1";
import type { ProfessorCouncilStateV47 } from "./professor-council-assembly-v4-7-v1";
import { buildFinalDeckDoctorDossierV48 } from "./professor-deck-dossier-v4-8-v1";
import {
  assertHeadProfessorReviewFreshV411,
  computeFinalDeckFingerprintV411,
} from "./professor-deck-fingerprint-v4-11-v1";
import { runBracketAdjudicationV411, type BracketAdjudicationV411 } from "./professor-bracket-adjudication-v4-11-v1";
import { prepareDeckForBracketAdjudicationV412, rebalanceManaBaseAfterSwapsV412 } from "./professor-final-deck-canonical-v4-12-v1";
import { runBracketAlignmentLoopV413 } from "./professor-finalization-pipeline-v4-13-v1";
import type { BracketUpgradeMissionV413 } from "./professor-bracket-upgrade-mission-v4-13-v1";
import {
  computeVerifiedDeckSnapshotV414,
  hydrateAndVerifyDeckStateV414,
  type VerifiedDeckSnapshotV414,
} from "./professor-verified-final-snapshot-v4-14-v1";
import {
  analyzeWinPackagesWithSolV414,
  buildPackageUpgradeProposalsV414,
  inferWinPackagesFromDeck,
  type BracketUpgradePackageProposalV414,
  type PackageDragV414,
  type WinPackageV414,
} from "./professor-win-package-v4-14-v1";
import { executePackageUpgradeV414 } from "./professor-package-executor-v4-14-v1";
import { gameChangerOracleIdSet, loadCommanderGameChangerSnapshot } from "@/lib/commander-strategy/model-c/game-changer-snapshot-v1";

export const PROFESSOR_FINALIZATION_PIPELINE_V4_14_V1_VERSION = "professor-finalization-pipeline-v4-14-v1";

function countGameChangers(selected: ProfessorCouncilStateV47["selectedCards"]): number {
  const gcIds = gameChangerOracleIdSet(loadCommanderGameChangerSnapshot());
  return selected.filter((c) => c.oracleId && gcIds.has(c.oracleId)).length;
}

function bracketAligned(requested: CommanderBracket, predicted: CommanderBracket): boolean {
  return requested === predicted;
}

export type PackageRefinementResultV414 = {
  councilState: ProfessorCouncilStateV47;
  adjudication: BracketAdjudicationV411;
  fingerprint: ReturnType<typeof computeFinalDeckFingerprintV411>;
  verifiedSnapshot: VerifiedDeckSnapshotV414;
  winPackages: WinPackageV414[];
  packageDrag: PackageDragV414[];
  packageProposals: BracketUpgradePackageProposalV414[];
  acceptedPackages: BracketUpgradePackageProposalV414[];
  rejectedPackages: BracketUpgradePackageProposalV414[];
};

export async function runPackageRefinementPassV414(args: {
  councilState: ProfessorCouncilStateV47;
  catalog: DeckResolutionCatalog;
  commanderName: string;
  commanderColorIdentity: string[];
  bracket: CommanderBracket;
  charter: DeckCharterV45 | null;
  adjudication: BracketAdjudicationV411;
  onProgress?: (msg: string) => void;
}): Promise<PackageRefinementResultV414> {
  let councilState = hydrateAndVerifyDeckStateV414({ state: args.councilState, catalog: args.catalog });
  let fingerprint = computeFinalDeckFingerprintV411({ state: councilState, catalog: args.catalog });
  let adjudication = args.adjudication;

  const dossier = buildFinalDeckDoctorDossierV48({
    commanderName: args.commanderName,
    commanderOracleId: null,
    commanderColorIdentity: args.commanderColorIdentity,
    bracket: args.bracket,
    userIntent: [],
    relationshipLens: null,
    charter: args.charter,
    theory: null,
    councilState,
    catalog: args.catalog,
  });

  args.onProgress?.("Sol win package + package drag analysis…");
  const solPackages = await analyzeWinPackagesWithSolV414({
    dossier,
    selectedCards: councilState.selectedCards,
    targetBracket: args.bracket,
    currentBracket: adjudication.predictedEffectiveBracket,
  });

  const inferred = inferWinPackagesFromDeck({ selectedCards: councilState.selectedCards, catalog: args.catalog });
  const winPackages = solPackages.winPackages.length > 0 ? solPackages.winPackages : inferred;
  const packageDrag = solPackages.packageDrag;

  const excludeNames = new Set(councilState.selectedCards.map((c) => c.name.toLowerCase()));
  const packageProposals = buildPackageUpgradeProposalsV414({
    packageDrag,
    selectedCards: councilState.selectedCards,
    catalog: args.catalog,
    colorIdentity: args.commanderColorIdentity,
    excludeNames,
  });

  const acceptedPackages: BracketUpgradePackageProposalV414[] = [];
  const rejectedPackages: BracketUpgradePackageProposalV414[] = [];

  for (const proposal of packageProposals.slice(0, 2)) {
    args.onProgress?.(`Executing package: ${proposal.removeCards.join(", ")} → ${proposal.addCards.join(", ")}`);
    const batch = executePackageUpgradeV414({
      state: councilState,
      catalog: args.catalog,
      colorIdentity: args.commanderColorIdentity,
      commanderName: args.commanderName,
      charter: args.charter,
      proposal,
    });
    if (batch.accepted) {
      councilState = batch.state;
      acceptedPackages.push(batch.proposal);
    } else {
      rejectedPackages.push(batch.proposal);
    }
  }

  if (acceptedPackages.length > 0) {
    const rebalanced = rebalanceManaBaseAfterSwapsV412({
      state: councilState,
      catalog: args.catalog,
      colorIdentity: args.commanderColorIdentity,
      commanderName: args.commanderName,
    });
    councilState = rebalanced.state;
    fingerprint = rebalanced.fingerprint;

    args.onProgress?.("Sol re-adjudication after package refinement…");
    const newDossier = buildFinalDeckDoctorDossierV48({
      commanderName: args.commanderName,
      commanderOracleId: null,
      commanderColorIdentity: args.commanderColorIdentity,
      bracket: args.bracket,
      userIntent: [],
      relationshipLens: null,
      charter: args.charter,
      theory: null,
      councilState,
      catalog: args.catalog,
    });
    adjudication = await runBracketAdjudicationV411({
      dossier: newDossier,
      fingerprint,
      gameChangerCount: countGameChangers(councilState.selectedCards),
    });
  }

  const verifiedSnapshot = computeVerifiedDeckSnapshotV414({ state: councilState, catalog: args.catalog });

  return {
    councilState,
    adjudication,
    fingerprint,
    verifiedSnapshot,
    winPackages,
    packageDrag,
    packageProposals,
    acceptedPackages,
    rejectedPackages,
  };
}

export async function runFullBracketUpgradeJourneyV414(args: {
  councilState: ProfessorCouncilStateV47;
  catalog: DeckResolutionCatalog;
  commanderName: string;
  commanderOracleId: string | null;
  commanderColorIdentity: string[];
  bracket: CommanderBracket;
  charter: DeckCharterV45 | null;
  onProgress?: (msg: string) => void;
}): Promise<{
  councilState: ProfessorCouncilStateV47;
  adjudication: BracketAdjudicationV411;
  fingerprint: ReturnType<typeof computeFinalDeckFingerprintV411>;
  verifiedSnapshot: VerifiedDeckSnapshotV414;
  missions: BracketUpgradeMissionV413[];
  packageResult: PackageRefinementResultV414 | null;
  journey: Array<{ phase: string; bracket: number; fingerprint: string; swaps: number }>;
}> {
  const journey: Array<{ phase: string; bracket: number; fingerprint: string; swaps: number }> = [];

  const prepared = prepareDeckForBracketAdjudicationV412({
    state: args.councilState,
    catalog: args.catalog,
    colorIdentity: args.commanderColorIdentity,
    commanderName: args.commanderName,
  });
  let councilState = hydrateAndVerifyDeckStateV414({ state: prepared.state, catalog: args.catalog });
  let fingerprint = computeFinalDeckFingerprintV411({ state: councilState, catalog: args.catalog });

  const dossier = buildFinalDeckDoctorDossierV48({
    commanderName: args.commanderName,
    commanderOracleId: args.commanderOracleId,
    commanderColorIdentity: args.commanderColorIdentity,
    bracket: args.bracket,
    userIntent: [],
    relationshipLens: null,
    charter: args.charter,
    theory: null,
    councilState,
    catalog: args.catalog,
  });

  args.onProgress?.("Initial Sol adjudication (verified metrics)…");
  let adjudication = await runBracketAdjudicationV411({
    dossier,
    fingerprint,
    gameChangerCount: countGameChangers(councilState.selectedCards),
  });

  journey.push({
    phase: "INITIAL",
    bracket: adjudication.predictedEffectiveBracket,
    fingerprint: fingerprint.finalDeckFingerprint,
    swaps: 0,
  });

  const alignment = await runBracketAlignmentLoopV413({
    councilState,
    catalog: args.catalog,
    commanderName: args.commanderName,
    commanderColorIdentity: args.commanderColorIdentity,
    bracket: args.bracket,
    charter: args.charter,
    dossier,
    fingerprint,
    initialAdjudication: adjudication,
    onProgress: args.onProgress,
  });

  councilState = hydrateAndVerifyDeckStateV414({ state: alignment.councilState, catalog: args.catalog });
  fingerprint = alignment.fingerprint;
  adjudication = alignment.adjudication;

  const totalCardSwaps = alignment.missions.reduce((n, m) => n + m.acceptedSwaps.length, 0);
  journey.push({
    phase: "CARD_REFINEMENT_V412_V413",
    bracket: adjudication.predictedEffectiveBracket,
    fingerprint: fingerprint.finalDeckFingerprint,
    swaps: totalCardSwaps,
  });

  let packageResult: PackageRefinementResultV414 | null = null;
  if (!bracketAligned(args.bracket, adjudication.predictedEffectiveBracket)) {
    args.onProgress?.("v4.14 package-level refinement pass…");
    packageResult = await runPackageRefinementPassV414({
      councilState,
      catalog: args.catalog,
      commanderName: args.commanderName,
      commanderColorIdentity: args.commanderColorIdentity,
      bracket: args.bracket,
      charter: args.charter,
      adjudication,
      onProgress: args.onProgress,
    });
    councilState = packageResult.councilState;
    fingerprint = packageResult.fingerprint;
    adjudication = packageResult.adjudication;
    journey.push({
      phase: "PACKAGE_REFINEMENT_V414",
      bracket: adjudication.predictedEffectiveBracket,
      fingerprint: fingerprint.finalDeckFingerprint,
      swaps: packageResult.acceptedPackages.length,
    });
  }

  const verifiedSnapshot = computeVerifiedDeckSnapshotV414({ state: councilState, catalog: args.catalog });

  assertHeadProfessorReviewFreshV411({
    reviewedFingerprint: adjudication.headProfessorReviewedDeckFingerprint,
    currentFingerprint: fingerprint.finalDeckFingerprint,
    context: "journey-complete",
  });

  return {
    councilState,
    adjudication,
    fingerprint,
    verifiedSnapshot,
    missions: alignment.missions,
    packageResult,
    journey,
  };
}

export { runProfessorFinalizationPipelineV415 as runProfessorFinalizationPipelineV414 } from "./professor-finalization-pipeline-v4-15-v1";
