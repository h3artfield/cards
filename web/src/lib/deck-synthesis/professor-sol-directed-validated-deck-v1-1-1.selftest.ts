/**
 * Proves the property the type exists for: a verdict always describes the deck
 * sitting next to it, and extending the candidate dictionary mid-build is seen
 * by later validations.
 */
import assert from "node:assert/strict";
import { normalizeCardNameForMatch } from "./professor-card-name-match-client-v4-15-1-v1";
import { createDeckValidatorV111 } from "./professor-sol-directed-validated-deck-v1-1-1";
import type { CanonicalCardFactsV11, SolDirectedConstructedDeckV11 } from "./professor-sol-directed-types-v1-1";

let n = 0;
function check(label: string, fn: () => void): void {
  fn();
  n += 1;
  console.log(`  ok  ${label}`);
}

type CardSpec = { oracleId: string; name: string; typeLine: string; colorIdentity: string[] };

const COMMANDER: CardSpec = {
  oracleId: "cmd-1",
  name: "Test Commander",
  typeLine: "Legendary Creature — Human",
  colorIdentity: ["G"],
};

const NONLANDS: CardSpec[] = Array.from({ length: 3 }, (_, i) => ({
  oracleId: `non-${i}`,
  name: `Nonland ${i}`,
  typeLine: "Creature — Beast",
  colorIdentity: ["G"],
}));

const EXTRA: CardSpec = {
  oracleId: "extra-1",
  name: "Late Addition",
  typeLine: "Artifact",
  colorIdentity: [],
};

const FOREST: CardSpec = {
  oracleId: "forest-1",
  name: "Forest",
  typeLine: "Basic Land — Forest",
  colorIdentity: [],
};

const ALL = [COMMANDER, ...NONLANDS, EXTRA, FOREST];

function catalogCard(spec: CardSpec) {
  return {
    oracleId: spec.oracleId,
    canonicalName: spec.name,
    typeLine: spec.typeLine,
    oracleText: "",
    colorIdentity: spec.colorIdentity,
    manaValue: 1,
    legalities: { commander: "legal" as const },
    games: ["paper"],
  };
}

// Minimal stand-in for the deck resolution catalog: only the lookups the
// validator reaches for.
function stubCatalog() {
  const byOracleId = new Map(ALL.map((c) => [c.oracleId, catalogCard(c)] as const));
  const byNormalizedName = new Map<string, ReturnType<typeof catalogCard>[]>();
  for (const spec of ALL) {
    byNormalizedName.set(normalizeCardNameForMatch(spec.name), [catalogCard(spec)]);
  }
  return {
    byOracleId,
    byNormalizedName,
    paperByOracleId: byOracleId,
    officialAliasByNormalizedName: new Map<string, string>(),
    competitiveDeckOracleIds: new Set(ALL.map((c) => c.oracleId)),
    nonCompetitiveOracleReasons: new Map<string, string>(),
  } as never;
}

function facts(spec: CardSpec): CanonicalCardFactsV11 {
  return {
    oracleId: spec.oracleId,
    name: spec.name,
    manaValue: 1,
    typeLine: spec.typeLine,
    colorIdentity: spec.colorIdentity,
    oracleText: "",
    semanticFunctions: [],
    semanticOracle: null,
    commanderLegal: true,
    isLand: spec.typeLine.includes("Land"),
  };
}

function deckOf(nonlands: CardSpec[]): SolDirectedConstructedDeckV11 {
  return {
    commander: {
      oracleId: COMMANDER.oracleId,
      name: COMMANDER.name,
      colorIdentity: COMMANDER.colorIdentity,
    } as never,
    landCount: 1,
    lands: [{ name: FOREST.name, copies: 1 }],
    nonlands: nonlands.map((spec) => ({
      oracleId: spec.oracleId,
      name: spec.name,
      typeLine: spec.typeLine,
      primaryArchitectRequirement: "req-a",
      primaryRole: "role",
      secondaryRoles: [],
      packageMembership: [],
      whyInThisDeck: "",
      structuralNecessity: "FLEX" as const,
    })),
    primaryWinPaths: [],
    secondaryWinPaths: [],
    expectedPlayPattern: "",
    structuralNecessities: [],
    replaceableFlex: [],
  };
}

function makeValidator(dictionary: Record<string, CanonicalCardFactsV11>) {
  return createDeckValidatorV111({
    catalog: stubCatalog(),
    contract: {
      cardRequirements: [{ requirementId: "req-a", requestedCount: 3 }],
    } as never,
    candidateDictionary: dictionary,
    landPool: {
      entries: [
        {
          name: FOREST.name,
          oracleId: FOREST.oracleId,
          isBasic: true,
          basicKind: "Forest",
          maxCopies: 99,
          category: "basic",
          resolved: true,
        },
      ],
      nonBasicOracleIds: [],
    } as never,
    identityLedger: [],
  });
}

console.log("professor-sol-directed-validated-deck-v1-1-1 selftest");

const dictionary: Record<string, CanonicalCardFactsV11> = Object.fromEntries(
  NONLANDS.map((spec) => [spec.oracleId, facts(spec)]),
);
const validator = makeValidator(dictionary);

check("validating produces a verdict bound to that deck", () => {
  const validated = validator.validate(deckOf(NONLANDS));
  assert.equal(validated.deck.nonlands.length, 3);
  assert.ok(validated.validation, "a validated deck always carries a verdict");
});

check("the pair cannot be pulled apart and reassigned", () => {
  const validated = validator.validate(deckOf(NONLANDS));
  assert.throws(
    () => {
      (validated as { deck: unknown }).deck = deckOf([]);
    },
    /read only|readonly|Cannot assign/i,
    "the deck must not be swappable underneath its verdict",
  );
});

check("mutating returns a fresh verdict rather than reusing the old one", () => {
  const before = validator.validate(deckOf(NONLANDS));
  const after = validator.mutate(before, (deck) => ({
    ...deck,
    nonlands: deck.nonlands.slice(0, 2),
  }));
  assert.equal(before.deck.nonlands.length, 3, "the input value is untouched");
  assert.equal(after.deck.nonlands.length, 2);
  assert.notEqual(
    before.validation,
    after.validation,
    "a mutation must not carry the previous verdict forward",
  );
});

check("a card missing from the candidate dictionary is rejected", () => {
  // This is the check that makes bracket attainment's registration necessary.
  const validated = validator.validate(deckOf([...NONLANDS.slice(0, 2), EXTRA]));
  assert.equal(validated.validation.pass, false);
  assert.ok(
    validated.validation.violations.some((v) => v.startsWith("NONLAND_NOT_IN_CANDIDATE_DICTIONARY")),
    `expected a dictionary violation, got: ${validated.validation.violations.join("; ")}`,
  );
  assert.equal(validated.validation.candidateTracePass, false);
});

check("extending the dictionary mid-build is visible to later validations", () => {
  // The dictionary is held by reference precisely so the attainment pass can
  // register an addition and have the next validation accept it.
  const deck = deckOf([...NONLANDS.slice(0, 2), EXTRA]);
  assert.equal(validator.validate(deck).validation.candidateTracePass, false);
  dictionary[EXTRA.oracleId] = facts(EXTRA);
  assert.equal(
    validator.validate(deck).validation.candidateTracePass,
    true,
    "the same validator must see the registration",
  );
});

console.log(`\nprofessor-sol-directed-validated-deck-v1-1-1 selftest passed (${n} checks)`);
