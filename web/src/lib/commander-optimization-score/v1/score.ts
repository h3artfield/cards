import {
  COS_V1_EXPECTED_SHA,
  COS_V1_FEATURE_EXTRACTION_VERSION,
  COS_V1_MIN_COMMANDER_UNIQUE,
  COS_V1_SCORE_VERSION,
  COS_V1_SPELLBOOK_FINGERPRINT_SHA,
} from "./constants";
import { percentileFromGrid } from "./percentile";
import { COS_V1_COMBO_DERIVED_AXES, COS_V1_PROFILE_META, profileScalars } from "./profile-scalars";
import {
  COS_V1_UNIVERSAL_COVERAGE_VERSION,
  blendedReferencePercentile,
  commanderReferenceDepth,
  globalResidualMixture,
  mixturePercentile,
} from "./universal-coverage";
import type {
  CosV1AccessFeatures,
  CosV1ArchitectureFingerprint,
  CosV1FailureCode,
  CosV1Model,
  CosV1ProfileAxis,
  CosV1Reference,
  CosV1Score,
} from "./types";

export function unscoredCosV1(args: {
  hashes: { formula: string; schema: string; model: string; reference: string };
  code: CosV1FailureCode;
  message: string;
  commanderIdentity?: string | null;
  legacyScore?: number | null;
}): CosV1Score {
  return {
    scoreVersion: COS_V1_SCORE_VERSION,
    formulaSha: args.hashes.formula,
    schemaSha: args.hashes.schema,
    modelSha: args.hashes.model,
    referenceSha: args.hashes.reference,
    spellbookFingerprintVersion: COS_V1_SPELLBOOK_FINGERPRINT_SHA,
    featureExtractionVersion: COS_V1_FEATURE_EXTRACTION_VERSION,
    competitiveStrength: null,
    buildOptimization: null,
    buildOptimizationStatus: "unscored",
    buildOptimizationReferenceDepth: null,
    commanderReferenceCount: 0,
    coverageLineage: COS_V1_UNIVERSAL_COVERAGE_VERSION,
    commanderKnown: false,
    commanderIdentity: args.commanderIdentity ?? null,
    unknownCommander: true,
    commanderBaselineStatus: "UNSCORED",
    profile: [],
    utility: null,
    residual: null,
    zeroCombo: false,
    failure: { code: args.code, message: args.message },
    legacyScore: args.legacyScore ?? null,
    COS_V1_MATH_CHANGED: false,
    COLOR_USED: false,
    OPPONENT_FEATURES_USED: false,
    PROFILE_AVERAGED_INTO_HEADLINE: false,
  };
}

export function commanderIdentity(oids: string[]): string | null {
  const uniq = [...new Set(oids.map((x) => String(x).trim()).filter(Boolean))].sort();
  return uniq.length ? uniq.join("|") : null;
}

export function scoreFromHeadlineVector(args: {
  x: number[];
  commanderIdentity: string | null;
  model: CosV1Model;
  reference: CosV1Reference;
  access: CosV1AccessFeatures;
  architecture: CosV1ArchitectureFingerprint | null;
  hashes: { formula: string; schema: string; model: string; reference: string };
  legacyScore?: number | null;
}): CosV1Score {
  const base = {
    scoreVersion: COS_V1_SCORE_VERSION,
    formulaSha: args.hashes.formula,
    schemaSha: args.hashes.schema,
    modelSha: args.hashes.model,
    referenceSha: args.hashes.reference,
    spellbookFingerprintVersion: COS_V1_SPELLBOOK_FINGERPRINT_SHA,
    featureExtractionVersion: COS_V1_FEATURE_EXTRACTION_VERSION,
    COS_V1_MATH_CHANGED: false as const,
    COLOR_USED: false as const,
    OPPONENT_FEATURES_USED: false as const,
    PROFILE_AVERAGED_INTO_HEADLINE: false as const,
    legacyScore: args.legacyScore ?? null,
  };

  if (
    args.hashes.formula !== COS_V1_EXPECTED_SHA.formula ||
    args.hashes.schema !== COS_V1_EXPECTED_SHA.schema ||
    args.hashes.model !== COS_V1_EXPECTED_SHA.model ||
    args.hashes.reference !== COS_V1_EXPECTED_SHA.reference
  ) {
    return {
      ...base,
      competitiveStrength: null,
      buildOptimization: null,
      buildOptimizationStatus: "unscored",
      buildOptimizationReferenceDepth: null,
      commanderReferenceCount: 0,
      coverageLineage: COS_V1_UNIVERSAL_COVERAGE_VERSION,
      commanderKnown: false,
      commanderIdentity: args.commanderIdentity,
      unknownCommander: true,
      commanderBaselineStatus: "UNSCORED",
      profile: [],
      utility: null,
      residual: null,
      zeroCombo: false,
      failure: { code: "HASH_MISMATCH", message: "Frozen COS v1 artifact hash mismatch" },
    };
  }

  if (args.x.length !== args.model.featureNames.length || args.x.length !== args.model.beta.length) {
    return {
      ...base,
      competitiveStrength: null,
      buildOptimization: null,
      buildOptimizationStatus: "unscored",
      buildOptimizationReferenceDepth: null,
      commanderReferenceCount: 0,
      coverageLineage: COS_V1_UNIVERSAL_COVERAGE_VERSION,
      commanderKnown: false,
      commanderIdentity: args.commanderIdentity,
      unknownCommander: true,
      commanderBaselineStatus: "UNSCORED",
      profile: [],
      utility: null,
      residual: null,
      zeroCombo: false,
      failure: { code: "INCOMPLETE_FEATURE_VECTOR", message: "Headline vector is not the frozen 60-d contract" },
    };
  }

  let residual = 0;
  for (let k = 0; k < args.x.length; k++) {
    residual += args.model.beta[k]! * ((args.x[k]! - args.model.mu[k]!) / args.model.sd[k]!);
  }

  const idx = args.commanderIdentity ? args.model.commanderIdentities.indexOf(args.commanderIdentity) : -1;
  const commanderKnown = idx >= 0;
  const S = commanderKnown ? args.model.S[idx + 1]! : 0;
  const utility = S + residual;
  /**
   * Known commanders: frozen U = S_c + R on the global U grid.
   * Unseen commanders: do not publish percentile(0 + R) as Competitive Strength.
   * S is mean-centered (~0); that 1st-percentile number is not a calibrated grade.
   * A commander-card kNN/cluster prior failed LOO (worse than S=0). COS will not invent Ŝ.
   */
  const competitiveStrength = commanderKnown
    ? percentileFromGrid(utility, args.reference.globalUtilityQuantiles)
    : null;

  const cmdRef = args.commanderIdentity ? args.reference.commanders[args.commanderIdentity] : undefined;
  const nUnique = cmdRef?.nUnique ?? 0;
  const strongCommanderRef = Boolean(
    commanderKnown &&
      cmdRef?.eligibleBuildOptimization &&
      cmdRef.residualQuantiles &&
      cmdRef.nUnique >= COS_V1_MIN_COMMANDER_UNIQUE,
  );

  let buildOptimization: number;
  let buildOptimizationStatus: CosV1Score["buildOptimizationStatus"];
  if (strongCommanderRef) {
    buildOptimization = percentileFromGrid(residual, cmdRef!.residualQuantiles!);
    buildOptimizationStatus = "ok";
  } else {
    const globalBo = mixturePercentile(residual, globalResidualMixture(args.reference));
    buildOptimization = blendedReferencePercentile({
      value: residual,
      nUnique,
      commanderGrid: cmdRef?.residualQuantiles,
      globalPercentile: globalBo,
    });
    buildOptimizationStatus = !commanderKnown || !args.commanderIdentity ? "unknown_commander" : "insufficient_reference";
  }

  const scalars = profileScalars(args.access, args.architecture);
  /**
   * Same rule as the withheld intercept above: do not present a number whose
   * basis is missing. With no verified combo line the two combo-derived axes
   * sit at the floor of their reference grids for every such deck, so their
   * percentile describes the reference population, not this 99.
   */
  const noComboBasis = !args.architecture || Number(args.architecture.nNormalizedCombos || 0) === 0;
  const measurability = (id: CosV1ProfileAxis["id"]) =>
    noComboBasis && COS_V1_COMBO_DERIVED_AXES.has(id)
      ? { measurable: false, unmeasurableReason: "NO_VERIFIED_COMBO_LINE" as const }
      : { measurable: true };

  const profile: CosV1ProfileAxis[] = COS_V1_PROFILE_META.map((meta) => {
    const within = commanderKnown ? cmdRef?.profileQuantiles?.[meta.id] : null;
    const useWithin = Boolean(within && cmdRef && cmdRef.nUnique >= COS_V1_MIN_COMMANDER_UNIQUE);
    if (useWithin) {
      return {
        ...meta,
        percentile: percentileFromGrid(scalars[meta.id], within!),
        mapping: "within_commander" as const,
        ...measurability(meta.id),
      };
    }
    const globalGrid = args.reference.globalProfileQuantiles[meta.id]!;
    const globalPct = percentileFromGrid(scalars[meta.id]!, globalGrid);
    const commanderGrid = within?.length === 101 ? within : null;
    const percentile = blendedReferencePercentile({
      value: scalars[meta.id]!,
      nUnique,
      commanderGrid,
      globalPercentile: globalPct,
    });
    return {
      ...meta,
      percentile,
      mapping: commanderGrid ? ("blended" as const) : ("global" as const),
      ...measurability(meta.id),
    };
  });

  return {
    ...base,
    competitiveStrength,
    buildOptimization,
    buildOptimizationStatus,
    buildOptimizationReferenceDepth: commanderReferenceDepth({ commanderKnown, nUnique }),
    commanderReferenceCount: nUnique,
    coverageLineage: COS_V1_UNIVERSAL_COVERAGE_VERSION,
    commanderKnown,
    commanderIdentity: args.commanderIdentity,
    unknownCommander: !commanderKnown,
    commanderBaselineStatus: commanderKnown ? "CALIBRATED" : "COMMANDER_BASELINE_UNCALIBRATED",
    profile,
    utility,
    residual,
    zeroCombo: !args.architecture || Number(args.architecture.nNormalizedCombos || 0) === 0,
    failure: null,
  };
}
