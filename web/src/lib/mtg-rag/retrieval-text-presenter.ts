import { extractRuleReferences } from "./retrieval-lexical-signals";
import type { MtgKnowledgeChunk } from "./types";

const DEFAULT_MAX_CHARS = 2400;
const RULES_MAX_CHARS = 3200;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findBestRuleAnchor(text: string, ruleRefs: string[]): number {
  let bestIdx = -1;
  let bestSpecificity = -1;

  for (const ref of ruleRefs) {
    const patterns = [
      new RegExp(`\\b${escapeRegExp(ref)}\\.`, "i"),
      new RegExp(`\\bRule:\\s*${escapeRegExp(ref)}`, "i"),
      new RegExp(`\\b${escapeRegExp(ref)}\\b`, "i"),
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.index == null) continue;
      const specificity = ref.length;
      if (specificity > bestSpecificity) {
        bestSpecificity = specificity;
        bestIdx = match.index;
      }
    }
  }

  if (bestIdx >= 0) return bestIdx;
  if (ruleRefs[0]) {
    const fallback = text.match(new RegExp(`\\b${escapeRegExp(ruleRefs[0].split(".")[0]!)}\\.`, "i"));
    if (fallback?.index != null) return fallback.index;
  }
  return -1;
}

function extractTextWindow(text: string, anchorIdx: number, maxChars: number): string {
  if (text.length <= maxChars) return text;

  let start = Math.max(0, anchorIdx - Math.floor(maxChars * 0.12));
  if (start + maxChars > text.length) start = Math.max(0, text.length - maxChars);
  let window = text.slice(start, start + maxChars);
  if (start > 0) window = `…${window}`;
  if (start + maxChars < text.length) window = `${window}…`;
  return window;
}

export function presentRetrievalTextForQuery(
  chunk: MtgKnowledgeChunk,
  query: string,
  maxChars = DEFAULT_MAX_CHARS,
): string {
  const text = chunk.retrievalText;
  const limit = chunk.corpus === "comprehensive_rules" ? Math.max(maxChars, RULES_MAX_CHARS) : maxChars;

  if (chunk.corpus === "comprehensive_rules") {
    const ruleRefs = extractRuleReferences(query);
    const anchorIdx = findBestRuleAnchor(text, ruleRefs);
    const anchor =
      anchorIdx >= 0
        ? anchorIdx
        : chunk.ruleNumberStart
          ? text.indexOf(`${chunk.ruleNumberStart}.`)
          : -1;
    if (anchor >= 0) return extractTextWindow(text, anchor, limit);
  }

  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}…`;
}
