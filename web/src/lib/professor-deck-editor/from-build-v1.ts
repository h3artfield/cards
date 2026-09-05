/**
 * Handing a sealed build over to its owner.
 *
 * This is the one place a `ValidatedDeckV111` becomes something a person can
 * change. It runs once, when a customer first opens their finished deck in the
 * editor, and the list it produces is recorded twice — once as the working
 * copy and once as the baseline, so the Professor's deck remains recoverable
 * however far the edits go.
 */
import {
  deckCardKeyV1,
  isBasicLandNameV1,
  PROFESSOR_DECK_EDITOR_TYPES_V1_VERSION,
} from "./types-v1";
import type { EditableDeckCardV1, EditableDeckV1 } from "./types-v1";
import type { SolDirectedConstructedDeckV11 } from "../deck-synthesis/professor-sol-directed-types-v1-1";
import type {
  SolDirectedBuildJobRecordV111,
  SolDirectedBuildResultV111,
} from "../deck-synthesis/professor-sol-directed-build-types-v1-1-1";

export const PROFESSOR_DECK_EDITOR_FROM_BUILD_V1_VERSION = "professor-deck-editor-from-build-v1";

/**
 * The constructed deck stores lands as a name and a copy count with no oracle
 * id, because the land base is chosen from a name-keyed pool rather than the
 * candidate dictionary. An optional resolver lets a caller supply ids from the
 * land pool artifact; without one the cards fall back to a name key, which is
 * enough to edit, group, and mark them.
 */
export type LandOracleIdResolverV1 = (name: string) => string | null;

function nonlandCards(deck: SolDirectedConstructedDeckV11): EditableDeckCardV1[] {
  return deck.nonlands.map((card) => ({
    cardKey: deckCardKeyV1({ oracleId: card.oracleId, name: card.name }),
    oracleId: card.oracleId,
    name: card.name,
    copies: 1,
    board: "mainboard" as const,
    isLand: false,
    isBasicLand: false,
    origin: "professor" as const,
    professor: {
      primaryArchitectRequirement: card.primaryArchitectRequirement,
      primaryRole: card.primaryRole,
      secondaryRoles: card.secondaryRoles ?? [],
      packageMembership: card.packageMembership ?? [],
      whyInThisDeck: card.whyInThisDeck,
      structuralNecessity: card.structuralNecessity,
    },
    markerIds: [],
    primaryMarkerId: null,
  }));
}

function landCards(
  deck: SolDirectedConstructedDeckV11,
  resolveLandOracleId?: LandOracleIdResolverV1,
): EditableDeckCardV1[] {
  return deck.lands.map((land) => {
    const oracleId = resolveLandOracleId?.(land.name) ?? null;
    return {
      cardKey: deckCardKeyV1({ oracleId, name: land.name }),
      oracleId,
      name: land.name,
      copies: Math.max(1, Math.floor(land.copies)),
      board: "mainboard" as const,
      isLand: true,
      isBasicLand: isBasicLandNameV1(land.name),
      origin: "professor" as const,
      // Lands are picked by the land-base planner, not the Constructor, so
      // there is no per-card rationale to carry. The mana report covers them.
      professor: null,
      markerIds: [],
      primaryMarkerId: null,
    };
  });
}

/** The Professor's list, in the order the deck panel already displays it. */
export function editableCardsFromConstructedDeckV1(args: {
  constructedDeck: SolDirectedConstructedDeckV11;
  resolveLandOracleId?: LandOracleIdResolverV1;
}): EditableDeckCardV1[] {
  return [
    ...nonlandCards(args.constructedDeck),
    ...landCards(args.constructedDeck, args.resolveLandOracleId),
  ];
}

export type CreateEditableDeckFailureV1 =
  | "BUILD_INCOMPLETE"
  | "NO_CONSTRUCTED_DECK"
  | "NO_OWNER";

export type CreateEditableDeckResultV1 =
  | { ok: true; deck: EditableDeckV1 }
  | { ok: false; failure: CreateEditableDeckFailureV1; message: string };

/**
 * Builds the editable deck for a finished build.
 *
 * Refuses anything that is not a complete build with a deck and an owner —
 * there is nothing to edit before the Professor has finished, and a deck with
 * no owner has nobody who is allowed to change it.
 */
export function createEditableDeckFromBuildV1(args: {
  job: SolDirectedBuildJobRecordV111;
  result: SolDirectedBuildResultV111;
  resolveLandOracleId?: LandOracleIdResolverV1;
  now: string;
}): CreateEditableDeckResultV1 {
  const { job, result } = args;

  if (result.status !== "COMPLETE") {
    return {
      ok: false,
      failure: "BUILD_INCOMPLETE",
      message: "This build has not finished, so there is no deck to edit yet",
    };
  }
  if (!result.constructedDeck) {
    return {
      ok: false,
      failure: "NO_CONSTRUCTED_DECK",
      message: "This build completed without a decklist",
    };
  }
  const customerId = job.userId?.trim();
  if (!customerId) {
    return {
      ok: false,
      failure: "NO_OWNER",
      message: "This build has no signed-in owner, so it cannot be edited",
    };
  }

  const cards = editableCardsFromConstructedDeckV1({
    constructedDeck: result.constructedDeck,
    resolveLandOracleId: args.resolveLandOracleId,
  });

  return {
    ok: true,
    deck: {
      version: PROFESSOR_DECK_EDITOR_TYPES_V1_VERSION,
      deckId: editableDeckIdV1({ customerId, buildId: job.buildId }),
      buildId: job.buildId,
      customerId,
      storeId: job.storeId,
      storeSlug: job.storeSlug,
      deckName: `${job.commanderName} — ${job.playstyle}`,
      bracket: job.bracket,
      commander: {
        oracleId: result.commander.oracleId,
        name: result.commander.name,
        colorIdentity: result.commander.colorIdentity,
      },
      cards,
      markers: [],
      // The same list, deliberately duplicated rather than referenced, because
      // the baseline must not move when the working copy does.
      baselineCards: cards.map((card) => ({ ...card })),
      editedByUser: false,
      revision: 0,
      createdAt: args.now,
      updatedAt: args.now,
    },
  };
}

/** Matches the saved-deck id scheme, so one build maps to one editable deck. */
export function editableDeckIdV1(args: { customerId: string; buildId: string }): string {
  return `${args.customerId}_${args.buildId}`;
}
