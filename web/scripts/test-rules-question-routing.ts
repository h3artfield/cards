/**
 * Rules question routing tests (no OpenAI/Firestore).
 * Run: npx tsx scripts/test-rules-question-routing.ts
 */
import { isRulesQuestion } from "../src/lib/store-inventory/clerk-tools/rules-question";
import {
  isMagicStrategyAdviceRequest,
  isSimpleCardNameLookup,
} from "../src/lib/store-inventory/clerk-tools/clerk-intent";
import { classifyClerkRequest } from "../src/lib/store-inventory/clerk-request-classifier";
import {
  appendSourcesIfMissing,
  citationsFromKnowledgeHits,
} from "../src/lib/mtg-rag/rules-citations";
import type { MtgKnowledgeHit } from "../src/lib/mtg-rag/hybrid-retrieval";

function assert(label: string, condition: boolean) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`✓ ${label}`);
}

assert("stack question is rules", isRulesQuestion("How does the stack work in Magic?"));
assert("priority combat is rules", isRulesQuestion("When do I get priority during combat?"));
assert("birds deck is not rules", !isRulesQuestion("build me a deck based on birds"));
assert("strategy not rules", !isMagicStrategyAdviceRequest("How does the stack work?"));
assert(
  "classifier routes stack to knowledge",
  classifyClerkRequest({ question: "How does the stack work?" }).mode === "knowledge",
);
assert(
  "stack is not simple card lookup",
  !isSimpleCardNameLookup("How does the stack work?"),
);

const fakeHit: MtgKnowledgeHit = {
  chunk: {
    chunkId: "test",
    sourceId: "cr",
    corpus: "comprehensive_rules",
    authorityTier: "official_rules",
    title: "Stack",
    text: "When a spell is cast...",
    retrievalText: "When a spell is cast...",
    citationLabel: "Comprehensive Rules 405.1",
    sourceLocator: "CR 405.1",
    ruleNumberStart: "405.1",
    embeddingModel: "test",
    embeddingDimensions: 0,
    tokenCount: 10,
    chunkIndex: 0,
    chunkHash: "x",
    active: true,
    importedAt: {} as never,
  },
  score: 1,
  method: "alias_exact",
};

const cites = citationsFromKnowledgeHits([fakeHit]);
assert("citation from rule number", cites[0]?.includes("405.1") ?? false);

const withSources = appendSourcesIfMissing("The stack resolves top-down.", cites);
assert("sources appended", withSources.includes("Sources:"));

console.log("\nRules question routing tests PASSED");
