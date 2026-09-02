/**
 * Canonical card identity v4.15.1 — one resolver for display names, matching, and fingerprints.
 * Prefer oracleId for identity; display names are presentation only.
 */
import { createHash } from "node:crypto";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import {
  canonicalizeDisplayName,
  normalizeCardNameForMatch,
} from "./professor-card-name-match-client-v4-15-1-v1";
import {
  findPlayableCommanderLibraryMatches,
  selectBestPlayableOracleMatch,
} from "./professor-playable-oracle-resolution-v1-1-1";

export { canonicalizeDisplayName, normalizeCardNameForMatch };

export const PROFESSOR_CANONICAL_CARD_IDENTITY_V4_15_1_V1_VERSION =
  "professor-canonical-card-identity-v4-15-1-v1";

export type CanonicalCardIdentity = {
  oracleId: string | null;
  /** Catalog canonical name when oracleId resolves; otherwise cleaned display name */
  canonicalName: string;
  /** Original display string from deck list */
  displayName: string;
  matchKey: string;
};

export function buildMatchKey(args: { oracleId?: string | null; name?: string | null }): string {
  if (args.oracleId) return `oid:${args.oracleId}`;
  return `name:${normalizeCardNameForMatch(args.name)}`;
}

export function resolveCanonicalCardIdentity(args: {
  name?: string | null;
  oracleId?: string | null;
  catalog?: DeckResolutionCatalog;
  cardId?: string | null;
}): CanonicalCardIdentity {
  const displayName = (args.name ?? "").trim();
  let oracleId = args.oracleId ?? null;
  let canonicalName = displayName ? canonicalizeDisplayName(displayName) : "";

  if (!canonicalName && !oracleId) {
    const fallback = args.cardId?.trim() || "unknown-card";
    return {
      oracleId: null,
      canonicalName: fallback,
      displayName,
      matchKey: `card:${fallback}`,
    };
  }

  if (oracleId && args.catalog?.byOracleId.get(oracleId)) {
    canonicalName = canonicalizeDisplayName(args.catalog.byOracleId.get(oracleId)!.canonicalName);
  } else if (args.catalog && displayName) {
    const matches = findPlayableCommanderLibraryMatches({ name: displayName, catalog: args.catalog });
    const winner = selectBestPlayableOracleMatch(matches, args.catalog);
    if (winner) {
      oracleId = winner.oracleId;
      canonicalName = canonicalizeDisplayName(winner.canonicalName);
    }
  }

  return {
    oracleId,
    canonicalName,
    displayName,
    matchKey: buildMatchKey({ oracleId, name: canonicalName }),
  };
}

export function cardsShareCanonicalIdentity(
  a: { name: string; oracleId?: string | null },
  b: { name: string; oracleId?: string | null },
  catalog?: DeckResolutionCatalog,
): boolean {
  const left = resolveCanonicalCardIdentity({ ...a, catalog });
  const right = resolveCanonicalCardIdentity({ ...b, catalog });
  if (left.oracleId && right.oracleId) return left.oracleId === right.oracleId;
  return left.matchKey === right.matchKey;
}

export function findCouncilCardByIdentity<T extends { name: string; oracleId?: string | null }>(
  cards: T[],
  targetName: string,
  catalog?: DeckResolutionCatalog,
): T | undefined {
  const target = resolveCanonicalCardIdentity({ name: targetName, catalog });
  const targetNameKey = normalizeCardNameForMatch(target.canonicalName);
  return cards.find((card) => {
    const identity = resolveCanonicalCardIdentity({ name: card.name, oracleId: card.oracleId, catalog });
    if (target.oracleId && identity.oracleId) return target.oracleId === identity.oracleId;
    if (identity.matchKey === target.matchKey) return true;
    return normalizeCardNameForMatch(identity.canonicalName) === targetNameKey;
  });
}

export function deckListFingerprintKeys(
  cards: Array<{ name?: string | null; oracleId?: string | null; cardId?: string | null }>,
  catalog?: DeckResolutionCatalog,
): string[] {
  return cards
    .map((card) =>
      resolveCanonicalCardIdentity({
        name: card.name,
        oracleId: card.oracleId,
        catalog,
        cardId: card.cardId,
      }).matchKey,
    )
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

export function deckListShaFromCards(
  cards: Array<{ name?: string | null; oracleId?: string | null; cardId?: string | null }>,
  catalog?: DeckResolutionCatalog,
): string {
  return createHash("sha256")
    .update(deckListFingerprintKeys(cards, catalog).join("\n"))
    .digest("hex")
    .slice(0, 16);
}

/** Require grade, Head Professor, and play report to reference the same canonical deck fingerprint. */
export function assertFinalFingerprintBindingV4151(args: {
  finalCanonicalDeckFingerprint: string;
  gradeDeckFingerprint: string;
  headProfessorReviewedFingerprint: string;
  playReportDeckFingerprint: string;
  context?: string;
}): void {
  const mismatches: string[] = [];
  if (args.gradeDeckFingerprint !== args.finalCanonicalDeckFingerprint) {
    mismatches.push(`grade (${args.gradeDeckFingerprint})`);
  }
  if (args.headProfessorReviewedFingerprint !== args.finalCanonicalDeckFingerprint) {
    mismatches.push(`head-professor (${args.headProfessorReviewedFingerprint})`);
  }
  if (args.playReportDeckFingerprint !== args.finalCanonicalDeckFingerprint) {
    mismatches.push(`play-report (${args.playReportDeckFingerprint})`);
  }
  if (mismatches.length > 0) {
    throw new Error(
      `Final fingerprint binding failed${args.context ? ` (${args.context})` : ""}: ${mismatches.join(", ")} !== canonical ${args.finalCanonicalDeckFingerprint}`,
    );
  }
}

/** Legacy name-list SHA — canonicalizes duplicate-face display artifacts before hashing. */
export function deckListSha(names: Array<string | null | undefined>): string {
  const canonical = names.map(canonicalizeDisplayName).filter(Boolean).sort((a, b) => a.localeCompare(b));
  return createHash("sha256").update(canonical.join("\n")).digest("hex").slice(0, 16);
}
