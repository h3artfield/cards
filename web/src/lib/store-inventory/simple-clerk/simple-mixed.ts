import type { StoreInventoryCard } from "../../deck-builder/store-inventory-browse";
import { lookupEmbeddedClerkKnowledge } from "../../mtg-rag/embedded-clerk-knowledge";
import {
  isSemanticFilterActive,
  parseClerkInventoryQuery,
} from "../clerk-tools/clerk-query-parser";
import { renderSimpleInventoryReply } from "./simple-inventory-reply";

export interface MixedAnswer {
  directAnswer: string;
  educationSource: string;
  inventoryOracleIds: string[];
  inventoryItems: StoreInventoryCard[];
  knowledgeResult: { answered: boolean; source: string; text: string };
  inventoryResult: { matchCount: number; total?: number; reply: string };
  joinResult: { combined: boolean };
}

function splitEducationInventory(question: string): {
  educationPart: string;
  inventoryPart: string;
} {
  const q = question.trim();
  if (/^explain\b/i.test(q)) {
    const rest = q.replace(/^explain\s+/i, "").trim();
    return {
      educationPart: rest.split(/\band\b|\bshow me\b/i)[0]!.trim(),
      inventoryPart: rest,
    };
  }
  const andSplit = q.split(/\band\b/i);
  if (andSplit.length >= 2) {
    return {
      educationPart: andSplit[0]!.trim(),
      inventoryPart: andSplit.slice(1).join(" and ").trim(),
    };
  }
  return { educationPart: q, inventoryPart: q };
}

/** Mixed path: glossary answer + verified inventory as independent subresults, then joined. */
export function answerMixedEducationInventory(input: {
  question: string;
  items: StoreInventoryCard[];
  total?: number;
}): MixedAnswer | null {
  const { educationPart, inventoryPart } = splitEducationInventory(input.question);
  const glossaryHits = lookupEmbeddedClerkKnowledge(educationPart);
  if (glossaryHits.length === 0) return null;

  const educationText = glossaryHits[0]!.chunk.text.split("\n").slice(0, 5).join("\n");
  const educationSource = glossaryHits[0]!.chunk.citationLabel;
  const items = input.items.filter((c) => c.qty > 0 && c.oracleId?.trim());

  const inventoryReply =
    renderSimpleInventoryReply({
      question: inventoryPart.includes("under") ? inventoryPart : input.question,
      items,
      total: input.total,
    }) ??
    (items.length > 0
      ? `We have ${items.length} matching cards in stock.`
      : `I did not find any qualifying matches in the current inventory.`);

  const inventoryOracleIds = [
    ...new Set(items.map((c) => c.oracleId!).filter(Boolean)),
  ];

  const knowledgeResult = {
    answered: true,
    source: educationSource,
    text: educationText.trim(),
  };
  const inventoryResult = {
    matchCount: items.length,
    total: input.total,
    reply: inventoryReply,
  };

  let directAnswer = `${knowledgeResult.text}\n\n${inventoryResult.reply}`;
  if (items.length > 0) {
    directAnswer += `\n\n_Stock listings below are from our verified inventory._`;
  }

  return {
    directAnswer,
    educationSource,
    inventoryOracleIds,
    inventoryItems: items,
    knowledgeResult,
    inventoryResult,
    joinResult: { combined: true },
  };
}

/** Build inventory-only sub-question from a mixed query when tools need a focused search. */
export function extractMixedInventoryQuestion(question: string): string {
  const { inventoryPart } = splitEducationInventory(question);
  const parsed = parseClerkInventoryQuery({ userQuestion: inventoryPart });
  if (isSemanticFilterActive(parsed.semantic)) return inventoryPart;
  return inventoryPart || question;
}
