/**
 * Tests for the read-time markers.
 *
 * The one property that matters most is that absent data produces no marker
 * rather than a marker asserting the negative — a collection that failed to
 * load must not tell the customer they own nothing.
 */
import assert from "node:assert/strict";
import { derivedMarkersForCardV1, markerFacetsV1 } from "./derived-markers-v1";
import { deckCardKeyV1, PROFESSOR_DECK_EDITOR_TYPES_V1_VERSION } from "./types-v1";
import type { EditableDeckCardV1, EditableDeckV1 } from "./types-v1";

function card(overrides: Partial<EditableDeckCardV1> = {}): EditableDeckCardV1 {
  const name = overrides.name ?? "Ohran Frostfang";
  const oracleId = overrides.oracleId === undefined ? "o-ohran" : overrides.oracleId;
  return {
    cardKey: deckCardKeyV1({ oracleId, name }),
    oracleId,
    name,
    copies: 1,
    board: "mainboard",
    isLand: false,
    isBasicLand: false,
    origin: "professor",
    professor: {
      primaryArchitectRequirement: "REQ-POISON",
      primaryRole: "poison_payoff",
      secondaryRoles: [],
      packageMembership: ["deathtouch-core"],
      whyInThisDeck: "Grants deathtouch and draws off every connection.",
      structuralNecessity: "REQUIRED",
    },
    markerIds: [],
    primaryMarkerId: null,
    ...overrides,
  };
}

function deck(cards: EditableDeckCardV1[], markers: EditableDeckV1["markers"] = []): EditableDeckV1 {
  return {
    version: PROFESSOR_DECK_EDITOR_TYPES_V1_VERSION,
    deckId: "d",
    buildId: "b",
    customerId: "c",
    storeId: "s",
    storeSlug: "the-game-lodge",
    deckName: "Fynn",
    bracket: 3,
    commander: { oracleId: "cmd", name: "Fynn, the Fangbearer", colorIdentity: ["G"] },
    cards,
    markers,
    baselineCards: cards.map((c) => ({ ...c })),
    editedByUser: false,
    revision: 0,
    createdAt: "2026-09-04T00:00:00.000Z",
    updatedAt: "2026-09-04T00:00:00.000Z",
  };
}

function testMissingFactsProduceNoMarkers() {
  const markers = derivedMarkersForCardV1(card(), {});
  const kinds = markers.map((m) => m.kind);
  assert.equal(kinds.includes("owned"), false, "no collection data must not mean 'not owned'");
  assert.equal(kinds.includes("in_stock"), false);
  assert.equal(kinds.includes("game_changer"), false);
  // The card's own facts still produce markers, since those need no lookup.
  assert.deepEqual(kinds, ["professor_role", "professor_package", "structural"]);
  console.log("PASS  absent facts produce no marker, not a negative marker");
}

function testOwnedMatchesOnIdOrName() {
  const byId = derivedMarkersForCardV1(card(), { ownedOracleIds: new Set(["o-ohran"]) });
  assert.ok(byId.some((m) => m.kind === "owned"));

  // Lands carry no oracle id, so the name path is the only one available.
  const land = card({ name: "Forest", oracleId: null, isLand: true, professor: null });
  const byName = derivedMarkersForCardV1(land, { ownedNames: new Set(["forest"]) });
  assert.ok(byName.some((m) => m.kind === "owned"), "a land must still be matchable by name");

  const idOnly = derivedMarkersForCardV1(land, { ownedOracleIds: new Set(["o-forest"]) });
  assert.equal(idOnly.some((m) => m.kind === "owned"), false);
  console.log("PASS  owned matches on oracle id or on name, so lands are covered");
}

function testGameChangerNeedsAnOracleId() {
  const known = derivedMarkersForCardV1(card({ name: "Rhystic Study", oracleId: "o-rhystic" }), {
    gameChangerOracleIds: new Set(["o-rhystic"]),
  });
  assert.ok(known.some((m) => m.kind === "game_changer"));

  // The Game Changer list is defined on oracle ids, so a card with none cannot
  // be matched against it. Guessing by name would be a legality-adjacent claim
  // made on a weaker key than the list itself uses.
  const unkeyed = derivedMarkersForCardV1(card({ name: "Rhystic Study", oracleId: null }), {
    gameChangerOracleIds: new Set(["o-rhystic"]),
  });
  assert.equal(unkeyed.some((m) => m.kind === "game_changer"), false);
  console.log("PASS  Game Changer is only claimed on the key the list is defined on");
}

function testUserAdditionIsFlaggedAndExplained() {
  const added = derivedMarkersForCardV1(
    card({ origin: "user", professor: null, name: "Sol Ring" }),
    {},
  );
  const marker = added.find((m) => m.kind === "user_added");
  assert.ok(marker);
  assert.match(marker!.detail!, /grade does not account for it/);
  assert.equal(
    added.some((m) => m.kind === "professor_role"),
    false,
    "a user addition has no Professor role to show",
  );
  console.log("PASS  a user addition is flagged, and says why it has no rationale");
}

function testRoleLabelsAreReadable() {
  const markers = derivedMarkersForCardV1(card(), {});
  assert.equal(markers.find((m) => m.kind === "professor_role")!.label, "Poison payoff");
  assert.equal(markers.find((m) => m.kind === "professor_package")!.label, "Deathtouch core");
  console.log("PASS  snake_case roles become readable labels");
}

function testFacetsCountMainboardOnlyAndSortByUse() {
  const cards = [
    card({ name: "A", oracleId: "o-a" }),
    card({ name: "B", oracleId: "o-b" }),
    card({
      name: "C",
      oracleId: "o-c",
      professor: { ...card().professor!, primaryRole: "ramp", packageMembership: [] },
    }),
    // Parked, so it must not appear in the counts.
    card({ name: "D", oracleId: "o-d", board: "considering" }),
  ];
  const withMarker = cards.map((c, i) =>
    i === 0 ? { ...c, markerIds: ["d:need-to-buy"] } : c,
  );

  const facets = markerFacetsV1(
    deck(withMarker, [{ id: "d:need-to-buy", label: "Need to buy", scope: "deck" }]),
    {},
  );

  const poison = facets.find((f) => f.id === "role:poison_payoff")!;
  assert.equal(poison.count, 2, "only mainboard A and B, not the parked D");
  assert.equal(facets.find((f) => f.id === "role:ramp")!.count, 1);

  const userFacet = facets.find((f) => f.id === "d:need-to-buy")!;
  assert.equal(userFacet.kind, "user");
  assert.equal(userFacet.label, "Need to buy", "user markers resolve to their label");

  const counts = facets.map((f) => f.count);
  assert.deepEqual([...counts].sort((a, b) => b - a), counts, "sorted by count, descending");
  console.log("PASS  facets count mainboard only and sort by how many cards use them");
}

const tests = [
  testMissingFactsProduceNoMarkers,
  testOwnedMatchesOnIdOrName,
  testGameChangerNeedsAnOracleId,
  testUserAdditionIsFlaggedAndExplained,
  testRoleLabelsAreReadable,
  testFacetsCountMainboardOnlyAndSortByUse,
];

let failed = 0;
for (const test of tests) {
  try {
    test();
  } catch (err) {
    failed += 1;
    console.error(`FAIL  ${test.name}`);
    console.error(err instanceof Error ? err.message : err);
  }
}

console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed > 0) process.exit(1);
