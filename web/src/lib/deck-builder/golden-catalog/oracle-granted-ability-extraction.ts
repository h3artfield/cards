/**
 * Recursive extraction for quoted/granted abilities (have/has/gain "…").
 */
import {
  compoundClauseSpansWithRoles,
  findQuotedAbilitySpans,
  type TextRole,
} from "./oracle-span-role-classifier";

export type GrantedAbilityType = "activated" | "triggered" | "static";

export interface GrantedQuoteContext {
  grantedAbilityId: string;
  grantedAbilityType: GrantedAbilityType;
  /** Start offset of inner rules text within the host ability paragraph. */
  innerLocalStart: number;
  innerText: string;
  quoteLocalStart: number;
  quoteLocalEnd: number;
}

function unquote(text: string): string {
  const t = text.trim();
  if (t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1);
  return t;
}

export function inferGrantedAbilityType(innerText: string): GrantedAbilityType {
  const t = innerText.trim();
  if (/^[+\−-]\d+:/.test(t) || /^\{[^}]+\}(?:\{[^}]+\})*:/.test(t)) return "activated";
  if (/^(When|Whenever|At the beginning of)/i.test(t)) return "triggered";
  return "static";
}

/** Granted ability quotes that contain real rules text (not reminder). */
export function findGrantedQuoteContexts(
  paragraph: string,
  parentAbilityId: string,
): GrantedQuoteContext[] {
  return findQuotedAbilitySpans(paragraph)
    .filter((span) => span.role === "effect")
    .map((span) => {
      const innerText = unquote(span.text);
      return {
        grantedAbilityId: `${parentAbilityId}:granted:${span.localStart}`,
        grantedAbilityType: inferGrantedAbilityType(innerText),
        innerLocalStart: span.localStart + (span.text.startsWith('"') ? 1 : 0),
        innerText,
        quoteLocalStart: span.localStart,
        quoteLocalEnd: span.localEnd,
      };
    })
    .filter((ctx) => ctx.innerText.length >= 4);
}

export function isInsideGrantedQuote(paragraph: string, localStart: number): boolean {
  return findQuotedAbilitySpans(paragraph).some(
    (span) => span.role === "effect" && localStart >= span.localStart && localStart < span.localEnd,
  );
}

export function grantedClauseSpans(
  ctx: GrantedQuoteContext,
): Array<{ localStart: number; text: string; role: TextRole; clause?: { clauseId: string } }> {
  return compoundClauseSpansWithRoles(ctx.innerText, ctx.grantedAbilityId).map((span) => ({
    ...span,
    localStart: ctx.innerLocalStart + span.localStart,
  }));
}
