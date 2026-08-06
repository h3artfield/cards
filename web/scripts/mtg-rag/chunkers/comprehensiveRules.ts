import { readFileSync } from "fs";
import { buildChunkDraft } from "../lib/chunk-build";
import { estimateTokenCount, splitToMaxEmbedSize } from "../lib/token-estimate";
import type { ChunkerContext, ChunkerResult } from "./types";

const RULE_LINE = /^(\d{1,3}(?:\.\d+[a-z]?)?)\.\s+(.+)$/;
const SECTION_LINE = /^(\d{1,3})\.\s+([A-Z].+)$/;
const TARGET_TOKENS = 550;
/** Body text budget; retrieval headers add ~80 tokens. */
const MAX_BODY_TOKENS = 5200;

interface RuleBlock {
  ruleNumber: string;
  parentRule: string;
  sectionHeading: string;
  text: string;
}

function parentOf(ruleNumber: string): string {
  const dot = ruleNumber.indexOf(".");
  return dot > 0 ? ruleNumber.slice(0, dot) : ruleNumber;
}

function parseRules(text: string): { effectiveDate?: string; blocks: RuleBlock[] } {
  const lines = text.split(/\r?\n/);
  let effectiveDate: string | undefined;
  let currentSection = "General";

  for (const line of lines.slice(0, 20)) {
    const m = line.match(/effective as of (.+?)\./i);
    if (m) effectiveDate = m[1]!.trim();
  }

  const blocks: RuleBlock[] = [];
  let current: RuleBlock | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const sectionMatch = line.match(SECTION_LINE);
    if (sectionMatch && !line.match(/^\d{3}\.\d/)) {
      currentSection = `${sectionMatch[1]}. ${sectionMatch[2]}`;
      continue;
    }

    const ruleMatch = line.match(RULE_LINE);
    if (ruleMatch) {
      if (current) blocks.push(current);
      const ruleNumber = ruleMatch[1]!;
      current = {
        ruleNumber,
        parentRule: parentOf(ruleNumber),
        sectionHeading: currentSection,
        text: ruleMatch[2]!,
      };
      continue;
    }

    if (current) {
      current.text += `\n${line}`;
    }
  }
  if (current) blocks.push(current);

  return { effectiveDate, blocks };
}

function combineBlocks(blocks: RuleBlock[]): RuleBlock[] {
  const out: RuleBlock[] = [];
  let buffer: RuleBlock | null = null;

  for (const block of blocks) {
    const combinedText = buffer
      ? `${buffer.text}\n\n${block.ruleNumber}. ${block.text}`
      : `${block.ruleNumber}. ${block.text}`;
    const tokens = estimateTokenCount(combinedText);

    if (!buffer) {
      buffer = { ...block, text: `${block.ruleNumber}. ${block.text}` };
      continue;
    }

    if (tokens <= MAX_BODY_TOKENS && buffer.parentRule === block.parentRule) {
      buffer = {
        ...buffer,
        ruleNumberEnd: block.ruleNumber,
        text: combinedText,
      };
    } else {
      out.push(buffer);
      buffer = { ...block, text: `${block.ruleNumber}. ${block.text}` };
    }

    if (buffer && estimateTokenCount(buffer.text) >= TARGET_TOKENS) {
      out.push(buffer);
      buffer = null;
    }
  }

  if (buffer) out.push(buffer);
  return out.flatMap((block) => {
    if (estimateTokenCount(block.text) <= MAX_BODY_TOKENS) return [block];

    const lines = block.text.split(/\n\n+/);
    const pieces: RuleBlock[] = [];
    let acc = "";
    let startRule = block.ruleNumber;

    for (const line of lines) {
      const candidate = acc ? `${acc}\n\n${line}` : line;
      if (estimateTokenCount(candidate) > MAX_BODY_TOKENS && acc) {
        pieces.push({ ...block, ruleNumber: startRule, text: acc });
        acc = line;
        startRule = line.match(/^(\d{1,3}(?:\.\d+[a-z]?)?)\./)?.[1] ?? startRule;
      } else if (estimateTokenCount(line) > MAX_BODY_TOKENS) {
        if (acc) {
          pieces.push({ ...block, ruleNumber: startRule, text: acc });
          acc = "";
        }
        for (const part of splitToMaxEmbedSize(line, MAX_BODY_TOKENS)) {
          const ruleNum = part.match(/^(\d{1,3}(?:\.\d+[a-z]?)?)\./)?.[1] ?? startRule;
          pieces.push({ ...block, ruleNumber: ruleNum, text: part });
        }
      } else {
        acc = candidate;
      }
    }
    if (acc) pieces.push({ ...block, ruleNumber: startRule, text: acc });
    return pieces;
  });
}

export async function chunkComprehensiveRules(ctx: ChunkerContext): Promise<ChunkerResult> {
  const text = readFileSync(ctx.localPath, "utf8");
  const { effectiveDate, blocks } = parseRules(text);
  const combined = combineBlocks(blocks);

  const chunks = combined.map((block, index) => {
    const ruleEnd = (block as RuleBlock & { ruleNumberEnd?: string }).ruleNumberEnd;
    const retrievalText = [
      "Comprehensive Rules",
      effectiveDate ? `Effective: ${effectiveDate}` : "",
      `Section: ${block.sectionHeading}`,
      `Rule: ${block.ruleNumber}${ruleEnd ? `–${ruleEnd}` : ""}`,
      block.text,
    ]
      .filter(Boolean)
      .join("\n");

    return buildChunkDraft({
      sourceId: ctx.sourceId,
      corpus: "comprehensive_rules",
      authorityTier: "official_rules",
      title: `Rule ${block.ruleNumber}`,
      sectionTitle: block.sectionHeading,
      sectionPath: `rules/${block.ruleNumber}${ruleEnd ? `-${ruleEnd}` : ""}`,
      text: block.text,
      retrievalText,
      chunkIndex: index,
      citationLabel: `CR ${block.ruleNumber}`,
      sourceLocator: block.ruleNumber,
      ruleNumberStart: block.ruleNumber,
      ruleNumberEnd: ruleEnd,
      parentRule: block.parentRule,
      tags: effectiveDate ? [`effective:${effectiveDate}`] : undefined,
    });
  });

  return { chunks, aliasCount: chunks.length };
}
