#!/usr/bin/env npx tsx
/**
 * Unit tests for MTG RAG retrieval ranking v4 generic fixes.
 */
import { aliasSpecificityMultiplier, scoreAliasSpecificity } from "../src/lib/mtg-rag/alias-specificity";
import { finalizeHybridHitScores } from "../src/lib/mtg-rag/retrieval-ranking";
import { extractQueryFacets } from "../src/lib/mtg-rag/query-facets";
import type { MtgKnowledgeHit } from "../src/lib/mtg-rag/hybrid-retrieval";
import type { MtgKnowledgeChunk } from "../src/lib/mtg-rag/types";

function glossaryChunk(label: string, text = label): MtgKnowledgeChunk {
  return {
    chunkId: `glossary-${label}`,
    sourceId: "test",
    corpus: "glossary",
    authorityTier: "curated_internal",
    title: label,
    text,
    retrievalText: text,
    citationLabel: label,
    sourceLocator: "test",
    embeddingModel: "test",
    embeddingDimensions: 8,
    tokenCount: 10,
    chunkIndex: 0,
    chunkHash: "test",
    active: true,
    importedAt: {} as MtgKnowledgeChunk["importedAt"],
  };
}

function rulesChunk(input: {
  id: string;
  label: string;
  start: string;
  end?: string;
  text: string;
}): MtgKnowledgeChunk {
  return {
    chunkId: input.id,
    sourceId: "test",
    corpus: "comprehensive_rules",
    authorityTier: "official_rules",
    title: input.label,
    text: input.text,
    retrievalText: input.text,
    citationLabel: input.label,
    ruleNumberStart: input.start,
    ruleNumberEnd: input.end ?? input.start,
    sourceLocator: "test",
    embeddingModel: "test",
    embeddingDimensions: 8,
    tokenCount: 10,
    chunkIndex: 0,
    chunkHash: "test",
    active: true,
    importedAt: {} as MtgKnowledgeChunk["importedAt"],
  };
}

function hit(chunk: MtgKnowledgeChunk, method: MtgKnowledgeHit["method"], sim?: number): MtgKnowledgeHit {
  return {
    chunk,
    score: sim ?? 0,
    method,
    vectorSimilarity: sim,
  };
}

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`PASS ${name}`);
  } else {
    failed++;
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
}

const wheel = glossaryChunk(
  "Glossary: Wheel",
  "Term: Wheel. Definition: A mass draw effect where each player draws seven cards and then discards.",
);
const wheelDraft = glossaryChunk(
  "Glossary: Wheel (Draft)",
  "Term: Wheel (Draft). Definition: A draft format archetype built around wheeling packs.",
);
const commander = glossaryChunk(
  "Glossary: Commander",
  "Term: Commander. Definition: A multiplayer format with a commander creature.",
);

const aliasQuery = "turbo narset wheel mass draw strategy Commander";
const wheelScore = scoreAliasSpecificity({ query: aliasQuery, mode: "STRATEGY", chunk: wheel });
const wheelDraftScore = scoreAliasSpecificity({ query: aliasQuery, mode: "STRATEGY", chunk: wheelDraft });
const commanderScore = scoreAliasSpecificity({ query: aliasQuery, mode: "STRATEGY", chunk: commander });

assert("wheel beats wheel (draft) specificity", wheelScore > wheelDraftScore, `${wheelScore} vs ${wheelDraftScore}`);
assert("wheel beats commander specificity", wheelScore > commanderScore, `${wheelScore} vs ${commanderScore}`);
assert(
  "commander alias demoted multiplier",
  aliasSpecificityMultiplier({ query: aliasQuery, mode: "STRATEGY", chunk: commander }) <
    aliasSpecificityMultiplier({ query: aliasQuery, mode: "STRATEGY", chunk: wheel }),
);

const exileA = rulesChunk({
  id: "exile-a",
  label: "CR 406.6",
  start: "406.6",
  text: "Exile is a public zone. Cards in exile are exiled face up.",
});
const exileB = rulesChunk({
  id: "exile-b",
  label: "CR 406.1",
  start: "406.1",
  text: "Exile is a game zone. Exiled cards may be referenced by effects.",
});
const damage = rulesChunk({
  id: "damage",
  label: "CR 120.5",
  start: "120.5",
  text: "Damage marked on a creature remains until cleanup. Destroy and damage are tracked separately.",
});

const multiFacetQuery = "307.2 destroy exile damage marked on creature";
const facets = extractQueryFacets(multiFacetQuery);
assert("multi-facet query extracts damage and exile facets", facets.includes("damage") && facets.includes("exile"));

const ranked = finalizeHybridHitScores({
  hits: [
    hit(exileA, "vector", 0.62),
    hit(exileB, "vector", 0.61),
    hit(damage, "vector", 0.506),
    hit(exileA, "lexical_exact"),
  ],
  query: multiFacetQuery,
  mode: "RULES",
  intent: "rules_question",
  limit: 4,
});

const topIds = ranked.map((h) => h.chunk.chunkId);
assert(
  "facet diversity preserves distinct damage vector candidate",
  topIds.includes("damage"),
  `top=${topIds.join(",")}`,
);
assert(
  "facet diversity does not fill all slots with exile duplicates only",
  !(topIds.filter((id) => id.startsWith("exile")).length >= 3 && !topIds.includes("damage")),
);

const rule605 = rulesChunk({
  id: "605",
  label: "CR 605.1",
  start: "605.1",
  text: "605.1. Mana abilities do not use the stack.",
});
const rule605Incidental = rulesChunk({
  id: "605-incidental",
  label: "CR 123.7",
  start: "123.7",
  end: "123.9",
  text: "123.7. Example references rule 605.1f in a footnote only.",
});

const ruleRanked = finalizeHybridHitScores({
  hits: [hit(rule605Incidental, "lexical_exact"), hit(rule605, "lexical_exact"), hit(rule605, "vector", 0.58)],
  query: "605.1 mana abilities do not use the stack",
  mode: "RULES",
  intent: "rules_question",
  limit: 4,
});

assert(
  "exact CR citation outranks incidental body mention",
  ruleRanked[0]?.chunk.chunkId === "605",
  `top=${ruleRanked[0]?.chunk.chunkId}`,
);

console.log(JSON.stringify({ passed, failed }, null, 2));
process.exit(failed > 0 ? 1 : 0);
