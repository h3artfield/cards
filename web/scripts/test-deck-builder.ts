/**
 * Smoke tests for deck builder libs (no network).
 */
import assert from "node:assert/strict";
import { validateCommanderDeck, deckToMoxfieldExport } from "../src/lib/deck-builder/commander-validation";
import { commanderNameToSlug, parseEdhrecCommanderPage } from "../src/lib/deck-builder/edhrec-client";
import { catalogCardFromScryfall } from "../src/lib/deck-builder/scryfall-catalog";
import type { CatalogCard } from "../src/lib/deck-builder/types";

function testSlug() {
  assert.equal(commanderNameToSlug("Atraxa, Praetors' Voice"), "atraxa-praetors-voice");
}

function testCatalogCard() {
  const card = catalogCardFromScryfall({
    id: "abc-123",
    oracle_id: "oracle-sol-ring",
    name: "Sol Ring",
    set: "cmr",
    collector_number: "472",
    cmc: 1,
    type_line: "Artifact",
    color_identity: [],
    keywords: ["Mana Production"],
    legalities: { commander: "legal" },
  });
  assert.ok(card);
  assert.equal(card!.commanderFormatLegal, true);
  assert.equal(card!.id, "abc-123");
  assert.equal(card!.oracleId, "oracle-sol-ring");
  assert.deepEqual(card!.keywords, ["Mana Production"]);
}

function testValidation() {
  const commander: CatalogCard = {
    id: "cmd",
    name: "Atraxa",
    set: "x",
    collectorNumber: "1",
    cmc: 4,
    typeLine: "Legendary Creature — Phyrexian Angel",
    colorIdentity: ["W", "U", "B", "G"],
    commanderFormatLegal: true,
    isCommander: true,
    updatedAt: new Date().toISOString(),
  };
  const sol: CatalogCard = {
    id: "sol",
    name: "Sol Ring",
    set: "x",
    collectorNumber: "2",
    cmc: 1,
    typeLine: "Artifact",
    colorIdentity: [],
    commanderFormatLegal: true,
    isCommander: false,
    updatedAt: new Date().toISOString(),
  };
  const map = new Map([
    [commander.id, commander],
    [sol.id, sol],
  ]);
  const main = Array.from({ length: 99 }, () => ({
    scryfallId: "sol",
    qty: 1,
    board: "main" as const,
  }));
  const result = validateCommanderDeck({
    commanderId: "cmd",
    cards: [{ scryfallId: "cmd", qty: 1, board: "commander" }, ...main],
    catalogById: map,
  });
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.code === "singleton"));
}

function testMoxfieldExport() {
  const map = new Map<string, CatalogCard>([
    [
      "sol",
      {
        id: "sol",
        name: "Sol Ring",
        set: "x",
        collectorNumber: "1",
        cmc: 1,
        typeLine: "Artifact",
        colorIdentity: [],
        commanderFormatLegal: true,
        isCommander: false,
        updatedAt: "",
      },
    ],
  ]);
  const text = deckToMoxfieldExport({
    commanderName: "Atraxa",
    cards: [{ scryfallId: "sol", qty: 1, board: "main" }],
    catalogById: map,
  });
  assert.match(text, /CMDR: 1 Atraxa/);
  assert.match(text, /1 Sol Ring/);
}

function testEdhrecParse() {
  const meta = parseEdhrecCommanderPage(
    {
      container: {
        json_dict: {
          card: {
            id: "uuid-1",
            name: "Test Commander",
            rank: 10,
            color_identity: ["U", "R"],
          },
          cardlists: [
            {
              header: "High Synergy Cards",
              tag: "highsynergycards",
              cardviews: [
                {
                  id: "uuid-2",
                  name: "Sol Ring",
                  synergy: 0.5,
                  num_decks: 100,
                  potential_decks: 200,
                },
              ],
            },
          ],
        },
      },
      panels: { taglinks: [{ slug: "voltron", value: "Voltron", count: 42 }] },
    },
    "test-commander",
  );
  assert.equal(meta.commanderSlug, "test-commander");
  assert.equal(meta.recommendations.length, 1);
  assert.equal(meta.themes[0]?.slug, "voltron");
}

testSlug();
testCatalogCard();
testValidation();
testMoxfieldExport();
testEdhrecParse();

console.log("deck-builder tests passed");
