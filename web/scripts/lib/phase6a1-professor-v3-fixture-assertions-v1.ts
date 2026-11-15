/**
 * Shared typed assertion helpers for Professor v3 deterministic fixtures.
 */
import { createHash } from "node:crypto";
import type { EvidenceRef } from "../../src/lib/deck-synthesis/professor-planning-evidence-v3";
import type { CausalEdgeV3, StrategicAssertionV3 } from "../../src/lib/deck-synthesis/strategic-assertion-vocabulary-v3";
import type { ProfessorEvidenceLedgerEntryV3 } from "../../src/lib/deck-synthesis/professor-v3-evidence-ledger-v1";
import { MULDROTHA_CAST_FACT, MULDROTHA_LAND_FACT, MULDROTHA_ORACLE_ID } from "./phase6a1-professor-v3-grounding-fixtures-v1";

function sha(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export const FIXTURE_CR_305_1_RULE_ID = "cr-305-1-land-play-limit";
export const FIXTURE_CR_701_13_RULE_ID = "cr-701-13-mill";

export const FIXTURE_PINNED_RULES_LEDGER: ProfessorEvidenceLedgerEntryV3[] = [
  {
    evidenceId: FIXTURE_CR_305_1_RULE_ID,
    kind: "RULES",
    source: "comprehensive_rules",
    sourceVersion: "June 19, 2026",
    citationLabel: "CR 305.1",
    exactText:
      "305.1. A player may play a land card from their hand during either of their main phases if the stack is empty and they have priority.",
    contentSha256: sha(
      "305.1. A player may play a land card from their hand during either of their main phases if the stack is empty and they have priority.",
    ),
  },
  {
    evidenceId: FIXTURE_CR_701_13_RULE_ID,
    kind: "RULES",
    source: "comprehensive_rules",
    sourceVersion: "June 19, 2026",
    citationLabel: "CR 701.13",
    exactText: "701.13. To mill a card, a player puts the top card of their library into their graveyard.",
    contentSha256: sha("701.13. To mill a card, a player puts the top card of their library into their graveyard."),
  },
];

export function mechanismRef(factIds: string[]): EvidenceRef {
  return { kind: "MECHANISM_FACT", factIds };
}

export function muldrothaBothFactsRef(): EvidenceRef {
  return mechanismRef([MULDROTHA_LAND_FACT, MULDROTHA_CAST_FACT]);
}

export function oracleRef(oracleSpan?: string): EvidenceRef {
  return { kind: "ORACLE_CLAUSE", sourceOracleId: MULDROTHA_ORACLE_ID, oracleSpan };
}

export function rulesRef(ruleId: string): EvidenceRef {
  return { kind: "RULES_EVIDENCE", ruleId };
}

export function ragRef(evidenceIds: string[]): EvidenceRef {
  return { kind: "RAG_EVIDENCE", evidenceIds };
}

export function researchRef(evidenceIds: string[]): EvidenceRef {
  return { kind: "RESEARCH_EVIDENCE", evidenceIds };
}

export function castFromGraveyardAssertion(args: {
  assertionId: string;
  packageId: string;
  object?: string;
  provider?: string;
}): StrategicAssertionV3 {
  return {
    assertionId: args.assertionId,
    packageId: args.packageId,
    predicate: "PERMITS_ACTION",
    action: "CAST_FROM_GRAVEYARD",
    object: args.object ?? "PERMANENT_SPELL",
    sourceZone: "GRAVEYARD",
    provider: args.provider ?? "COMMANDER",
    evidenceRefs: [mechanismRef([MULDROTHA_CAST_FACT])],
  };
}

export function landFromGraveyardAssertion(args: { assertionId: string; packageId: string }): StrategicAssertionV3 {
  return {
    assertionId: args.assertionId,
    packageId: args.packageId,
    predicate: "PERMITS_ACTION",
    action: "PLAY_FROM_GRAVEYARD",
    object: "LAND_CARD",
    sourceZone: "GRAVEYARD",
    provider: "COMMANDER",
    evidenceRefs: [mechanismRef([MULDROTHA_LAND_FACT])],
  };
}

export function additionalLandAssertion(args: { assertionId: string; packageId: string }): StrategicAssertionV3 {
  return {
    assertionId: args.assertionId,
    packageId: args.packageId,
    predicate: "PERMITS_ACTION",
    action: "ADDITIONAL_LAND_PLAY",
    evidenceRefs: [mechanismRef([MULDROTHA_LAND_FACT])],
  };
}

export function instantGyAssertion(args: { assertionId: string; packageId: string }): StrategicAssertionV3 {
  return {
    assertionId: args.assertionId,
    packageId: args.packageId,
    predicate: "PERMITS_ACTION",
    action: "CAST_FROM_GRAVEYARD",
    object: "INSTANT",
    sourceZone: "GRAVEYARD",
    provider: "COMMANDER",
    evidenceRefs: [mechanismRef([MULDROTHA_CAST_FACT])],
  };
}

export function grantKeywordAssertion(args: {
  assertionId: string;
  packageId: string;
  keyword: string;
  evidenceRefs?: EvidenceRef[];
}): StrategicAssertionV3 {
  return {
    assertionId: args.assertionId,
    packageId: args.packageId,
    predicate: "GRANTS_KEYWORD",
    object: args.keyword,
    provider: "COMMANDER",
    evidenceRefs: args.evidenceRefs ?? [mechanismRef([MULDROTHA_CAST_FACT])],
  };
}

export function tutorAssertion(args: {
  assertionId: string;
  packageId: string;
  evidenceRefs?: EvidenceRef[];
}): StrategicAssertionV3 {
  return {
    assertionId: args.assertionId,
    packageId: args.packageId,
    predicate: "PERMITS_ACTION",
    action: "TUTOR",
    evidenceRefs: args.evidenceRefs ?? [mechanismRef([MULDROTHA_CAST_FACT])],
  };
}

export function drawCardAssertion(args: {
  assertionId: string;
  packageId: string;
  evidenceRefs?: EvidenceRef[];
}): StrategicAssertionV3 {
  return {
    assertionId: args.assertionId,
    packageId: args.packageId,
    predicate: "PERMITS_ACTION",
    action: "DRAW_CARD",
    evidenceRefs: args.evidenceRefs ?? [mechanismRef([MULDROTHA_CAST_FACT])],
  };
}

export function producesGraveyardPermanents(args: {
  assertionId: string;
  packageId: string;
  evidenceRefs: EvidenceRef[];
}): StrategicAssertionV3 {
  return {
    assertionId: args.assertionId,
    packageId: args.packageId,
    predicate: "PRODUCES_STATE",
    resourceOrState: "GRAVEYARD_PERMANENTS",
    action: "MOVE_CARDS",
    destinationZone: "GRAVEYARD",
    evidenceRefs: args.evidenceRefs,
  };
}

export function requiresGraveyardPermanents(args: {
  assertionId: string;
  packageId: string;
  evidenceRefs?: EvidenceRef[];
}): StrategicAssertionV3 {
  return {
    assertionId: args.assertionId,
    packageId: args.packageId,
    predicate: "REQUIRES_STATE",
    resourceOrState: "GRAVEYARD_PERMANENTS",
    evidenceRefs: args.evidenceRefs ?? [mechanismRef([MULDROTHA_CAST_FACT])],
  };
}

export function harmonyEdge(args: {
  edgeId: string;
  producerAssertionId: string;
  consumerAssertionId: string;
  resourceOrState?: string;
}): CausalEdgeV3 {
  return {
    edgeId: args.edgeId,
    producerAssertionId: args.producerAssertionId,
    consumerAssertionId: args.consumerAssertionId,
    resourceOrState: args.resourceOrState ?? "GRAVEYARD_PERMANENTS",
    evidenceRefs: [mechanismRef([MULDROTHA_CAST_FACT])],
  };
}
