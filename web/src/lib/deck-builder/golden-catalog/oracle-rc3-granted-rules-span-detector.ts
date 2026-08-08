/**
 * GrantedRulesSpanDetector — locate candidate granted-rules regions by structural Oracle grammar.
 * Quotation marks are evidence, not the definition.
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

/** Recipient-bound granting verbs — no bare gain/with on primary card text. */
const STRUCTURAL_GRANTING_PREFIX =
  /\b(?:(?:Lands|Creatures|Artifacts|Enchantments|Slivers|Permanents|tokens) (?:you control )?have|All \w+(?:s)? have|(?:Enchanted|Equipped) (?:creature|land|artifact|permanent|\w+) has|(?:This|That|Each) token has|it has|Target (?:creature|land|permanent|\w+) gains|Creatures you control (?:perpetually )?gain|(?:creature|token)(?: named [^."(\n]+)? with)\s+/i;

const GRANTED_TO_FROM_CUE: Array<{ pattern: RegExp; grantedTo: string }> = [
  { pattern: /\bCreatures you control (?:perpetually )?gain\s+/i, grantedTo: "creatures_you_control" },
  { pattern: /\bCreatures you control have\s+/i, grantedTo: "creatures_you_control" },
  { pattern: /\bTarget (?:creature|land|permanent|\w+) gains\s+/i, grantedTo: "target" },
  { pattern: /\bEnchanted creature has\s+/i, grantedTo: "enchanted_creature" },
  { pattern: /\bEquipped creature has\s+/i, grantedTo: "equipped_creature" },
  { pattern: /\bThis token has\s+/i, grantedTo: "this_token" },
  { pattern: /\bit has\s+/i, grantedTo: "it" },
  { pattern: /\b(?:creature|token)(?: named [^."(\n]+)? with\s+/i, grantedTo: "that_token" },
  { pattern: /\b(?:A|The|This) \w+ token is an artifact with\s+/i, grantedTo: "this_token" },
  { pattern: /\bThe token is an artifact with\s+/i, grantedTo: "this_token" },
  { pattern: /\bCreate a \w+ artifact token with\s+/i, grantedTo: "created_token" },
];

export function inferGrantedTo(before: string): string | undefined {
  for (const entry of GRANTED_TO_FROM_CUE) {
    if (entry.pattern.test(before)) return entry.grantedTo;
  }
  return undefined;
}

export function inferStructuralCue(before: string): string | undefined {
  if (/\bTarget \w+ gains\b/i.test(before)) return "target_gains";
  if (/\b(?:Enchanted|Equipped)/i.test(before)) return "enchanted_or_equipped_has";
  if (/\btoken has\b/i.test(before)) return "token_has";
  if (/\bit has\b/i.test(before)) return "it_has";
  if (/\bCreatures you control (?:perpetually )?gain\b/i.test(before)) return "creatures_gain";
  if (/\bCreatures you control have\b/i.test(before)) return "creatures_have";
  if (/\bAll \w+/i.test(before)) return "all_have";
  if (/\b(?:creature|token)(?: named [^."(\n]+)? with\b/i.test(before)) return "token_with_ability";
  if (/\b(?:A|The|This) \w+ token is an artifact with\b/i.test(before)) return "token_definition_with";
  if (/\bThe token is an artifact with\b/i.test(before)) return "token_definition_with";
  if (/\bCreate a \w+ artifact token with\b/i.test(before)) return "created_token_with";
  if (/\b(?:Lands|Creatures|Artifacts|Enchantments|Permanents|tokens) (?:you control )?have\b/i.test(before)) {
    return "permanents_have";
  }
  return undefined;
}

/** True when text before a quote/complement is a syntactic granting attachment, not primary card rules. */
export function hasStructuralGrantingCue(paragraph: string, spanStart: number): boolean {
  const before = paragraph.slice(Math.max(0, spanStart - 120), spanStart);
  if (/\bYou get an emblem with\s*["(\u201c]?\s*$/i.test(before)) return false;
  if (/\b(?:A|The|This) \w+ token is an artifact with\s*["(\u201c]?\s*$/i.test(before)) return true;
  if (/\bThe token is an artifact with\s*["(\u201c]?\s*$/i.test(before)) return true;
  if (/\bCreate a \w+ artifact token with\s*["(\u201c]?\s*$/i.test(before)) return true;
  if (/\bis an artifact with\s*["(\u201c]?\s*$/i.test(before)) return false;
  if (/\bis a \w+ with\s*["(\u201c]?\s*$/i.test(before)) return false;
  return inferStructuralCue(before) !== undefined;
}

function isPrimaryAbilityClause(paragraph: string, matchIndex: number): boolean {
  const lineStart = paragraph.lastIndexOf("\n", matchIndex) + 1;
  const prefix = paragraph.slice(lineStart, matchIndex).trim();
  if (/^[+\−-]\d+:/.test(prefix)) return true;
  if (/^\{[^}]+\}(?:\{[^}]+\})*:/.test(prefix)) return true;
  if (/^(?:When|Whenever|At the beginning of)/i.test(prefix)) return true;
  if (/^Flying\b/i.test(prefix)) return true;
  return false;
}

/** Unquoted complement after structural granting cue — e.g. "has flying", "gains haste". */
function detectUnquotedComplements(paragraph: string): GrantedRulesSpan[] {
  const spans: GrantedRulesSpan[] = [];
  const global = new RegExp(STRUCTURAL_GRANTING_PREFIX.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = global.exec(paragraph)) !== null) {
    const start = m.index + m[0].length;
    const before = paragraph.slice(Math.max(0, m.index), start);
    if (paragraph[start] === '"' || paragraph[start] === "\u201c" || paragraph[start] === "(") continue;
    if (isPrimaryAbilityClause(paragraph, m.index)) continue;

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

/** Parenthetical rules after token creation — e.g. (It has "..."). Excludes reminder definitions. */
function detectParentheticalGranted(paragraph: string): GrantedRulesSpan[] {
  const spans: GrantedRulesSpan[] = [];
  for (let i = 0; i < paragraph.length; i++) {
    if (paragraph[i] !== "(") continue;
    const inner = paragraph.slice(i + 1);
    if (/^A \w+ is an (?:artifact|creature|enchantment|land)/i.test(inner)) continue;
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

function isSubsequentTokenGlossaryQuote(paragraph: string, spanStart: number): boolean {
  const parenStart = paragraph.lastIndexOf("(", spanStart);
  if (parenStart < 0) return false;
  const parenInner = paragraph.slice(parenStart + 1, spanStart);
  if (!/^A \w+ token is an/i.test(paragraph.slice(parenStart + 1, parenStart + 24))) return false;
  return /["\u201c][^"\u201d]+["\u201d]\s+A \w+ token is an/i.test(parenInner);
}

function quoteSpanToGranted(span: DetectedQuoteSpan, paragraph: string): GrantedRulesSpan | null {
  if (isSubsequentTokenGlossaryQuote(paragraph, span.localStart)) return null;
  if (!hasStructuralGrantingCue(paragraph, span.localStart)) return null;
  const before = paragraph.slice(Math.max(0, span.localStart - 120), span.localStart);
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
  const quoted = detectQuoteSpans(paragraph)
    .map((s) => quoteSpanToGranted(s, paragraph))
    .filter((s): s is GrantedRulesSpan => s !== null);
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
