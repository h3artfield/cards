/**
 * GrantedRulesClassifier — classify detected granted-rules spans by grammar and inner ability shape.
 */
import type { GrantedRulesSpan } from "./oracle-rc3-granted-rules-span-detector";
import type { DetectedQuoteSpan } from "./oracle-rc3-quote-span-detector";
import { inferBlockAbilityType } from "./oracle-rc3-ability-block";

export type QuotedContentClass =
  | "granted_rules_ability"
  | "reminder_mechanic_text"
  | "quoted_card_name_reference"
  | "other_quoted_text";

export interface ClassifiedGrantedRulesSpan {
  span: GrantedRulesSpan;
  classification: QuotedContentClass;
  grantedAbilityType?: "activated" | "triggered" | "static" | "replacement";
  structuralCue?: string;
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

function looksLikeReminder(inner: string): boolean {
  const t = inner.trim();
  if (/^This (?:mana|ability|creature|token|artifact|enchantment|permanent)\b/i.test(t)) return true;
  if (/can't be spent to cast/i.test(t)) return true;
  if (/^A \w+ is /i.test(t)) return true;
  if (/^Choose one/i.test(t)) return true;
  return false;
}

function looksLikeCardName(inner: string): boolean {
  const t = inner.trim();
  return t.length > 0 && t.length < 48 && !/[.:]/.test(t) && /^[A-Z][a-zA-Z0-9 ',-]+$/u.test(t);
}

export function classifyGrantedRulesSpan(paragraph: string, span: GrantedRulesSpan): ClassifiedGrantedRulesSpan {
  const cue = span.structuralCue;
  const inner = span.innerText.trim();

  if (looksLikeReminder(inner)) {
    return { span, classification: "reminder_mechanic_text", structuralCue: cue };
  }

  if (looksLikeCardName(inner) && span.typography === "quoted") {
    return { span, classification: "quoted_card_name_reference", structuralCue: cue };
  }

  if ((cue || span.typography !== "quoted") && looksLikeAbilityRules(inner)) {
    const abilityType = inferBlockAbilityType(inner);
    return {
      span,
      classification: "granted_rules_ability",
      grantedAbilityType:
        abilityType === "triggered"
          ? "triggered"
          : abilityType === "activated"
            ? "activated"
            : abilityType === "replacement"
              ? "replacement"
              : "static",
      structuralCue: cue,
    };
  }

  if (cue && inner.length >= 3) {
    return {
      span,
      classification: "granted_rules_ability",
      grantedAbilityType: "static",
      structuralCue: cue,
    };
  }

  return { span, classification: "other_quoted_text", structuralCue: cue };
}

export function classifyAllGrantedRulesSpans(paragraph: string, spans: GrantedRulesSpan[]): ClassifiedGrantedRulesSpan[] {
  return spans.map((span) => classifyGrantedRulesSpan(paragraph, span));
}

export function classifyQuotedSpan(paragraph: string, span: DetectedQuoteSpan): ClassifiedGrantedRulesSpan {
  const grantedSpan: GrantedRulesSpan = {
    localStart: span.localStart,
    localEnd: span.localEnd,
    text: span.text,
    innerText: span.innerText,
    typography: "quoted",
    confidence: 0.9,
  };
  return classifyGrantedRulesSpan(paragraph, grantedSpan);
}

export function classifyAllQuotedSpans(paragraph: string, spans: DetectedQuoteSpan[]): ClassifiedGrantedRulesSpan[] {
  return spans.map((span) => classifyQuotedSpan(paragraph, span));
}
