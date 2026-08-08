/**
 * GrantedRulesSpanDetector — locate candidate granted-rules spans by Oracle grammar,
 * not typography alone. Quotation marks are evidence, not the definition.
 */
import { detectQuoteSpans, type DetectedQuoteSpan } from "./oracle-rc3-quote-span-detector";

export type GrantedRulesTypography = "quoted" | "unquoted_complement" | "parenthetical_rules";

export interface GrantedRulesSpan {
  localStart: number;
  localEnd: number;
  text: string;
  innerText: string;
  typography: GrantedRulesTypography;
  grantingClauseId?: string;
  grantedTo?: string;
  confidence: number;
  structuralCue?: string;
}

const GRANTING_PREFIX =
  /\b(?:(?:Lands|Creatures|Artifacts|Enchantments|Slivers|Permanents|tokens) (?:you control )?have|All \w+(?:s)? have|(?:Enchanted|Equipped) (?:creature|land|artifact|permanent|\w+) has|(?:This|That|Each) token has|it has|(?:have|has|gain|gains|get|gets|with))\s+/i;

const GRANTED_TO_FROM_CUE: Array<{ pattern: RegExp; grantedTo: string }> = [
  { pattern: /\bCreatures you control have\s+/i, grantedTo: "creatures_you_control" },
  { pattern: /\bEnchanted creature has\s+/i, grantedTo: "enchanted_creature" },
  { pattern: /\bEquipped creature has\s+/i, grantedTo: "equipped_creature" },
  { pattern: /\bThis token has\s+/i, grantedTo: "this_token" },
  { pattern: /\bit has\s+/i, grantedTo: "it" },
  { pattern: /\bgains?\s+/i, grantedTo: "subject" },
  { pattern: /\bhas\s+/i, grantedTo: "subject" },
  { pattern: /\bhave\s+/i, grantedTo: "subject" },
];

function inferGrantedTo(before: string): string | undefined {
  for (const entry of GRANTED_TO_FROM_CUE) {
    if (entry.pattern.test(before)) return entry.grantedTo;
  }
  return undefined;
}

function inferStructuralCue(before: string): string | undefined {
  if (/\b(?:Enchanted|Equipped)/i.test(before)) return "enchanted_or_equipped_has";
  if (/\btoken has\b/i.test(before)) return "token_has";
  if (/\bit has\b/i.test(before)) return "it_has";
  if (/\bCreatures you control have\b/i.test(before)) return "creatures_have";
  if (/\bAll \w+/i.test(before)) return "all_have";
  if (/\b(?:gain|gains|have|has)\b/i.test(before)) return "gain_or_have";
  return undefined;
}

/** Unquoted complement after granting cue — e.g. "has flying", "gains haste". */
function detectUnquotedComplements(paragraph: string): GrantedRulesSpan[] {
  const spans: GrantedRulesSpan[] = [];
  const re = GRANTING_PREFIX;
  let m: RegExpExecArray | null;
  const global = new RegExp(re.source, "gi");
  while ((m = global.exec(paragraph)) !== null) {
    const start = m.index + m[0].length;
    const before = paragraph.slice(Math.max(0, m.index), start);
    if (paragraph[start] === '"' || paragraph[start] === "\u201c" || paragraph[start] === "(") continue;

    let end = start;
    while (end < paragraph.length && paragraph[end] !== "." && paragraph[end] !== "\n") end++;
    const innerText = paragraph.slice(start, end).trim();
    if (innerText.length < 3) continue;

    spans.push({
      localStart: start,
      localEnd: end,
      text: paragraph.slice(start, end),
      innerText,
      typography: "unquoted_complement",
      grantedTo: inferGrantedTo(before),
      confidence: 0.82,
      structuralCue: inferStructuralCue(before),
    });
  }
  return spans;
}

/** Parenthetical rules after token creation — e.g. (It has "..."). */
function detectParentheticalGranted(paragraph: string): GrantedRulesSpan[] {
  const spans: GrantedRulesSpan[] = [];
  for (let i = 0; i < paragraph.length; i++) {
    if (paragraph[i] !== "(") continue;
    const inner = paragraph.slice(i + 1);
    if (!/^(?:It|They|The token|This token) (?:has|have|is an)/i.test(inner)) continue;
    let depth = 1;
    let j = i + 1;
    for (; j < paragraph.length && depth > 0; j++) {
      if (paragraph[j] === "(") depth++;
      else if (paragraph[j] === ")") depth--;
    }
    const text = paragraph.slice(i, j);
    const innerText = text.slice(1, -1).trim();
    spans.push({
      localStart: i,
      localEnd: j,
      text,
      innerText,
      typography: "parenthetical_rules",
      grantedTo: /token/i.test(innerText) ? "this_token" : "it",
      confidence: 0.88,
      structuralCue: "parenthetical_token_definition",
    });
    i = j - 1;
  }
  return spans;
}

function quoteSpanToGranted(span: DetectedQuoteSpan, paragraph: string): GrantedRulesSpan {
  const before = paragraph.slice(Math.max(0, span.localStart - 96), span.localStart);
  return {
    localStart: span.localStart,
    localEnd: span.localEnd,
    text: span.text,
    innerText: span.innerText,
    typography: "quoted",
    grantedTo: inferGrantedTo(before),
    confidence: 0.9,
    structuralCue: inferStructuralCue(before),
  };
}

/** Detect all candidate granted-rules spans (quoted + unquoted + parenthetical). */
export function detectGrantedRulesSpans(paragraph: string, grantingClauseId?: string): GrantedRulesSpan[] {
  const quoted = detectQuoteSpans(paragraph).map((s) => quoteSpanToGranted(s, paragraph));
  const unquoted = detectUnquotedComplements(paragraph);
  const paren = detectParentheticalGranted(paragraph);

  const merged: GrantedRulesSpan[] = [];
  const overlaps = (a: GrantedRulesSpan, b: GrantedRulesSpan) =>
    a.localStart < b.localEnd && b.localStart < a.localEnd;

  for (const span of [...quoted, ...unquoted, ...paren]) {
    if (merged.some((m) => overlaps(m, span))) continue;
    merged.push({
      ...span,
      grantingClauseId: grantingClauseId ?? span.grantingClauseId,
    });
  }
  merged.sort((a, b) => a.localStart - b.localStart);
  return merged;
}

/** @deprecated Use detectGrantedRulesSpans — kept for transitional imports. */
export function detectQuoteSpansLegacy(paragraph: string): DetectedQuoteSpan[] {
  return detectQuoteSpans(paragraph);
}
