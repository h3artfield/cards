/**
 * Unit tests for deck theme parsing (no OpenAI).
 * Run: npx tsx scripts/test-deck-build-intent.ts
 */
import { isDeckThemePhrase } from "../src/lib/store-inventory/clerk-tools/deck-theme-phrases";
import {
  isConcreteCommanderName,
  parseCommanderFromMessage,
} from "../src/lib/store-inventory/clerk-tools/commander-context";
import { isSimpleCardNameLookup } from "../src/lib/store-inventory/clerk-tools/clerk-intent";
import {
  buildNoThematicMatchMessage,
  commanderPickFitsIntent,
  hasSpecificDeckBuildIntent,
  offStockCommanderStrategyNote,
  primaryRequestedCardName,
} from "../src/lib/store-inventory/clerk-tools/deck-build-intent-guards";
import type { DeckBuildIntentTranslation } from "../src/lib/store-inventory/clerk-tools/deck-build-intent-translator";

function assert(label: string, condition: boolean) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`✓ ${label}`);
}

const smaugIntent: DeckBuildIntentTranslation = {
  userGoal: "Commander deck built on Smaug from The Hobbit set",
  featuredCard: "Smaug, the Golden",
  themeKeywords: ["smaug", "hobbit", "treasure"],
  setOrProduct: "The Hobbit",
  colorHints: [],
  suggestedCommanders: ["Smaug, the Golden", "Prosper, Tome-Bound"],
  strategySummary: "Treasure and dragon synergies.",
  researchQueries: ["smaug commander edhrec"],
};

assert("birds is a theme not a commander", isDeckThemePhrase("birds"));
assert("politics is a theme", isDeckThemePhrase("politics"));
assert("Atraxa is not a theme phrase", !isDeckThemePhrase("Atraxa, Praetors' Voice"));

assert(
  "parses quoted commander name",
  parseCommanderFromMessage({
    question:
      "Build me a deck focused around the commander 'Atraxa, Praetors' Voice', and Planeswalker cards",
    conversationSummary: "",
    deckBuildOnly: true,
  }) === "Atraxa, Praetors' Voice",
);

assert(
  "does not parse birds as commander",
  parseCommanderFromMessage({
    question: "build me a deck based on birds",
    conversationSummary: "",
    deckBuildOnly: true,
  }) === undefined,
);

assert(
  "birds is not concrete commander name",
  !isConcreteCommanderName("birds"),
);

assert(
  "deck build with birds is not simple card lookup",
  !isSimpleCardNameLookup("build me a deck based on birds"),
);

assert("smaug request is specific intent", hasSpecificDeckBuildIntent(smaugIntent));

assert(
  "Animar rejected for smaug intent without theme score",
  !commanderPickFitsIntent({
    commanderName: "Animar, Soul of Elements",
    intent: smaugIntent,
    themeScore: 0,
  }),
);

assert(
  "off-stock note explains building anyway",
  offStockCommanderStrategyNote("Smaug, the Golden").includes("isn't in our inventory"),
);

console.log("\nDeck build intent unit tests PASSED");
