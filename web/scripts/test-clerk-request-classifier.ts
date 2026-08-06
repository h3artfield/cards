/**
 * Smoke test unified clerk request classifier.
 * Run: npx --yes tsx scripts/test-clerk-request-classifier.ts
 */
import {
  classifyClerkRequest,
  answerSourceLabel,
} from "../src/lib/store-inventory/clerk-request-classifier";

function assert(label: string, condition: boolean) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`✓ ${label}`);
}

const deckHistory = [
  "Customer: build me the best deck with a commander that cost less than 100 dollars",
  "Clerk: Which commander should I build around?",
].join("\n");

const deck = classifyClerkRequest({
  question: "you can pick. i just want an op one",
  conversationSummary: deckHistory,
});
assert("deck build follow-up uses staged deck build", deck.useStagedDeckBuild);
assert("deck build source label", answerSourceLabel(deck.answerSource) === "Built from in-stock cards");

const inventory = classifyClerkRequest({
  question: "Do you have Sol Ring in stock?",
});
assert("inventory question is inventory_direct", inventory.mode === "inventory_direct");
assert("inventory redirect extracts card phrase", inventory.redirectToInventorySearch === "Sol Ring");
assert("inventory is not deck build", !inventory.useStagedDeckBuild);

const simple = classifyClerkRequest({ question: "Sol Ring" });
assert("bare card name redirects", simple.redirectToInventorySearch === "Sol Ring");
assert("bare card name is inventory_direct", simple.mode === "inventory_direct");

const knowledge = classifyClerkRequest({
  question: "What colors are in Witch-maw Nebula?",
});
assert("color pairing is knowledge mode", knowledge.mode === "knowledge");
assert("knowledge source", knowledge.answerSource === "knowledge");

const afterDeck = classifyClerkRequest({
  question: "whats the highest price Lord of the Ring magic card you have?",
  conversationSummary: [
    "Customer: build me a commander deck",
    "Clerk: Built your Aesi list.",
  ].join("\n"),
});
assert(
  "inventory after deck build is not deck build",
  !afterDeck.useStagedDeckBuild,
);
assert("price sort is inventory", afterDeck.mode === "inventory_direct");

console.log("\nClerk request classifier smoke test PASSED");
