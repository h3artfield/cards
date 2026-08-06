/**
 * Smoke test commander name parsing (no Firestore/OpenAI).
 * Run: npx --yes tsx scripts/test-commander-context.ts
 */
import {
  isConcreteCommanderName,
  parseCommanderFromMessage,
  parseCommanderMaxPrice,
} from "../src/lib/store-inventory/clerk-tools/commander-context";

function assert(label: string, condition: boolean) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`✓ ${label}`);
}

const constraintQuestion =
  "build me a deck with a commander that cost less than 100 dollars";

assert(
  "unknown is not a concrete commander",
  !isConcreteCommanderName("unknown"),
);
assert(
  "commander is not a concrete commander",
  !isConcreteCommanderName("commander"),
);
assert(
  "something op is not a concrete commander",
  !isConcreteCommanderName("something op"),
);
assert(
  "atraxa is concrete",
  isConcreteCommanderName("Atraxa, Praetors' Voice"),
);
assert(
  "parseCommanderFromMessage skips constraint phrase",
  parseCommanderFromMessage({
    question: constraintQuestion,
    conversationSummary: "",
    deckBuildOnly: true,
  }) === undefined,
);
assert(
  "parseCommanderMaxPrice from constraint question",
  parseCommanderMaxPrice(constraintQuestion) === 100,
);
assert(
  "named commander still parses",
  parseCommanderFromMessage({
    question: "build me a complete deck around Atraxa, Praetors' Voice",
    conversationSummary: "",
    deckBuildOnly: true,
  }) === "Atraxa, Praetors' Voice",
);

console.log("\nCommander context smoke test PASSED");
