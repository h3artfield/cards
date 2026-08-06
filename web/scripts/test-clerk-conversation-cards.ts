import assert from "node:assert/strict";
import {
  extractCardNamesFromClerkText,
  extractCardNamesFromConversation,
  isConversationStockFollowUp,
} from "../src/lib/store-inventory/clerk-tools/clerk-conversation-cards";

const summary = [
  "Customer: who do you think is a sleeper pick for a badass commander and crazy synergy?",
  "Clerk: For a sleeper pick with crazy synergy, consider **K'rrik, Son of Yawgmoth** and **Teysa, Envoy of Ghosts**.",
].join("\n");

assert.equal(
  isConversationStockFollowUp("DO YOU HAVE THOSE IN STOCK?"),
  true,
);

const names = extractCardNamesFromConversation({
  question: "DO YOU HAVE THOSE IN STOCK?",
  conversationSummary: summary,
});

assert.ok(names.includes("K'rrik, Son of Yawgmoth"), names.join("|"));
assert.ok(names.includes("Teysa, Envoy of Ghosts"), names.join("|"));

assert.deepEqual(
  extractCardNamesFromConversation({
    question: "Do you have Sol Ring?",
    conversationSummary: summary,
  }),
  [],
);

const strategyReply =
  "If you're looking for an out-of-the-ordinary commander, consider **K'ure, the Unyielding**. Another fun option is **Kess, Dissident Mage**.";
const strategyNames = extractCardNamesFromClerkText(strategyReply);
assert.ok(strategyNames.includes("K'ure, the Unyielding"), strategyNames.join("|"));
assert.ok(strategyNames.includes("Kess, Dissident Mage"), strategyNames.join("|"));

console.log("clerk conversation card tests passed");
