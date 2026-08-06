import type { MtgKnowledgeCorpus, MtgQueryIntent } from "../../src/lib/mtg-rag/types";

export interface MtgRagEvalCase {
  id: string;
  question: string;
  expectedIntent: MtgQueryIntent[];
  expectedCorpora: MtgKnowledgeCorpus[];
  forbiddenCorpora?: MtgKnowledgeCorpus[];
  requiresInventory?: boolean;
  minHits?: number;
}

function term(id: string, question: string): MtgRagEvalCase {
  return {
    id,
    question,
    expectedIntent: ["terminology_question"],
    expectedCorpora: ["glossary"],
    minHits: 1,
  };
}

function color(id: string, question: string): MtgRagEvalCase {
  return {
    id,
    question,
    expectedIntent: ["color_identity_question"],
    expectedCorpora: ["color_identity"],
    minHits: 1,
  };
}

function rules(id: string, question: string): MtgRagEvalCase {
  return {
    id,
    question,
    expectedIntent: ["rules_question"],
    expectedCorpora: ["comprehensive_rules"],
    forbiddenCorpora: ["youtube_transcript"],
    minHits: 1,
  };
}

function commander(id: string, question: string): MtgRagEvalCase {
  return {
    id,
    question,
    expectedIntent: ["commander_strategy"],
    expectedCorpora: ["commander_primer"],
    minHits: 1,
  };
}

function education(id: string, question: string): MtgRagEvalCase {
  return {
    id,
    question,
    expectedIntent: ["deckbuilding_education"],
    expectedCorpora: ["youtube_transcript"],
    minHits: 1,
  };
}

function inventory(id: string, question: string): MtgRagEvalCase {
  return {
    id,
    question,
    expectedIntent: ["inventory_lookup"],
    expectedCorpora: [],
    requiresInventory: true,
    minHits: 0,
  };
}

/** 75+ evaluation cases for MTG RAG router + retrieval smoke tests. */
export const MTG_RAG_EVAL_CASES: MtgRagEvalCase[] = [
  // Terminology (20)
  term("term-001", "What is a mana dork?"),
  term("term-002", "What does ETB mean in Magic?"),
  term("term-003", "Define bolt the bird"),
  term("term-004", "What is ramp in MTG?"),
  term("term-005", "What is a win condition?"),
  term("term-006", "Explain the term aggro"),
  term("term-007", "What is a board wipe?"),
  term("term-008", "What does CMC mean?"),
  term("term-009", "What is a mana sink?"),
  term("term-010", "Define card advantage"),
  term("term-011", "What is a combo piece?"),
  term("term-012", "What is graveyard hate?"),
  term("term-013", "Explain tempo in Magic"),
  term("term-014", "What is a finisher?"),
  term("term-015", "What does bolt mean in slang?"),
  term("term-016", "What is a mana rock?"),
  term("term-017", "Define midrange archetype"),
  term("term-018", "What is a value engine?"),
  term("term-019", "What is a stax piece?"),
  term("term-020", "Explain protection in MTG"),

  // Color identity (15)
  color("color-001", "What colors are Jeskai?"),
  color("color-002", "What is BUG color identity?"),
  color("color-003", "Explain Esper shard"),
  color("color-004", "What colors are in Grixis?"),
  color("color-005", "What is Bant wedge?"),
  color("color-006", "What colors are Jund?"),
  color("color-007", "What is Naya?"),
  color("color-008", "What is Abzan?"),
  color("color-009", "What is Mardu?"),
  color("color-010", "What is Temur?"),
  color("color-011", "What does mono-blue mean?"),
  color("color-012", "What is WUBRG?"),
  color("color-013", "What colors are Azorius?"),
  color("color-014", "What is Rakdos?"),
  color("color-015", "What is Simic?"),

  // Rules (15)
  rules("rules-001", "How does the stack work in Magic?"),
  rules("rules-002", "What is priority in the comprehensive rules?"),
  rules("rules-003", "Explain state-based actions"),
  rules("rules-004", "What happens when a creature has 0 toughness?"),
  rules("rules-005", "How do triggered abilities work on the stack?"),
  rules("rules-006", "What is the legend rule?"),
  rules("rules-007", "How does combat damage work?"),
  rules("rules-008", "What is the commander tax rule?"),
  rules("rules-009", "Explain layers in Magic rules"),
  rules("rules-010", "What is rule 117 about?"),
  rules("rules-011", "When do players get priority?"),
  rules("rules-012", "What is the stack timing for instants?"),
  rules("rules-013", "How do replacement effects work?"),
  rules("rules-014", "What is the active player rule?"),
  rules("rules-015", "Explain how copying spells works"),

  // Commander strategy (10)
  commander("cmd-001", "What is the strategy for Atraxa commander?"),
  commander("cmd-002", "How does Edgar Markov commander work?"),
  commander("cmd-003", "What packages does Korvold want?"),
  commander("cmd-004", "What engines fit Muldrotha?"),
  commander("cmd-005", "What are common traps when playing Yuriko?"),
  commander("cmd-006", "How does Krenko commander win?"),
  commander("cmd-007", "What is the plan for Omnath Locus of Creation?"),
  commander("cmd-008", "What does Meren reanimator want?"),
  commander("cmd-009", "How does Zada go-wide work?"),
  commander("cmd-010", "What is the strategy for Talrand?"),

  // Deckbuilding education (10)
  education("edu-001", "Explain quadrant theory for deckbuilding"),
  education("edu-002", "How should I think about mana curve in Commander?"),
  education("edu-003", "What is ramp package theory in EDH?"),
  education("edu-004", "How do I use Scryfall for deckbuilding?"),
  education("edu-005", "What is creative deckbuilding in Commander?"),
  education("edu-006", "How does bracket 4 commander work?"),
  education("edu-007", "What are commander archetypes?"),
  education("edu-008", "How do I evaluate card power level?"),
  education("edu-009", "What is counterweight in deckbuilding?"),
  education("edu-010", "How do hidden commanders work in deck design?"),

  // Inventory negatives (10) — should NOT use knowledge corpora
  inventory("inv-001", "Do you have Sol Ring in stock?"),
  inventory("inv-002", "How much is Lightning Bolt?"),
  inventory("inv-003", "Do you have any blue counterspells?"),
  inventory("inv-004", "Got any Pokemon Charizard cards?"),
  inventory("inv-005", "Do you have Sheoldred in stock?"),
  inventory("inv-006", "How much is a Mana Crypt?"),
  inventory("inv-007", "Do you have dual lands?"),
  inventory("inv-008", "Looking for Rhystic Study"),
  inventory("inv-009", "Do you have any mono-red commanders under $10?"),
  inventory("inv-010", "Price on Smothering Tithe?"),

  // Color pairing edge cases
  color("color-016", "What colors are in Witch-maw Nebula?"),
  color("color-017", "What color pairing is Witch-maw?"),

  // Deck budget semantics (router should not treat as inventory)
  {
    id: "budget-001",
    question: "Build me a commander deck under $100 total",
    expectedIntent: ["deckbuilding_education", "commander_strategy"],
    expectedCorpora: [],
    requiresInventory: true,
    minHits: 0,
  },
  {
    id: "budget-002",
    question: "commander under $50 but whole deck under $200",
    expectedIntent: ["commander_strategy"],
    expectedCorpora: ["commander_primer"],
    minHits: 0,
  },

  term("term-021", "What is Attack Harmonicon in MTG?"),
  term("term-022", "Explain blink and flicker in Magic"),
  term("term-023", "What is an elf tribal deck?"),
  commander("cmd-prepared-001", "Best commander for prepared spells from Strixhaven"),
  {
    id: "mixed-blink-stock",
    question: "Do you have any blink or flicker cards?",
    expectedIntent: ["mixed", "terminology_question"],
    expectedCorpora: ["glossary"],
    requiresInventory: true,
    minHits: 1,
  },
  {
    id: "mixed-elf-tribal-stock",
    question: "Do you have any cards for an elf tribal deck?",
    expectedIntent: ["mixed", "terminology_question", "commander_strategy"],
    expectedCorpora: ["glossary"],
    requiresInventory: true,
    minHits: 1,
  },
];

export const MTG_RAG_EVAL_CASE_COUNT = MTG_RAG_EVAL_CASES.length;
