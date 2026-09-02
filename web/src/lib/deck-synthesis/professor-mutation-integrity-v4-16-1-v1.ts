/**
 * Professor v4.16.1 — mutation integrity (CUT absent, ADD present, legality preserved).
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { deckListShaFromCards } from "./professor-canonical-card-identity-v4-15-1-v1";
import {
  cardAlreadyInWorkingDeckV4161,
  type CouncilCardLikeV4161,
} from "./professor-canonical-legality-v4-16-1-v1";
import { findCouncilCardByIdentity } from "./professor-canonical-card-identity-v4-15-1-v1";

export const PROFESSOR_MUTATION_INTEGRITY_V4_16_1_V1_VERSION = "professor-mutation-integrity-v4-16-1-v1";

export type MutationRecordV4161 = {
  mutationId: string;
  revision: number;
  kind: "REPLACE" | "CUT" | "ADD";
  cutOracleId: string | null;
  cutName: string | null;
  addOracleId: string | null;
  addName: string | null;
  beforeFingerprint: string;
  afterFingerprint: string;
  integrityPass: boolean;
  failureReason?: string;
};

export type MutationIntegrityResultV4161 = {
  pass: boolean;
  record: MutationRecordV4161;
  selectedCards: CouncilCardLikeV4161[];
};

function fingerprintCards(cards: CouncilCardLikeV4161[], catalog?: DeckResolutionCatalog | null): string {
  return deckListShaFromCards(
    cards.map((c) => ({ name: c.name, oracleId: c.oracleId ?? null })),
    catalog ?? undefined,
  );
}

export function assertReplaceMutationIntegrityV4161(args: {
  selectedCards: CouncilCardLikeV4161[];
  cutName: string;
  addName: string;
  addOracleId?: string | null;
  catalog?: DeckResolutionCatalog | null;
}): { pass: boolean; reason?: string } {
  const cutPresent = Boolean(findCouncilCardByIdentity(args.selectedCards, args.cutName, args.catalog ?? undefined));
  const addPresent = Boolean(findCouncilCardByIdentity(args.selectedCards, args.addName, args.catalog ?? undefined));
  if (cutPresent) return { pass: false, reason: `CUT still present: ${args.cutName}` };
  if (!addPresent) return { pass: false, reason: `ADD missing: ${args.addName}` };
  return { pass: true };
}

export function commitReplaceMutationV4161<T extends CouncilCardLikeV4161>(args: {
  selectedCards: T[];
  cut: T;
  add: T;
  revision: number;
  catalog?: DeckResolutionCatalog | null;
}): MutationIntegrityResultV4161 {
  const beforeFingerprint = fingerprintCards(args.selectedCards, args.catalog);
  const withoutCut = args.selectedCards.filter((c) => c.cardId !== args.cut.cardId);
  const addCheck = cardAlreadyInWorkingDeckV4161({
    selected: withoutCut,
    candidate: args.add,
    catalog: args.catalog,
  });
  if (addCheck) {
    const record: MutationRecordV4161 = {
      mutationId: `mut-${args.revision}-replace-fail`,
      revision: args.revision,
      kind: "REPLACE",
      cutOracleId: args.cut.oracleId ?? null,
      cutName: args.cut.name,
      addOracleId: args.add.oracleId ?? null,
      addName: args.add.name,
      beforeFingerprint,
      afterFingerprint: beforeFingerprint,
      integrityPass: false,
      failureReason: `ADD would violate singleton: ${args.add.name}`,
    };
    return { pass: false, record, selectedCards: args.selectedCards };
  }

  const selectedCards = [
    ...withoutCut,
    { ...args.add, status: "SELECTED" as const },
  ] as T[];
  const afterFingerprint = fingerprintCards(selectedCards, args.catalog);
  const integrity = assertReplaceMutationIntegrityV4161({
    selectedCards,
    cutName: args.cut.name,
    addName: args.add.name,
    addOracleId: args.add.oracleId,
    catalog: args.catalog,
  });

  const record: MutationRecordV4161 = {
    mutationId: `mut-${args.revision}-replace`,
    revision: args.revision,
    kind: "REPLACE",
    cutOracleId: args.cut.oracleId ?? null,
    cutName: args.cut.name,
    addOracleId: args.add.oracleId ?? null,
    addName: args.add.name,
    beforeFingerprint,
    afterFingerprint,
    integrityPass: integrity.pass,
    failureReason: integrity.reason,
  };

  return {
    pass: integrity.pass,
    record,
    selectedCards: integrity.pass ? selectedCards : args.selectedCards,
  };
}
