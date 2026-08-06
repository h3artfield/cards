/**
 * Smoke test clerk intent routing heuristics (no Firestore/OpenAI).
 * Run: npx --yes tsx scripts/test-clerk-intent.ts
 */
import {
  isCardOrTypeInventoryRequest,
  isCommanderRecommendationRequest,
  isEducationThenInventoryRequest,
  isExplicitDeckBuildRequest,
  isInventoryOrPriceClerkQuestion,
  isMagicStrategyAdviceRequest,
  isSimpleCardNameLookup,
} from "../src/lib/store-inventory/clerk-tools/clerk-intent";
import {
  isDeckBuildClarificationFollowUp,
  isGameNameReply,
} from "../src/lib/store-inventory/clerk-tools/clerk-clarification-followup";
import { classifyClerkRequest } from "../src/lib/store-inventory/clerk-request-classifier";

function assert(label: string, condition: boolean) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`✓ ${label}`);
}

const inventory = [
  "Do you have Sol Ring?",
  "Looking for blue counterspells",
  "Need ramp for my commander deck",
  "Got any board wipes under $5?",
  "Show me green creatures with trample",
];

const notInventory = [
  "Build me a complete commander deck around Atraxa",
  "Best mono-blue commander under $10",
];

for (const q of inventory) {
  const isInv =
    isInventoryOrPriceClerkQuestion(q) || isCardOrTypeInventoryRequest(q);
  assert(`inventory: ${q}`, isInv);
  assert(`not deck build: ${q}`, !isExplicitDeckBuildRequest(q));
}

for (const q of notInventory) {
  assert(`not generic inventory: ${q}`, !isCardOrTypeInventoryRequest(q) || q.includes("Best"));
}

assert(
  "explicit deck build",
  isExplicitDeckBuildRequest("Build me a complete commander deck around Atraxa"),
);
assert(
  "best deck explicit build",
  isExplicitDeckBuildRequest(
    "build me the best deck with a commander that cost less than 100 dollars",
  ),
);
assert(
  "not deck build for card search",
  !isExplicitDeckBuildRequest("Need ramp for my commander deck"),
);
assert(
  "commander recommendation",
  isCommanderRecommendationRequest("Best mono-blue commander under $10"),
);
assert(
  "not recommendation for counterspells",
  !isCommanderRecommendationRequest("Looking for blue counterspells"),
);
assert(
  "education not plain card-type inventory",
  !isCardOrTypeInventoryRequest("Do you have any blink or flicker cards?"),
);
assert(
  "blink question uses education path",
  isEducationThenInventoryRequest("Do you have any blink or flicker cards?"),
);
assert(
  "strategy advice sleeper commander",
  isMagicStrategyAdviceRequest(
    "who do you think is a sleeper pick for a badass commander and crazy synergy?",
  ),
);
assert(
  "strategy advice out of the ordinary commander",
  isMagicStrategyAdviceRequest(
    "what would be a good commander that is out of the ordinary?",
  ),
);
assert(
  "molecule man deck is explicit build",
  isExplicitDeckBuildRequest("build me a molecule man deck"),
);

const deckClarifySummary =
  "Customer: build me a molecule man deck\nClerk: What game is the Molecule Man deck for?";

assert("magic the gathering is a game name", isGameNameReply("magic the gathering"));
assert(
  "game answer is not a card lookup",
  !isSimpleCardNameLookup("magic the gathering", deckClarifySummary),
);
assert(
  "game answer continues deck build thread",
  isDeckBuildClarificationFollowUp({
    question: "magic the gathering",
    conversationSummary: deckClarifySummary,
  }),
);
assert(
  "classifier routes game answer to staged deck build",
  classifyClerkRequest({
    question: "magic the gathering",
    conversationSummary: deckClarifySummary,
  }).useStagedDeckBuild,
);
assert(
  "not strategy advice for best commander stock",
  !isMagicStrategyAdviceRequest("Best mono-blue commander under $10"),
);

console.log("\nClerk intent smoke test PASSED");
