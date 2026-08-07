/**
 * Deterministic taxonomy v1.3 shuffle migration — oracle-text policy only.
 * Does NOT inspect parser output.
 */
import { createHash } from "node:crypto";
import { inferDerivedRoles } from "../../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import type { PrimitiveActionType } from "../../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import type { CatalogEvalCase } from "./eval-provenance-guard";

export const TAXONOMY_V13 = "three-layer-v1.3";
export const MIGRATION_POLICY_ID = "taxonomy-v13-shuffle-library-policy";

export function migrationPolicyHash(): string {
  const policy = {
    id: MIGRATION_POLICY_ID,
    shuffle_library:
      "Randomize cards already in a library — e.g. 'then shuffle', 'shuffle your library', optional 'You may shuffle'.",
    shuffle_into_library:
      "Move objects from another zone into a library — e.g. 'shuffles hand into library', 'shuffles it into their library'.",
    relabelRules: "No shuffle_into_library → shuffle_library relabels; only additive gold where taxonomy v1.3 primitive was absent.",
  };
  return createHash("sha256").update(JSON.stringify(policy)).digest("hex");
}

/** Generic tutor resolution shuffle — not a zone-to-library move. */
export function hasGenericLibraryShuffle(oracleText: string): boolean {
  if (/\bshuffles? [\w ]+ into [\w']+ library\b/i.test(oracleText)) return false;
  if (/\bsearch (?:your |their )?library for\b[\s\S]*\bthen shuffle\b/i.test(oracleText)) return true;
  if (/\bsearch your library for a card, then shuffle and put\b/i.test(oracleText)) return true;
  if (/\beach player searches their library[\s\S]*\bthen shuffles\b/i.test(oracleText)) return true;
  return false;
}

export function shuffleLibraryEvidence(oracleText: string): string {
  if (/\bthen shuffle and put\b/i.test(oracleText)) return "shuffle and put that card on top";
  if (/\bthen shuffle\b/i.test(oracleText)) return "then shuffle";
  if (/\bthen shuffles\b/i.test(oracleText)) return "then shuffles";
  return "Then shuffle";
}

/** Zone-to-library shuffle distinct from generic library randomization. */
export function hasShuffleIntoLibraryMove(oracleText: string): boolean {
  return (
    /\bshuffles? (?:their |your )?(?:hand and graveyard|graveyard and hand|hand) into (?:their |your )?library\b/i.test(
      oracleText,
    ) || /\bshuffles? it into (?:its owner's |their )?library\b/i.test(oracleText)
  );
}

export function shuffleIntoLibraryEvidence(oracleText: string): string {
  const zoneMove = oracleText.match(
    /\bshuffles? (?:their |your )?(?:hand and graveyard|graveyard and hand|hand) into (?:their |your )?library\b/i,
  );
  if (zoneMove) return zoneMove[0];
  const single = oracleText.match(/\bshuffles? it into (?:its owner's |their )?library\b/i);
  if (single) return single[0];
  return "shuffles into their library";
}

export function hasOptionalStandaloneShuffle(oracleText: string): boolean {
  return (
    /\bYou may shuffle\.?\b/i.test(oracleText) &&
    !/\bshuffles? [\w ]+ into [\w']+ library\b/i.test(oracleText) &&
    !hasGenericLibraryShuffle(oracleText)
  );
}

export interface TaxonomyMigrationResult {
  case: CatalogEvalCase;
  changed: boolean;
  shuffleLibraryAdded: boolean;
  shuffleIntoLibraryAdded: boolean;
  shuffleIntoLibraryRelabeled: boolean;
}

export function applyTaxonomyV13ShuffleMigration(c: CatalogEvalCase): TaxonomyMigrationResult {
  let expectedPrimitiveActions = [...c.expectedPrimitiveActions.filter((g) => !g.negative)];
  let changed = c.taxonomyVersion !== TAXONOMY_V13;
  let shuffleLibraryAdded = false;
  let shuffleIntoLibraryAdded = false;
  const shuffleIntoLibraryRelabeled = false;

  if (hasGenericLibraryShuffle(c.oracleText)) {
    if (!expectedPrimitiveActions.some((g) => g.actionType === "shuffle_library")) {
      expectedPrimitiveActions.push({
        actionType: "shuffle_library" as PrimitiveActionType,
        evidenceContains: shuffleLibraryEvidence(c.oracleText),
        ...(c.cardFace ? { cardFace: c.cardFace } : {}),
      });
      shuffleLibraryAdded = true;
      changed = true;
    }
  }

  if (hasShuffleIntoLibraryMove(c.oracleText)) {
    if (!expectedPrimitiveActions.some((g) => g.actionType === "shuffle_into_library")) {
      const backFace = c.oracleText.includes("\n//\n") && /shuffles? (?:their |your )?(?:hand|graveyard)/i.test(c.oracleText.split("\n//\n")[1] ?? "");
      expectedPrimitiveActions.push({
        actionType: "shuffle_into_library" as PrimitiveActionType,
        evidenceContains: shuffleIntoLibraryEvidence(c.oracleText),
        ...(backFace ? { cardFace: "back" as const } : c.cardFace ? { cardFace: c.cardFace } : {}),
      });
      shuffleIntoLibraryAdded = true;
      changed = true;
    }
  }

  if (hasOptionalStandaloneShuffle(c.oracleText)) {
    if (!expectedPrimitiveActions.some((g) => g.actionType === "shuffle_library")) {
      expectedPrimitiveActions.push({
        actionType: "shuffle_library" as PrimitiveActionType,
        evidenceContains: "You may shuffle",
      });
      shuffleLibraryAdded = true;
      changed = true;
    }
  }

  if (!changed) {
    return {
      case: { ...c, taxonomyVersion: TAXONOMY_V13 },
      changed: c.taxonomyVersion !== TAXONOMY_V13,
      shuffleLibraryAdded,
      shuffleIntoLibraryAdded,
      shuffleIntoLibraryRelabeled,
    };
  }

  const primitives = expectedPrimitiveActions.map((p) => p.actionType as PrimitiveActionType);
  return {
    case: {
      ...c,
      expectedPrimitiveActions,
      expectedRoles: inferDerivedRoles(primitives).map((role) => ({
        role,
        fromPrimitiveActions: [...new Set(primitives)],
      })),
      taxonomyVersion: TAXONOMY_V13,
    },
    changed: true,
    shuffleLibraryAdded,
    shuffleIntoLibraryAdded,
    shuffleIntoLibraryRelabeled,
  };
}
