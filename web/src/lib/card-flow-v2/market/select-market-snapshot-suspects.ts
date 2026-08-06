import type { CardCandidateBundle, CardSuspect } from "../types";
import { isTheListSuspect } from "../mtg-suspect-scoring-shared";
import { isMtgFoilFinish, isMtgNonfoilFinish } from "../mtg-finish-utils";
import { classifyMtgFrame } from "../mtg-frame-utils";
import {
  isYgoFirstEdition,
  isYgoUnlimitedEdition,
} from "../ygo-edition-utils";
import {
  isPokemonMasterBallFinish,
  isPokemonNormalFinish,
  isPokemonPokeBallFinish,
  isPokemonReverseFinish,
} from "../pokemon-finish-utils";
import {
  isSportsParallelSuspect,
  isSportsRawOrBase,
} from "../sports-parallel-utils";
import type { MarketSnapshotReason } from "./market-snapshot-reason";

export type MarketSnapshotSuspectPick = {
  suspect: CardSuspect;
  reason: MarketSnapshotReason;
};

function assessmentScore(
  identity: CardCandidateBundle,
  suspectId: string,
): number {
  return (
    identity.suspectAssessments.find((a) => a.suspectId === suspectId)
      ?.matchScore ?? 0
  );
}

/** Inspector micro-vision favored suspect ids for market snapshot inclusion. */
export function getInspectorFavoredSuspectIds(
  identity: CardCandidateBundle,
): string[] {
  const ids = new Set<string>();
  const { suspects } = identity;

  const list = identity.mtgListMarkInspection;
  if (list?.attempted && list.listMarkVisible === "yes") {
    for (const s of suspects) {
      if (isTheListSuspect(s)) ids.add(s.suspectId);
    }
  }

  const foil = identity.mtgFoilWashInspection;
  if (foil?.attempted && foil.foilWashVisible !== "unknown") {
    const wantFoil = foil.foilWashVisible === "yes";
    for (const s of suspects) {
      if (wantFoil && isMtgFoilFinish(s.finish)) ids.add(s.suspectId);
      if (!wantFoil && isMtgNonfoilFinish(s.finish)) ids.add(s.suspectId);
    }
  }

  const frame = identity.mtgFrameTreatmentInspection;
  if (frame?.attempted && frame.frameTreatment !== "unknown") {
    for (const s of suspects) {
      const fc = classifyMtgFrame(s);
      if (
        fc === frame.frameTreatment ||
        (frame.frameTreatment === "extended" && fc === "borderless")
      ) {
        ids.add(s.suspectId);
      }
    }
  }

  const poke = identity.pokemonReversePatternInspection;
  if (poke?.attempted && poke.reversePattern !== "unknown") {
    for (const s of suspects) {
      if (poke.reversePattern === "master_ball" && isPokemonMasterBallFinish(s.finish)) {
        ids.add(s.suspectId);
      } else if (poke.reversePattern === "poke_ball" && isPokemonPokeBallFinish(s.finish)) {
        ids.add(s.suspectId);
      } else if (
        poke.reversePattern === "standard_reverse" &&
        isPokemonReverseFinish(s.finish) &&
        !isPokemonMasterBallFinish(s.finish) &&
        !isPokemonPokeBallFinish(s.finish)
      ) {
        ids.add(s.suspectId);
      } else if (poke.reversePattern === "none" && isPokemonNormalFinish(s.finish)) {
        ids.add(s.suspectId);
      }
    }
  }

  const ygo = identity.ygoEditionInspection;
  if (ygo?.attempted && ygo.edition !== "unknown") {
    for (const s of suspects) {
      if (ygo.edition === "first" && isYgoFirstEdition(s)) ids.add(s.suspectId);
      if (ygo.edition === "unlimited" && isYgoUnlimitedEdition(s) && !isYgoFirstEdition(s)) {
        ids.add(s.suspectId);
      }
    }
  }

  const sports = identity.sportsPrizmStampInspection;
  if (sports?.attempted && sports.prizmStampVisible !== "unknown") {
    for (const s of suspects) {
      if (sports.prizmStampVisible === "yes" && isSportsParallelSuspect(s)) {
        ids.add(s.suspectId);
      }
      if (
        sports.prizmStampVisible === "no" &&
        isSportsRawOrBase(s) &&
        !isSportsParallelSuspect(s)
      ) {
        ids.add(s.suspectId);
      }
    }
  }

  return [...ids];
}

function hasVariantTrapPair(identity: CardCandidateBundle): boolean {
  return getInspectorFavoredSuspectIds(identity).length > 0;
}

/**
 * Pick suspects for candidate market snapshots — always includes top scorers
 * plus inspector-favored / trap suspects even when outside top N by raw score.
 */
export function selectMarketSnapshotSuspects(
  identity: CardCandidateBundle,
  maxSuspects: number,
): MarketSnapshotSuspectPick[] {
  const picks: MarketSnapshotSuspectPick[] = [];
  const seen = new Set<string>();

  function add(suspect: CardSuspect | undefined, reason: MarketSnapshotReason) {
    if (!suspect || seen.has(suspect.suspectId)) return;
    seen.add(suspect.suspectId);
    picks.push({ suspect, reason });
  }

  const ranked = [...identity.suspectAssessments].sort(
    (a, b) => b.matchScore - a.matchScore,
  );

  for (const a of ranked.slice(0, maxSuspects)) {
    add(
      identity.suspects.find((s) => s.suspectId === a.suspectId),
      "top_score",
    );
  }

  const inspectorIds = getInspectorFavoredSuspectIds(identity);
  const trapContext = hasVariantTrapPair(identity);
  for (const id of inspectorIds) {
    add(
      identity.suspects.find((s) => s.suspectId === id),
      trapContext ? "inspector_favored" : "variant_trap",
    );
  }

  if (picks.length > maxSuspects) {
    const protectedIds = new Set([
      ...inspectorIds,
      ranked[0]?.suspectId,
    ].filter(Boolean));

    const sorted = [...picks].sort((a, b) => {
      const aProtected = protectedIds.has(a.suspect.suspectId) ? 1 : 0;
      const bProtected = protectedIds.has(b.suspect.suspectId) ? 1 : 0;
      if (aProtected !== bProtected) return bProtected - aProtected;
      return (
        assessmentScore(identity, b.suspect.suspectId) -
        assessmentScore(identity, a.suspect.suspectId)
      );
    });

    return sorted.slice(0, maxSuspects);
  }

  if (picks.length < maxSuspects) {
    for (const a of ranked) {
      if (picks.length >= maxSuspects) break;
      add(
        identity.suspects.find((s) => s.suspectId === a.suspectId),
        "staff_visible",
      );
    }
  }

  return picks;
}
