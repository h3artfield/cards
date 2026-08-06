/**
 * Education-then-inventory clerk routing tests.
 * Run: npx --yes tsx scripts/test-clerk-education-intent.ts
 */
import {
  classifyClerkRequest,
} from "../src/lib/store-inventory/clerk-request-classifier";
import {
  isCardOrTypeInventoryRequest,
  isCommanderRecommendationRequest,
  isEducationThenInventoryRequest,
  isInventoryOrPriceClerkQuestion,
} from "../src/lib/store-inventory/clerk-tools/clerk-intent";
import { lookupEmbeddedClerkKnowledge } from "../src/lib/mtg-rag/embedded-clerk-knowledge";

function assert(label: string, condition: boolean) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`✓ ${label}`);
}

const educationQuestions = [
  "Do you have any cards that are good for Attack Harmonicon?",
  "Do you have any blink or flicker cards?",
  "Do you have any cards for an elf tribal deck?",
  "What would be a good commander that cares about prepared spells from Strixhaven being cast from exile?",
];

for (const q of educationQuestions) {
  assert(`education request: ${q.slice(0, 48)}…`, isEducationThenInventoryRequest(q));
  assert(
    `not plain inventory: ${q.slice(0, 48)}…`,
    !isCardOrTypeInventoryRequest(q),
  );
  const classification = classifyClerkRequest({ question: q });
  assert(
    `mixed mode: ${q.slice(0, 48)}…`,
    classification.mode === "mixed" && classification.answerSource === "mixed",
  );
}

assert(
  "prepared spells commander is not stock-only commander rec",
  !isCommanderRecommendationRequest(educationQuestions[3]!),
);

assert(
  "Sol Ring stays inventory",
  isInventoryOrPriceClerkQuestion("Do you have Sol Ring?") &&
    classifyClerkRequest({ question: "Do you have Sol Ring?" }).mode ===
      "inventory_direct",
);

assert(
  "embedded harmonicon knowledge",
  lookupEmbeddedClerkKnowledge("Attack Harmonicon").length > 0,
);
assert(
  "embedded blink knowledge",
  lookupEmbeddedClerkKnowledge("blink flicker cards").length > 0,
);
assert(
  "embedded elf tribal knowledge",
  lookupEmbeddedClerkKnowledge("elf tribal deck").length > 0,
);
assert(
  "embedded prepared spells knowledge",
  lookupEmbeddedClerkKnowledge("prepared spells strixhaven").length > 0,
);

console.log("\nClerk education intent tests PASSED");
