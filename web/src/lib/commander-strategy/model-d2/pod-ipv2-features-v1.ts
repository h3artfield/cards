/**
 * Pod-level IPV2.1 features for P0 / P1 / D2 ladder blocks.
 */
import { allRetainedDeckFeatureKeys } from "../interaction-profile-v2.1/rps-ontology-v2.1";
import {
  computeMatchupTerm,
  mergeDeckProfileVectors,
  type DeckInteractionProfileV2_1,
} from "../interaction-profile-v2.1/deck-interaction-profile-v2.1";
import {
  MATCHUP_PAIRINGS_V2_1,
  profileKey,
  type MatchupPairingDef,
} from "../interaction-profile-v2.1/matchup-ontology-v2.1";
import {
  OPPONENT_REDUCERS,
  reduceAcrossOpponents,
  type OpponentReducer,
} from "./opponent-reducers-v1";

export function selfProfileFeatureNames(): string[] {
  return allRetainedDeckFeatureKeys();
}

/** Unique opponent-side source profile keys referenced by matchup ontology. */
export function opponentMarginalSourceKeys(): string[] {
  const keys = new Set<string>();
  for (const pairing of MATCHUP_PAIRINGS_V2_1) {
    keys.add(profileKey(pairing.oppVector.zone, pairing.oppVector.family, pairing.oppVector.vector));
  }
  return [...keys].sort();
}

export function opponentMarginalFeatureNames(): string[] {
  const names: string[] = [];
  for (const sourceKey of opponentMarginalSourceKeys()) {
    for (const reducer of OPPONENT_REDUCERS) {
      names.push(`oppMarg_${sourceKey}_${reducer}`);
    }
  }
  return names;
}

export function interactionFeatureNames(): string[] {
  const names: string[] = [];
  for (const pairing of MATCHUP_PAIRINGS_V2_1) {
    for (const reducer of OPPONENT_REDUCERS) {
      names.push(`${pairing.termKey}_${reducer}`);
    }
  }
  return names;
}

export function buildSelfProfileFeatures(profile: DeckInteractionProfileV2_1): Record<string, number> {
  const merged = mergeDeckProfileVectors(profile);
  const out: Record<string, number> = {};
  for (const key of selfProfileFeatureNames()) {
    out[key] = merged[key] ?? 0;
  }
  return out;
}

function opponentSourceValue(
  oppProfile: Record<string, number>,
  sourceKey: string,
): number {
  return oppProfile[sourceKey] ?? 0;
}

export function buildOpponentMarginalFeatures(input: {
  opponentProfiles: Array<Record<string, number>>;
}): Record<string, number> {
  const out = Object.fromEntries(opponentMarginalFeatureNames().map((n) => [n, 0]));
  if (input.opponentProfiles.length === 0) return out;

  for (const sourceKey of opponentMarginalSourceKeys()) {
    const perOpp = input.opponentProfiles.map((p) => opponentSourceValue(p, sourceKey));
    const reduced = reduceAcrossOpponents(perOpp);
    for (const reducer of OPPONENT_REDUCERS) {
      out[`oppMarg_${sourceKey}_${reducer}`] = reduced[reducer];
    }
  }
  return out;
}

function pairwiseTermForOpponent(
  pairing: MatchupPairingDef,
  myProfile: Record<string, number>,
  oppProfile: Record<string, number>,
): number {
  return computeMatchupTerm(pairing, myProfile, oppProfile);
}

export function buildInteractionFeatures(input: {
  myProfile: Record<string, number>;
  opponentProfiles: Array<Record<string, number>>;
}): Record<string, number> {
  const out = Object.fromEntries(interactionFeatureNames().map((n) => [n, 0]));
  if (input.opponentProfiles.length === 0) return out;

  for (const pairing of MATCHUP_PAIRINGS_V2_1) {
    const perOpp = input.opponentProfiles.map((opp) =>
      pairwiseTermForOpponent(pairing, input.myProfile, opp),
    );
    const reduced = reduceAcrossOpponents(perOpp);
    for (const reducer of OPPONENT_REDUCERS) {
      out[`${pairing.termKey}_${reducer}`] = reduced[reducer];
    }
  }
  return out;
}

export function buildPodIpv2FeaturesForSeat(input: {
  seatIndex: number;
  seatProfiles: DeckInteractionProfileV2_1[];
}): {
  selfProfile: Record<string, number>;
  opponentMarginal: Record<string, number>;
  interaction: Record<string, number>;
} {
  const myProfile = input.seatProfiles[input.seatIndex];
  if (!myProfile) {
    return { selfProfile: {}, opponentMarginal: {}, interaction: {} };
  }
  const myMerged = mergeDeckProfileVectors(myProfile);
  const opponentProfiles = input.seatProfiles
    .filter((_, idx) => idx !== input.seatIndex)
    .map((p) => mergeDeckProfileVectors(p));

  return {
    selfProfile: buildSelfProfileFeatures(myProfile),
    opponentMarginal: buildOpponentMarginalFeatures({ opponentProfiles }),
    interaction: buildInteractionFeatures({ myProfile: myMerged, opponentProfiles }),
  };
}

/** Independent reconstruction for QA invariant checks. */
export function recomputeInteractionFeature(input: {
  pairing: MatchupPairingDef;
  reducer: OpponentReducer;
  myProfile: Record<string, number>;
  opponentProfiles: Array<Record<string, number>>;
}): number {
  const perOpp = input.opponentProfiles.map((opp) =>
    computeMatchupTerm(input.pairing, input.myProfile, opp),
  );
  return reduceAcrossOpponents(perOpp)[input.reducer];
}

export function featuresEqual(a: Record<string, number>, b: Record<string, number>, eps = 1e-12): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const av = a[key] ?? 0;
    const bv = b[key] ?? 0;
    if (!Number.isFinite(av) || !Number.isFinite(bv)) return false;
    if (Math.abs(av - bv) > eps) return false;
  }
  return true;
}

export function assertPermutationInvariant(input: {
  seatIndex: number;
  seatProfiles: DeckInteractionProfileV2_1[];
}): { pass: boolean; checkedPermutations: number } {
  const baseline = buildPodIpv2FeaturesForSeat(input);
  const myProfile = input.seatProfiles[input.seatIndex]!;
  const opponentProfiles = input.seatProfiles.filter((_, idx) => idx !== input.seatIndex);

  function permute<T>(arr: T[]): T[][] {
    if (arr.length <= 1) return [arr];
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += 1) {
      const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
      for (const tail of permute(rest)) out.push([arr[i]!, ...tail]);
    }
    return out;
  }

  const permutations = permute(opponentProfiles);
  for (const oppPerm of permutations) {
    const reordered: DeckInteractionProfileV2_1[] = [];
    let oppPtr = 0;
    for (let seat = 0; seat < input.seatProfiles.length; seat += 1) {
      if (seat === input.seatIndex) reordered[seat] = myProfile;
      else {
        reordered[seat] = oppPerm[oppPtr]!;
        oppPtr += 1;
      }
    }
    const candidate = buildPodIpv2FeaturesForSeat({
      seatIndex: input.seatIndex,
      seatProfiles: reordered,
    });
    if (
      !featuresEqual(candidate.opponentMarginal, baseline.opponentMarginal) ||
      !featuresEqual(candidate.interaction, baseline.interaction)
    ) {
      return { pass: false, checkedPermutations: permutations.length };
    }
  }
  return { pass: true, checkedPermutations: permutations.length };
}
