/**
 * Final deck fingerprint / revision binding v4.11 — stale Head Professor reviews cannot be reused.
 */
import { createHash } from "node:crypto";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import {
  computeDeckSnapshotV47,
  type ProfessorCouncilStateV47,
} from "./professor-council-assembly-v4-7-v1";
import { deckListShaFromCards } from "./professor-canonical-card-identity-v4-15-1-v1";

export const PROFESSOR_DECK_FINGERPRINT_V4_11_V1_VERSION = "professor-deck-fingerprint-v4-11-v1";

export type FinalDeckFingerprintV411 = {
  version: typeof PROFESSOR_DECK_FINGERPRINT_V4_11_V1_VERSION;
  finalDeckRevision: number;
  finalDeckFingerprint: string;
  finalSnapshotRevision: number;
  landCount: number;
  libraryCards: number;
  avgManaValue: number;
  tutorCount: number;
  rampNonLandCount: number;
};

export function computeFinalDeckFingerprintV411(args: {
  state: ProfessorCouncilStateV47;
  catalog: DeckResolutionCatalog;
  revision?: number;
}): FinalDeckFingerprintV411 {
  const snapshot = computeDeckSnapshotV47({ state: args.state, catalog: args.catalog });
  const fingerprintSha = deckListShaFromCards(args.state.selectedCards, args.catalog);
  const nonlands = args.state.selectedCards.filter((c) => c.category !== "land");
  const avgMv =
    nonlands.length === 0
      ? 0
      : Math.round(
          (nonlands.reduce((acc, c) => {
            const golden = c.oracleId ? args.catalog.byOracleId.get(c.oracleId) : null;
            return acc + (golden?.manaValue ?? 0);
          }, 0) /
            nonlands.length) *
            100,
        ) / 100;

  return {
    version: PROFESSOR_DECK_FINGERPRINT_V4_11_V1_VERSION,
    finalDeckRevision: args.revision ?? args.state.assemblyRevision,
    finalDeckFingerprint: fingerprintSha,
    finalSnapshotRevision: args.state.snapshots.length,
    landCount: snapshot.landCount,
    libraryCards: args.state.selectedCards.length,
    avgManaValue: avgMv,
    tutorCount: snapshot.tutorCount ?? 0,
    rampNonLandCount: snapshot.rampNonLandCount ?? snapshot.rampCoverage ?? 0,
  };
}

export function snapshotContentHash(snapshot: ReturnType<typeof computeDeckSnapshotV47>): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        landCount: snapshot.landCount,
        ramp: snapshot.rampCoverage,
        tutors: snapshot.tutorCount,
        interaction: snapshot.interactionCoverage,
        protection: snapshot.protectionCoverage,
        cardAdvantage: snapshot.cardAdvantageCoverage,
      }),
    )
    .digest("hex")
    .slice(0, 12);
}

export function isHeadProfessorReviewStaleV411(args: {
  reviewedFingerprint: string | null | undefined;
  currentFingerprint: string;
}): boolean {
  if (!args.reviewedFingerprint) return true;
  return args.reviewedFingerprint !== args.currentFingerprint;
}

export function assertHeadProfessorReviewFreshV411(args: {
  reviewedFingerprint: string | null | undefined;
  currentFingerprint: string;
  context: string;
}): void {
  if (isHeadProfessorReviewStaleV411(args)) {
    throw new Error(
      `Head Professor review is STALE for ${args.context}: reviewed ${args.reviewedFingerprint ?? "none"} !== current ${args.currentFingerprint}`,
    );
  }
}
