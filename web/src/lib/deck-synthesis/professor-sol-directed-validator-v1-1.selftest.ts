import assert from "node:assert/strict";
import { validateSolDirectedDeckV11 } from "./professor-sol-directed-validator-v1-1";
import { normalizeCardNameForMatch } from "./professor-canonical-card-identity-v4-15-1-v1";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { GoldenCatalogOracleCard } from "../deck-builder/golden-catalog/schemas";
import type {
  RetrievalContractV11,
  SolDirectedConstructedDeckV11,
} from "./professor-sol-directed-types-v1-1";

let n = 0;
function check(label: string, fn: () => void): void {
  fn();
  n += 1;
  console.log(`  ok  ${label}`);
}

function landCard(args: {
  name: string;
  colorIdentity: string[];
  basic: boolean;
}): GoldenCatalogOracleCard {
  return {
    oracleId: `oracle:${args.name.toLowerCase().replace(/[^a-z]+/g, "-")}`,
    canonicalName: args.name,
    typeLine: args.basic ? `Basic Land — ${args.name}` : "Land",
    colors: [],
    colorIdentity: args.colorIdentity,
    manaValue: 0,
    oracleText: "",
    legalities: { commander: "legal" },
  } as unknown as GoldenCatalogOracleCard;
}

/**
 * Basics carry an unreliable colorIdentity in the shadow catalog — Swamp is
 * deliberately given an empty identity here, which is what let an off-color
 * basic ship as legal before the land check derived identity from the name.
 */
function buildCatalog(cards: GoldenCatalogOracleCard[]): DeckResolutionCatalog {
  const byOracleId = new Map<string, GoldenCatalogOracleCard>();
  const byNormalizedName = new Map<string, GoldenCatalogOracleCard[]>();
  for (const card of cards) {
    byOracleId.set(card.oracleId, card);
    const key = normalizeCardNameForMatch(card.canonicalName);
    const bucket = byNormalizedName.get(key) ?? [];
    bucket.push(card);
    byNormalizedName.set(key, bucket);
  }
  return {
    byOracleId,
    byNormalizedName,
    paperByOracleId: new Map(),
    officialAliasByNormalizedName: new Map(),
    competitiveDeckOracleIds: new Set(),
    nonCompetitiveOracleReasons: new Map(),
  } as unknown as DeckResolutionCatalog;
}

const catalog = buildCatalog([
  landCard({ name: "Forest", colorIdentity: [], basic: true }),
  landCard({ name: "Swamp", colorIdentity: [], basic: true }),
  landCard({ name: "Wastes", colorIdentity: [], basic: true }),
  landCard({ name: "Command Tower", colorIdentity: [], basic: false }),
  landCard({ name: "Bayou", colorIdentity: ["B", "G"], basic: false }),
]);

const gruulContract = {
  nonlandSlotsRequired: 64,
  landSlotsRequired: 35,
} as unknown as RetrievalContractV11;

function gruulDeck(
  lands: Array<{ name: string; copies: number }>,
): SolDirectedConstructedDeckV11 {
  return {
    commander: {
      name: "Omnath, Locus of Rage",
      oracleId: "oracle:omnath-locus-of-rage",
      colorIdentity: ["G", "R"],
      typeLine: "Legendary Creature — Elemental",
    },
    landCount: lands.reduce((sum, land) => sum + land.copies, 0),
    lands,
    nonlands: [],
    primaryWinPaths: [],
    secondaryWinPaths: [],
    structuralNecessities: [],
    replaceableFlex: [],
  } as unknown as SolDirectedConstructedDeckV11;
}

function violationsFor(lands: Array<{ name: string; copies: number }>): string[] {
  return validateSolDirectedDeckV11({
    deck: gruulDeck(lands),
    catalog,
    contract: gruulContract,
  }).violations;
}

console.log("professor-sol-directed-validator-v1-1 selftest");

check("an off-identity basic in the land base is reported, not silently accepted", () => {
  const violations = violationsFor([
    { name: "Forest", copies: 28 },
    { name: "Swamp", copies: 7 },
  ]);
  assert.ok(
    violations.includes("OFF_COLOR_LAND:Swamp"),
    `expected OFF_COLOR_LAND:Swamp, got ${violations.join(", ")}`,
  );
});

check("in-identity basics are not reported as off-color", () => {
  const violations = violationsFor([{ name: "Forest", copies: 35 }]);
  assert.deepEqual(
    violations.filter((v) => v.startsWith("OFF_COLOR_LAND")),
    [],
  );
});

check("colorless basics stay legal under a two-color identity", () => {
  const violations = violationsFor([
    { name: "Forest", copies: 33 },
    { name: "Wastes", copies: 2 },
  ]);
  assert.deepEqual(
    violations.filter((v) => v.startsWith("OFF_COLOR_LAND")),
    [],
  );
});

check("an off-identity nonbasic land is reported from its printed identity", () => {
  const violations = violationsFor([
    { name: "Forest", copies: 34 },
    { name: "Bayou", copies: 1 },
  ]);
  assert.ok(
    violations.includes("OFF_COLOR_LAND:Bayou"),
    `expected OFF_COLOR_LAND:Bayou, got ${violations.join(", ")}`,
  );
});

check("a colorless nonbasic land stays legal", () => {
  const violations = violationsFor([
    { name: "Forest", copies: 34 },
    { name: "Command Tower", copies: 1 },
  ]);
  assert.deepEqual(
    violations.filter((v) => v.startsWith("OFF_COLOR_LAND")),
    [],
  );
});

console.log(`\nprofessor-sol-directed-validator-v1-1 selftest passed (${n} checks)`);
