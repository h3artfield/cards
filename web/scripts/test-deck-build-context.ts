/**
 * Smoke test deck-build conversation context (no Firestore/OpenAI).
 * Run: npx --yes tsx scripts/test-deck-build-context.ts
 */
import {
  deckBuildQuestionForPlanning,
  isDeckBuildConversation,
  isDeckBuildCommanderPickFollowUp,
  isInventoryOrPriceClerkQuestion,
  parseCommanderMaxPriceFromConversation,
  parseDeckMaxPrice,
  parseDeckMaxPriceFromConversation,
  wantsPowerfulCommander,
} from "../src/lib/store-inventory/clerk-tools/deck-build-context";
import { isExplicitDeckBuildRequest } from "../src/lib/store-inventory/clerk-tools/clerk-intent";

function assert(label: string, condition: boolean) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`✓ ${label}`);
}

const history = [
  "Customer: build me the best deck with a commander that cost less than 100 dollars",
  "Clerk: Which commander should I build around?",
  "Customer: commander less than 100 dollars",
  "Clerk: Which commander should I build around?",
].join("\n");

assert(
  "initial message is deck build conversation",
  isDeckBuildConversation({
    question: "build me the best deck with a commander that cost less than 100 dollars",
  }),
);
assert(
  "best deck matches explicit deck build",
  isExplicitDeckBuildRequest(
    "build me the best deck with a commander that cost less than 100 dollars",
  ),
);
assert(
  "follow-up commander constraint stays in deck build thread",
  isDeckBuildConversation({
    question: "commander less than 100 dollars",
    conversationSummary: history,
  }),
);
assert(
  "pick something op is deck build follow-up",
  isDeckBuildCommanderPickFollowUp({
    question: "pick something op",
    conversationSummary: history,
  }),
);
assert(
  "pick follow-up is explicit deck build",
  isExplicitDeckBuildRequest("you can pick. i just want an op one", history),
);
assert(
  "budget preserved from conversation",
  parseCommanderMaxPriceFromConversation({
    question: "you can pick. i just want an op one",
    conversationSummary: history,
  }) === 100,
);
assert(
  "op request detected",
  wantsPowerfulCommander("you can pick. i just want an op one"),
);
assert(
  "planning question merges thread",
  deckBuildQuestionForPlanning({
    question: "you can pick. i just want an op one",
    conversationSummary: history,
  }).includes("100 dollars"),
);

const completedDeckHistory = [
  "Customer: build me the best deck with a commander that cost less than 100 dollars",
  "Clerk: Built your Aesi, Tyrant of Gyre Strait list — 21/99 maindeck from stock ($152.00).",
].join("\n");

assert(
  "inventory question after deck build is not deck build thread",
  !isDeckBuildConversation({
    question: "whats the highest price Lord of the Ring magic card you have?",
    conversationSummary: completedDeckHistory,
  }),
);
assert(
  "inventory question detected",
  isInventoryOrPriceClerkQuestion(
    "whats the highest price Lord of the Ring magic card you have?",
  ),
);

assert(
  "whole deck budget parsed",
  parseDeckMaxPrice("build me a commander deck under $100") === 100,
);
assert(
  "commander-only cap not conflated with deck budget",
  parseCommanderMaxPriceFromConversation({
    question: "commander under $50",
    conversationSummary: "Customer: build me a deck under $200 total",
  }) === 50,
);
assert(
  "deck budget from conversation",
  parseDeckMaxPriceFromConversation({
    question: "you can pick",
    conversationSummary: "Customer: build me a deck under $200 total",
  }) === 200,
);

console.log("\nDeck build context smoke test PASSED");
