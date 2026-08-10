/**
 * GrantedRulesSpanDetector — locate candidate granted-rules regions by structural Oracle grammar.
 * Quotation marks are evidence, not the definition.
 */
import { detectQuoteSpans, type DetectedQuoteSpan } from "./oracle-rc3-quote-span-detector";

/** Descriptor between "Create a" and "token with" — e.g. "colorless Clue artifact", "1/1 red Devil creature". */
export const CREATE_TOKEN_DESCRIPTOR = "(?:[\\w/+'-]+(?:\\s+[\\w/+'-]+){0,12})";

export const CREATE_TOKEN_WITH = new RegExp(`\\bCreate a ${CREATE_TOKEN_DESCRIPTOR} token with\\b`, "i");

export const CREATE_TOKEN_WITH_QUOTE = new RegExp(
  `\\bCreate a ${CREATE_TOKEN_DESCRIPTOR} token with\\s*["(\\u201c]?\\s*$`,
  "i",
);

/** @deprecated use CREATE_TOKEN_WITH — artifact-only alias retained for imports */
export const CREATE_ARTIFACT_TOKEN_DESCRIPTOR = CREATE_TOKEN_DESCRIPTOR;

/** @deprecated use CREATE_TOKEN_WITH */
export const CREATE_ARTIFACT_TOKEN_WITH = CREATE_TOKEN_WITH;

/** @deprecated use CREATE_TOKEN_WITH_QUOTE */
export const CREATE_ARTIFACT_TOKEN_WITH_QUOTE = CREATE_TOKEN_WITH_QUOTE;

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
  /(?<![\w])(?:(?:[\w]+ )*tokens you control have|(?:[\w]+ )*tokens you control gain|(?:[\w-]+ )+you control have|(?:[\w-]+ )+you own have|(?:[\w]+ )*(?:Lands|Creatures|Artifacts|Enchantments|Slivers|Permanents|tokens) (?:you control |you own )?have|All \w+(?:s)? have|(?:Enchanted|Equipped) (?:creature|land|artifact|permanent|\w+) has|(?:This|That) [\w]+ gains|(?:This|That) [\w]+ has|(?:This|That) Saga gains|(?:permanent )?cards in (?:your|their|its owner's) [\w ]+ perpetually gains?|(?:This|That|Each) token has|it has|[Tt]arget (?:creature|land|permanent|\w+)(?: you control)?(?: card)?(?: in [^."(\u201c\n]+)?(?: perpetually )?\s+gains|(?:a |an |the |random )(?:[\w]+ )*card in (?:your|their|its owner's) [\w ]+ perpetually gains|Creatures you control (?:perpetually )?gain|(?:creature|token)(?: named [^."(\n]+)? with)\s+/i;

const GRANTED_TO_FROM_CUE: Array<{ pattern: RegExp; grantedTo: string }> = [
  { pattern: /\b(?:[\w]+ )*tokens you control have\s+/i, grantedTo: "tokens_you_control" },
  { pattern: /\b(?:[\w]+ )*tokens you control gain\s+/i, grantedTo: "tokens_you_control" },
  { pattern: /\bCreatures you control (?:perpetually )?gain\s+/i, grantedTo: "creatures_you_control" },
  { pattern: /\b(?:and )?[Ii]t gains\s+/i, grantedTo: "it" },
  { pattern: /\band gains\s+/i, grantedTo: "it" },
  { pattern: /\bCreatures you control have\s+/i, grantedTo: "creatures_you_control" },
  { pattern: /\b(?:[\w-]+ )+you control have\s+/i, grantedTo: "objects_you_control" },
  { pattern: /\b(?:[\w-]+ )+you own have\s+/i, grantedTo: "objects_you_own" },
  { pattern: /\b(?:permanent )?cards in (?:your|their|its owner's) [\w ]+ perpetually gains?\s+/i, grantedTo: "cards_in_zone" },
  { pattern: /\b(?:This|That) [\w]+ gains\s+/i, grantedTo: "it" },
  { pattern: /\b(?:[\w]+ )*creatures you own have\s+/i, grantedTo: "creatures_you_own" },
  { pattern: /\bCreatures you own have\s+/i, grantedTo: "creatures_you_own" },
  {
    pattern: /\b(?:a |an |the |random )(?:[\w]+ )*card in (?:your|their|its owner's) [\w ]+ perpetually gains\s+/i,
    grantedTo: "card_in_zone",
  },
  {
    pattern: /\b[Tt]arget (?:creature|land|permanent|\w+)(?: you control)?(?: card)?(?: in [^."(\u201c\n]+)?(?: perpetually )?\s+gains\s+/i,
    grantedTo: "target",
  },
  { pattern: /\bTarget (?:creature|land|permanent|\w+) gains\s+/i, grantedTo: "target" },
  { pattern: /\bEnchanted creature has\s+/i, grantedTo: "enchanted_creature" },
  { pattern: /\bEquipped creature has\s+/i, grantedTo: "equipped_creature" },
  { pattern: /\bThis token has\s+/i, grantedTo: "this_token" },
  { pattern: /\bit has\s+/i, grantedTo: "it" },
  { pattern: /\b(?:creature|token)(?: named [^."(\n]+)? with\s+/i, grantedTo: "that_token" },
  { pattern: /\b(?:A|The|This) \w+ token is an artifact with\s+/i, grantedTo: "this_token" },
  { pattern: /\bThe token is an artifact with\s+/i, grantedTo: "this_token" },
  { pattern: CREATE_TOKEN_WITH, grantedTo: "created_token" },
];

export function inferGrantedTo(before: string): string | undefined {
  for (const entry of GRANTED_TO_FROM_CUE) {
    if (entry.pattern.test(before)) return entry.grantedTo;
  }
  return undefined;
}

export function inferStructuralCue(before: string): string | undefined {
  if (/\b(?:a |an |the |random )(?:[\w]+ )*card in (?:your|their|its owner's) [\w ]+ perpetually gains\b/i.test(before)) {
    return "card_in_zone_perpetually_gains";
  }
  if (
    /\b[Tt]arget (?:creature|land|permanent|\w+)(?: you control)?(?: card)?(?: in [^."(\u201c\n]+)?(?: perpetually )?\s+gains\b/i.test(
      before,
    )
  ) {
    return "target_gains";
  }
  if (/\bTarget \w+ gains\b/i.test(before)) return "target_gains";
  if (/\b(?:Enchanted|Equipped)/i.test(before)) return "enchanted_or_equipped_has";
  if (/\b(?:[\w]+ )*tokens you control have\b/i.test(before)) return "token_has";
  if (/\b(?:[\w]+ )*tokens you control gain\b/i.test(before)) return "tokens_gain";
  if (/\btoken has\b/i.test(before)) return "token_has";
  if (/\bit has\b/i.test(before)) return "it_has";
  if (/\bCreatures you control (?:perpetually )?gain\b/i.test(before)) return "creatures_gain";
  if (/\b(?:and )?[Ii]t gains\b/i.test(before)) return "it_gains";
  if (/\band gains\b/i.test(before)) return "and_gains";
  if (/\bCreatures you control have\b/i.test(before)) return "creatures_have";
  if (/\b(?:[\w-]+ )+you control have\b/i.test(before)) return "objects_you_control_have";
  if (/\b(?:[\w-]+ )+you own have\b/i.test(before)) return "objects_you_own_have";
  if (/\b(?:permanent )?cards in (?:your|their|its owner's) [\w ]+ perpetually gains?\b/i.test(before)) {
    return "cards_in_zone_perpetually_gains";
  }
  if (/\b(?:This|That) [\w]+ gains\b/i.test(before)) return "object_gains";
  if (/\b(?:[\w]+ )*creatures you own have\b/i.test(before)) return "creatures_you_own_have";
  if (/\bAll \w+/i.test(before)) return "all_have";
  if (/\b(?:creature|token)(?: named [^."(\n]+)? with\b/i.test(before)) return "token_with_ability";
  if (/\b(?:A|The|This) \w+ token is an artifact with\b/i.test(before)) return "token_definition_with";
  if (/\bThe token is an artifact with\b/i.test(before)) return "token_definition_with";
  if (CREATE_TOKEN_WITH.test(before)) return "created_token_with";
  if (/\b(?:Equipped|Enchanted) creature gets [^.\n]+ and has\b/i.test(before)) return "coordinated_equipment_enchanted_has";
  if (/\b(?:Lands|Creatures|Artifacts|Enchantments|Permanents|tokens) (?:you control |you own )?have\b/i.test(before)) {
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
  if (CREATE_TOKEN_WITH_QUOTE.test(before)) return true;
  if (/\b(?:and )?[Ii]t gains\s*["(\u201c]?\s*$/i.test(before)) return true;
  if (/\band gains\s*["(\u201c]?\s*$/i.test(before)) return true;
  if (/\b(?:Equipped|Enchanted) creature gets [^.\n(\u201c"]+ and has\s*["(\u201c]?\s*$/i.test(before)) return true;
  if (/\bis an artifact with\s*["(\u201c]?\s*$/i.test(before)) return false;
  if (/\bis a \w+ with\s*["(\u201c]?\s*$/i.test(before)) return false;
  return inferStructuralCue(before) !== undefined;
}

function isPrimaryAbilityClause(paragraph: string, matchIndex: number): boolean {
  const lineStart = paragraph.lastIndexOf("\n", matchIndex) + 1;
  const prefix = paragraph.slice(lineStart, matchIndex).trim();
  if (/^[+\−-]\d+:/.test(prefix)) return true;
  if (/^\{[^}]+\}(?:\{[^}]+\})*:/.test(prefix)) return true;
  if (/^(?:When|Whenever|At the beginning of)/i.test(prefix)) {
    if (/,\s/.test(prefix)) return false;
    return true;
  }
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
    const isCreateTokenDefinition = CREATE_TOKEN_WITH.test(inner);
    if (!isCreateTokenDefinition && !/^(?:It|They|The token|This token) (?:has|have|is an)/i.test(inner)) {
      continue;
    }
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
      grantedTo: isCreateTokenDefinition ? "created_token" : /token/i.test(innerText) ? "this_token" : "it",
      confidence: 0.88,
      structuralCue: "parenthetical_token_definition",
    });
    i = j - 1;
  }
  return spans;
}

/** Coordinated predicate then grant — recipient NP + predicate A + coordinator + granting verb + complement. */
function detectCoordinatedPredicateGrants(paragraph: string): GrantedRulesSpan[] {
  const spans: GrantedRulesSpan[] = [];
  const recipientNp = "(?:Equipped|Enchanted) creature";
  const predicateA = "[^.\n]+?";
  const coordinator = "and";
  const grantingVerb = "(has|have)";
  const re = new RegExp(
    `\\b(${recipientNp})\\s+gets\\s+(${predicateA})\\s+${coordinator}\\s+${grantingVerb}\\s+`,
    "gi",
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(paragraph)) !== null) {
    const start = m.index;
    const complementStart = m.index + m[0].length;
    let end = complementStart;
    if (paragraph[end] === '"' || paragraph[end] === "\u201c") {
      const closeIdx = paragraph.indexOf('"', end + 1);
      end = closeIdx >= 0 ? closeIdx + 1 : paragraph.length;
    } else {
      while (end < paragraph.length && paragraph[end] !== "." && paragraph[end] !== "\n") end++;
    }
    const text = paragraph.slice(start, end);
    const innerText = paragraph.slice(complementStart, end).trim();
    if (innerText.length < 2) continue;
    spans.push({
      localStart: start,
      localEnd: end,
      text,
      innerText,
      typography: "unquoted_complement",
      grantedTo: /^Equipped/i.test(m[1]) ? "equipped_creature" : "enchanted_creature",
      confidence: 0.86,
      structuralCue: "coordinated_equipment_enchanted_has",
    });
  }
  return spans;
}

/** Grant constructions appearing in the resolution clause after a triggered-ability header. */
function detectTriggeredResolutionGrants(paragraph: string): GrantedRulesSpan[] {
  const trimmed = paragraph.trim();
  if (!/^(?:When|Whenever|At the beginning of)\b/i.test(trimmed)) return [];
  const commaIdx = trimmed.indexOf(",");
  if (commaIdx < 0) return [];

  const spans: GrantedRulesSpan[] = [];
  const effect = trimmed.slice(commaIdx + 1);
  const grantRe =
    /(?<![\w])((?:(?:creatures you control|(?:[\w-]+ )+you control have|target (?:creature|player|permanent|\w+)(?: you control)?(?: card)?(?: in [^."(\n]+)?)|(?:(?:permanent )?cards in (?:your|their|its owner's) [\w ]+)|(?:(?:a |an |the |random )(?:[\w]+ )*card in (?:your|their|its owner's) [\w ]+)) (?:perpetually )?(?:gain|gains|have|has)\s+[^.\n]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = grantRe.exec(effect)) !== null) {
    const localStart = paragraph.indexOf(m[1], commaIdx);
    if (localStart < 0) continue;
    const localEnd = localStart + m[1].length;
    const matchedText = paragraph.slice(localStart, localEnd);
    if (/["\u201c]/.test(matchedText)) continue;
    const innerText = m[1].replace(/^[^.]+\s+(gain|gains|have|has)\s+/i, "").trim();
    if (innerText.startsWith('"') || innerText.startsWith("\u201c")) continue;
    spans.push({
      localStart,
      localEnd,
      text: paragraph.slice(localStart, localEnd),
      innerText,
      typography: "unquoted_complement",
      grantedTo: /^creatures you control/i.test(m[1]) ? "creatures_you_control" : "target",
      confidence: 0.84,
      structuralCue: /^creatures you control/i.test(m[1]) ? "creatures_gain" : "target_gains",
    });
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

function isTokenGlossaryQuote(paragraph: string, spanStart: number): boolean {
  if (isSubsequentTokenGlossaryQuote(paragraph, spanStart)) return true;
  const before = paragraph.slice(Math.max(0, spanStart - 80), spanStart);
  return /\bA \w+ token is an artifact with\s*["(\u201c]?\s*$/i.test(before);
}

function quoteSpanToTokenGlossary(span: DetectedQuoteSpan, paragraph: string): GrantedRulesSpan | null {
  if (!isTokenGlossaryQuote(paragraph, span.localStart)) return null;
  return {
    localStart: span.localStart,
    localEnd: span.localEnd,
    text: span.text,
    innerText: span.innerText,
    typography: "quoted",
    grantedTo: "created_token",
    confidence: 0.92,
    structuralCue: "token_definition_with",
  };
}

function quoteSpanToGranted(span: DetectedQuoteSpan, paragraph: string): GrantedRulesSpan | null {
  if (isTokenGlossaryQuote(paragraph, span.localStart)) return null;
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
    .map((s) => quoteSpanToGranted(s, paragraph) ?? quoteSpanToTokenGlossary(s, paragraph))
    .filter((s): s is GrantedRulesSpan => s !== null);
  const coordinated = detectCoordinatedPredicateGrants(paragraph);
  const triggeredResolution = detectTriggeredResolutionGrants(paragraph);
  const unquoted = detectUnquotedComplements(paragraph);
  const paren = detectParentheticalGranted(paragraph);

  const merged: GrantedRulesSpan[] = [];
  const overlaps = (a: GrantedRulesSpan, b: GrantedRulesSpan) =>
    a.localStart < b.localEnd && b.localStart < a.localEnd;

  for (const span of [...coordinated, ...triggeredResolution, ...quoted, ...unquoted, ...paren]) {
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
