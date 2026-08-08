/**
 * GrantedRulesClassifier — classify candidate regions by structural granting context + nested ability shape.
 */
import type { GrantedRulesSpan } from "./oracle-rc3-granted-rules-span-detector";
import {
  hasStructuralGrantingCue,
  inferStructuralCue,
} from "./oracle-rc3-granted-rules-span-detector";
import type { DetectedQuoteSpan } from "./oracle-rc3-quote-span-detector";
import { inferBlockAbilityType } from "./oracle-rc3-ability-block";

export type QuotedContentClass =
  | "granted_rules_ability"
  | "reminder_mechanic_text"
  | "quoted_card_name_reference"
  | "other_quoted_text";

export type ClassifierErrorCategory =
  | "missing_granting_cue"
  | "reminder_mechanic"
  | "card_name_reference"
  | "primary_ability_text"
  | "ability_shape_mismatch"
  | "other";

export interface ClassifiedGrantedRulesSpan {
  span: GrantedRulesSpan;
  classification: QuotedContentClass;
  grantedAbilityType?: "activated" | "triggered" | "static" | "replacement";
  structuralCue?: string;
  errorCategory?: ClassifierErrorCategory;
}

function looksLikeAbilityRules(inner: string): boolean {
  const t = inner.trim();
  if (t.length < 3) return false;
  if (/^(When|Whenever|At the beginning)/i.test(t)) return true;
  if (/^[+\−-]\d+:/.test(t)) return true;
  if (/^\{[^}]+\}(?:\{[^}]+\})*:/.test(t)) return true;
  if (/^\{T\}:/i.test(t)) return true;
  if (/^Sacrifice [^:]+:/i.test(t)) return true;
  if (/\bAdd \{[WUBRGC]\}/i.test(t)) return true;
  if (/\bDraw a card\b/i.test(t)) return true;
  if (/\bgain \d+ life\b/i.test(t)) return true;
  if (/\bcan't be blocked\b/i.test(t)) return true;
  if (/\bYou may cast\b/i.test(t)) return true;
  if (/^(?:flying|haste|vigilance|trample|deathtouch|lifelink|hexproof|indestructible|defender|reach|first strike|double strike|menace|ward \d+)/i.test(t)) {
    return true;
  }
  return inferBlockAbilityType(t) !== "unknown";
}

function nestedQuotedAbility(inner: string): string | undefined {
  const match = inner.match(/["\u201c]([^"\u201d]+)["\u201d]/);
  return match?.[1]?.trim();
}

function looksLikeReminder(inner: string, span?: GrantedRulesSpan): boolean {
  const t = inner.trim();
  if (span?.typography === "parenthetical_rules" && /is an artifact with/i.test(t)) {
    const quoted = nestedQuotedAbility(t);
    if (quoted && looksLikeAbilityRules(quoted)) return false;
  }
  if (/^This (?:mana|ability|creature|token|artifact|enchantment|permanent)\b/i.test(t)) return true;
  if (/can't be spent to cast/i.test(t)) {
    if (/^\{[^}]+\}:/.test(t) || /\{T\}:/.test(t)) return false;
    if (/["\u201c][^"\u201d]*(?:\{T\}|Sacrifice|Add \{)/i.test(t)) return false;
    return true;
  }
  if (/^A \w+ is (?:an artifact|a creature|an enchantment)/i.test(t)) return true;
  if (/^Choose one/i.test(t)) return true;
  return false;
}

function looksLikeCardName(inner: string): boolean {
  const t = inner.trim();
  return t.length > 0 && t.length < 48 && !/[.:]/.test(t) && /^[A-Z][a-zA-Z0-9 ',-]+$/u.test(t);
}

function inferAbilityType(inner: string): ClassifiedGrantedRulesSpan["grantedAbilityType"] {
  const abilityType = inferBlockAbilityType(inner);
  if (abilityType === "triggered") return "triggered";
  if (abilityType === "activated") return "activated";
  if (abilityType === "replacement") return "replacement";
  return "static";
}

export function classifyGrantedRulesSpan(paragraph: string, span: GrantedRulesSpan): ClassifiedGrantedRulesSpan {
  const inner = span.innerText.trim();
  const cue = span.structuralCue ?? inferStructuralCue(paragraph.slice(Math.max(0, span.localStart - 120), span.localStart));
  const grantingContext =
    span.typography !== "quoted" ? cue !== undefined : hasStructuralGrantingCue(paragraph, span.localStart);

  const abilityInner =
    span.typography === "parenthetical_rules" && /is an artifact with/i.test(inner)
      ? (nestedQuotedAbility(inner) ?? inner)
      : inner;

  if (looksLikeReminder(inner, span)) {
    return {
      span,
      classification: "reminder_mechanic_text",
      structuralCue: cue,
      errorCategory: "reminder_mechanic",
    };
  }

  if (looksLikeCardName(inner) && span.typography === "quoted") {
    return {
      span,
      classification: "quoted_card_name_reference",
      structuralCue: cue,
      errorCategory: "card_name_reference",
    };
  }

  if (!grantingContext) {
    return {
      span,
      classification: "other_quoted_text",
      structuralCue: cue,
      errorCategory: span.typography === "quoted" ? "missing_granting_cue" : "primary_ability_text",
    };
  }

  if (looksLikeAbilityRules(abilityInner)) {
    return {
      span,
      classification: "granted_rules_ability",
      grantedAbilityType: inferAbilityType(abilityInner),
      structuralCue: cue,
    };
  }

  if (cue && inner.length >= 3 && span.typography === "unquoted_complement") {
    return {
      span,
      classification: "granted_rules_ability",
      grantedAbilityType: "static",
      structuralCue: cue,
    };
  }

  return {
    span,
    classification: "other_quoted_text",
    structuralCue: cue,
    errorCategory: "ability_shape_mismatch",
  };
}

export function classifyAllGrantedRulesSpans(paragraph: string, spans: GrantedRulesSpan[]): ClassifiedGrantedRulesSpan[] {
  return spans.map((span) => classifyGrantedRulesSpan(paragraph, span));
}

export function classifyQuotedSpan(paragraph: string, span: DetectedQuoteSpan): ClassifiedGrantedRulesSpan {
  const before = paragraph.slice(Math.max(0, span.localStart - 120), span.localStart);
  const grantedSpan: GrantedRulesSpan = {
    localStart: span.localStart,
    localEnd: span.localEnd,
    text: span.text,
    innerText: span.innerText,
    typography: "quoted",
    confidence: 0.9,
    structuralCue: inferStructuralCue(before),
  };
  return classifyGrantedRulesSpan(paragraph, grantedSpan);
}

export function classifyAllQuotedSpans(paragraph: string, spans: DetectedQuoteSpan[]): ClassifiedGrantedRulesSpan[] {
  return spans.map((span) => classifyQuotedSpan(paragraph, span));
}
