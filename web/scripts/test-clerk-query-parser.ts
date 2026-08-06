/**
 * Unit tests for clerk inventory query parser (no network).
 */
import assert from "node:assert/strict";
import {
  cardMatchesSemanticFilter,
  isColorIdentityInventoryRequest,
  itemMatchesSemanticFilter,
  isSetProductInventoryRequest,
  parseClerkInventoryQuery,
  parsePriceSortFromQuery,
} from "../src/lib/store-inventory/clerk-tools/clerk-query-parser";
import type { InventoryItem } from "../src/lib/types";

function testCmcHigherThan() {
  const parsed = parseClerkInventoryQuery({
    userQuestion: "I need cards with a cmc higher than 5",
  });
  assert.equal(parsed.semantic.cmcMin, 6);
  assert.equal(parsed.semanticOnly, true);
  assert.equal(parsed.q, undefined);
}

function testMassReanimationSpells() {
  const parsed = parseClerkInventoryQuery({
    userQuestion: "I'm looking for mass reanimation spells",
  });
  assert.ok(parsed.semantic.oracleTagsAny?.includes("mass-reanimation"));
  assert.deepEqual(parsed.semantic.typeIncludes, ["instant", "sorcery"]);
  assert.equal(parsed.semanticOnly, true);
}

function testNamedCardLookup() {
  const parsed = parseClerkInventoryQuery({
    userQuestion: "Do you have Sol Ring?",
    cardNames: ["Sol Ring"],
  });
  assert.equal(parsed.q, "Sol Ring");
  assert.equal(parsed.semanticOnly, false);
}

function testSemanticItemFilter() {
  const item = {
    catalogCmc: 6,
    catalogTypeLine: "Sorcery",
    catalogOracleTags: ["mass-reanimation"],
    catalogOracleText: "Return all creature cards from all graveyards to the battlefield.",
    catalogKeywords: [],
  } as InventoryItem;

  assert.equal(
    itemMatchesSemanticFilter(item, {
      cmcMin: 6,
      oracleTagsAny: ["mass-reanimation"],
      typeIncludes: ["sorcery"],
    }),
    true,
  );

  assert.equal(
    itemMatchesSemanticFilter(item, { cmcMin: 7 }),
    false,
  );
}

function testOracleTextFallbackBeforeTagsBackfill() {
  const item = {
    catalogOracleTags: [],
    catalogOracleText:
      "Each player returns all creature cards from their graveyards to the battlefield.",
  } as InventoryItem;

  assert.equal(
    itemMatchesSemanticFilter(item, {
      oracleTagsAny: ["mass-reanimation"],
      oracleTextAny: ["creature cards from their graveyards"],
    }),
    true,
  );
}

function testCardSemanticFilter() {
  assert.equal(
    cardMatchesSemanticFilter(
      { cmc: 3, keywords: ["Flash"], typeLine: "Instant" },
      { cmcMax: 3, keywordsAny: ["Flash"], typeIncludes: ["instant"] },
    ),
    true,
  );
}

function testRampCardsYouHave() {
  const parsed = parseClerkInventoryQuery({
    userQuestion: "what are some ramp cards you have?",
  });
  assert.ok(parsed.semantic.oracleTagsAny?.includes("ramp"));
  assert.equal(parsed.semanticOnly, true);
  assert.equal(parsed.q, undefined);
}

testCmcHigherThan();
testMassReanimationSpells();
testNamedCardLookup();
testRampCardsYouHave();

function testFinalFantasySetSearch() {
  const parsed = parseClerkInventoryQuery({
    userQuestion: "show me the final fantasy cards you have",
  });
  assert.equal(parsed.q, "final fantasy");
  assert.equal(parsed.browseGame, "magic");
  assert.equal(parsed.searchLimit, 96);
}

function testFinalFantasy7Search() {
  const parsed = parseClerkInventoryQuery({
    userQuestion: "any type card from ff7",
  });
  assert.equal(parsed.q, "final fantasy");
  assert.equal(parsed.setProductTheme, "ff7");
  assert.ok(parsed.semantic.nameIncludesAny?.includes("cloud"));
  assert.equal(parsed.browseGame, "magic");
}

function testFinalFantasy7ConversationFollowUp() {
  const parsed = parseClerkInventoryQuery({
    userQuestion: "any type card from ff7",
    conversationSummary:
      "Customer: show me the final fantasy cards you have\nClerk: Are you looking for a specific type?",
  });
  assert.equal(parsed.q, "final fantasy");
  assert.equal(parsed.setProductTheme, "ff7");
}

function testSetProductInventoryRequest() {
  assert.equal(
    isSetProductInventoryRequest({
      userQuestion: "show me the final fantasy cards you have",
    }),
    true,
  );
  assert.equal(
    isSetProductInventoryRequest({
      userQuestion: "any type card from ff7",
      conversationSummary: "Customer: show me the final fantasy cards you have",
    }),
    true,
  );
}

function testTemurColorIdentitySearch() {
  const parsed = parseClerkInventoryQuery({
    userQuestion: "what Temur cards do you have in stock?",
  });
  assert.deepEqual(parsed.semantic.colorIdentityExact, ["G", "U", "R"]);
  assert.equal(parsed.colorIdentityLabel, "Temur");
  assert.equal(parsed.semanticOnly, true);
  assert.equal(parsed.q, undefined);
  assert.equal(parsed.searchLimit, 96);
  assert.equal(
    isColorIdentityInventoryRequest({
      userQuestion: "what Temur cards do you have in stock?",
    }),
    true,
  );
}

function testTemurColorIdentitySemanticFilter() {
  const temurCommander = {
    catalogColorIdentity: ["G", "U", "R"],
    catalogTypeLine: "Legendary Creature — Human Warrior",
  } as InventoryItem;
  const jeskaiInstant = {
    catalogColorIdentity: ["U", "R", "W"],
    catalogTypeLine: "Instant",
  } as InventoryItem;

  assert.equal(
    itemMatchesSemanticFilter(temurCommander, {
      colorIdentityExact: ["G", "U", "R"],
    }),
    true,
  );
  assert.equal(
    itemMatchesSemanticFilter(jeskaiInstant, {
      colorIdentityExact: ["G", "U", "R"],
    }),
    false,
  );
}

testFinalFantasySetSearch();
testFinalFantasy7Search();
testFinalFantasy7ConversationFollowUp();
testSetProductInventoryRequest();
testTemurColorIdentitySearch();
testTemurColorIdentitySemanticFilter();

function testMonoBlueExactIdentity() {
  const parsed = parseClerkInventoryQuery({
    userQuestion: "show me mono-blue cards you have",
  });
  assert.deepEqual(parsed.semantic.colorIdentityExact, ["U"]);
  assert.equal(parsed.semantic.colorIdentityContainsAny, undefined);
  assert.equal(parsed.color, undefined);
  assert.equal(parsed.semanticOnly, true);
}

function testBlueCardsContainsAny() {
  const parsed = parseClerkInventoryQuery({
    userQuestion: "what blue cards do you have?",
  });
  assert.deepEqual(parsed.semantic.colorIdentityContainsAny, ["U"]);
  assert.equal(parsed.semantic.colorIdentityExact, undefined);
  assert.equal(parsed.color, undefined);
  assert.equal(parsed.semanticOnly, true);
}

function testBlueRedContainsAll() {
  const parsed = parseClerkInventoryQuery({
    userQuestion: "blue-red cards in stock",
  });
  assert.deepEqual(parsed.semantic.colorIdentitySupersetOf, ["U", "R"]);
}

function testColorIdentitySemanticFilters() {
  const mono = {
    catalogColorIdentity: ["U"],
  } as InventoryItem;
  const multi = {
    catalogColorIdentity: ["U", "R"],
  } as InventoryItem;

  assert.equal(
    itemMatchesSemanticFilter(mono, { colorIdentityExact: ["U"] }),
    true,
  );
  assert.equal(
    itemMatchesSemanticFilter(multi, { colorIdentityExact: ["U"] }),
    false,
  );
  assert.equal(
    itemMatchesSemanticFilter(multi, { colorIdentityContainsAny: ["U"] }),
    true,
  );
  assert.equal(
    itemMatchesSemanticFilter(mono, { colorIdentityContainsAny: ["U"] }),
    true,
  );
  assert.equal(
    itemMatchesSemanticFilter(multi, { colorIdentitySupersetOf: ["U", "R"] }),
    true,
  );
}

testMonoBlueExactIdentity();
testBlueCardsContainsAny();
testBlueRedContainsAll();
testColorIdentitySemanticFilters();

function testHighestPriceLordOfTheRingsSearch() {
  const question =
    "whats the highest price Lord of the Ring magic card you have?";
  assert.equal(parsePriceSortFromQuery(question), "desc");
  const parsed = parseClerkInventoryQuery({ userQuestion: question });
  assert.equal(parsed.priceSort, "desc");
  assert.equal(parsed.q, "lord of the rings");
  assert.equal(parsed.browseGame, "magic");
  assert.equal(parsed.searchLimit, 96);
  assert.equal(
    isSetProductInventoryRequest({ userQuestion: question }),
    true,
  );
}

function testCheapestFinalFantasySearch() {
  const question = "what is the cheapest final fantasy card you have?";
  assert.equal(parsePriceSortFromQuery(question), "asc");
  const parsed = parseClerkInventoryQuery({ userQuestion: question });
  assert.equal(parsed.priceSort, "asc");
  assert.equal(parsed.q, "final fantasy");
}

function testMostExpensiveWholeInventorySearch() {
  const question = "what was the most expensive card in our inventory?";
  assert.equal(parsePriceSortFromQuery(question), "desc");
  const parsed = parseClerkInventoryQuery({ userQuestion: question });
  assert.equal(parsed.priceSort, "desc");
  assert.equal(parsed.q, undefined);
  assert.equal(parsed.searchLimit, 96);
}

testHighestPriceLordOfTheRingsSearch();
testCheapestFinalFantasySearch();
testMostExpensiveWholeInventorySearch();

testSemanticItemFilter();
testOracleTextFallbackBeforeTagsBackfill();
testCardSemanticFilter();

console.log("clerk query parser tests passed");
