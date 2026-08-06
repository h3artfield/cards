import { lookupEmbeddedClerkKnowledge } from "../../mtg-rag/embedded-clerk-knowledge";
import { hybridRetrieveMtgKnowledge } from "../../mtg-rag/hybrid-retrieval";
import { isMtgRagEnabled } from "../../mtg-rag/constants";
import { extractCardPhraseFromFactQuestion } from "./simple-clerk-intent";
import { answerCardFactQuestion } from "./simple-card-fact";

export interface RulesAnswer {
  directAnswer: string;
  ruleNumbers: string[];
  knowledgeSources: string[];
  oracleIds: string[];
  usedTranscriptAuthority: false;
}

/** Curated rules snippets — official Comprehensive Rules authority, not community transcripts. */
const EMBEDDED_COMPREHENSIVE_RULES: Array<{
  patterns: RegExp[];
  ruleNumbers: string[];
  answer: string;
}> = [
  {
    patterns: [/can a sorcery be my commander/i, /can an instant be my commander/i],
    ruleNumbers: ["903.3"],
    answer:
      "**No.** Commanders must be legendary creatures, planeswalkers whose rules text allow it, or backgrounds (CR 903.3). Sorceries and instants cannot be your commander regardless of which product printed them.",
  },
  {
    patterns: [/does ward stop a board wipe/i, /ward.*board wipe/i],
    ruleNumbers: ["702.21", "701.16"],
    answer:
      "**Ward** (CR 702.21) triggers when an opponent targets the permanent with a spell or ability. Most board wipes (e.g. **Wrath of God**, **Damnation**) do **not** target, so ward does **not** trigger and does not stop them. Targeted removal like **Path to Exile** does target and will trigger ward unless the controller pays the ward cost.",
  },
  {
    patterns: [/does copying a spell count as casting/i, /copy.*spell.*cast/i],
    ruleNumbers: ["609.3", "707.10"],
    answer:
      "Copying a spell is **not** casting it (CR 707.10). **Casting** is a specific action (CR 601.2). Copy effects put a copy of a spell on the stack; they do not count as you casting that spell unless an ability explicitly says you cast the copy.",
  },
  {
    patterns: [/can i cast this from exile/i, /cast.*from exile/i],
    ruleNumbers: ["400.7", "611.2"],
    answer:
      "By default, cards in exile are not castable (CR 400.7). You may only cast a card from exile if a specific ability explicitly allows it (e.g. **Flashback**, **Escape**, **Plot**). Check the card's oracle text for permission.",
  },
  {
    patterns: [/can this card go in my commander'?s deck/i, /color identity.*deck/i],
    ruleNumbers: ["903.4"],
    answer:
      "A card's **color identity** (CR 903.4) includes all colored mana symbols in its mana cost and rules text. Every card in a Commander deck must fit within the commander's color identity. Colorless cards are allowed in any deck.",
  },
  {
    patterns: [/what is priority/i],
    ruleNumbers: ["117.1", "117.3"],
    answer:
      "**Priority** (CR 117) determines who may cast spells or activate abilities. The active player receives priority first, then each other player in turn order. A player with priority may cast a spell, activate an ability, or pass.",
  },
  {
    patterns: [/what is the stack/i],
    ruleNumbers: ["405.1", "608.2"],
    answer:
      "The **stack** (CR 405) is where spells and abilities wait to resolve. Players receive priority in turn order; when all pass in succession, the top object resolves.",
  },
  {
    patterns: [/what are state.?based actions/i],
    ruleNumbers: ["704.5"],
    answer:
      "**State-based actions** (CR 704) are game actions checked automatically whenever a player would receive priority. They include creatures with 0 or less toughness dying and legend rule violations.",
  },
  {
    patterns: [/does hexproof stop/i],
    ruleNumbers: ["702.11"],
    answer:
      "**Hexproof** (CR 702.11) means the permanent cannot be the target of spells or abilities your opponents control. Non-targeting effects still affect hexproof permanents.",
  },
];

function matchEmbeddedRules(question: string): RulesAnswer | null {
  for (const entry of EMBEDDED_COMPREHENSIVE_RULES) {
    if (entry.patterns.some((p) => p.test(question))) {
      return {
        directAnswer: `${entry.answer}\n\n_Rules cited: ${entry.ruleNumbers.map((r) => `CR ${r}`).join(", ")}._`,
        ruleNumbers: entry.ruleNumbers,
        knowledgeSources: entry.ruleNumbers.map((r) => `Comprehensive Rules ${r}`),
        oracleIds: [],
        usedTranscriptAuthority: false,
      };
    }
  }
  return null;
}

/** Rules path: card entity resolution → official CR retrieval → evidence-backed answer. */
export async function answerRulesQuestion(input: {
  question: string;
  conversationSummary?: string;
}): Promise<RulesAnswer | null> {
  const fact = extractCardPhraseFromFactQuestion(input.question);
  if (fact) {
    const cardAnswer = await answerCardFactQuestion({
      question: input.question,
      kind: fact.kind,
      cardPhrase: fact.cardPhrase,
      conversationSummary: input.conversationSummary,
    });
    if (cardAnswer && !("ambiguous" in cardAnswer)) {
      return {
        directAnswer: `${cardAnswer.directAnswer}\n\n${cardAnswer.reason}`,
        ruleNumbers: ["903.3", "903.4"],
        knowledgeSources: ["canonical_oracle", "Commander deck construction rules"],
        oracleIds: [cardAnswer.oracleId],
        usedTranscriptAuthority: false,
      };
    }
  }

  const embedded = matchEmbeddedRules(input.question);
  if (embedded) return embedded;

  if (isMtgRagEnabled()) {
    const retrieval = await hybridRetrieveMtgKnowledge({
      question: input.question,
      intent: "rules_question",
      limit: 6,
    });
    const crHits = retrieval.hits.filter(
      (h) =>
        h.chunk.corpus === "comprehensive_rules" ||
        h.chunk.citationLabel.toLowerCase().includes("comprehensive rules"),
    );
    if (crHits.length > 0) {
      const ruleNumbers = crHits
        .flatMap((h) => [h.chunk.ruleNumberStart, h.chunk.ruleNumberEnd].filter(Boolean) as string[])
        .filter(Boolean)
        .slice(0, 5);
      const excerpt = crHits
        .slice(0, 2)
        .map((h) => h.chunk.text.trim())
        .join("\n\n");
      return {
        directAnswer: `${excerpt}\n\n_Rules cited: ${ruleNumbers.map((r) => `CR ${r}`).join(", ") || "Comprehensive Rules"}._`,
        ruleNumbers,
        knowledgeSources: crHits.map((h) => h.chunk.citationLabel),
        oracleIds: [],
        usedTranscriptAuthority: false,
      };
    }
  }

  const glossary = lookupEmbeddedClerkKnowledge(input.question);
  if (glossary.length > 0 && /\bwhat is\b/i.test(input.question)) {
    return null;
  }

  return null;
}
