/**
 * Recursive extraction for quoted/granted abilities (have/has/gain "…").
 */
import {
  compoundClauseSpansWithRoles,
  type TextRole,
} from "./oracle-span-role-classifier";
import {
  routeCandidateRegions,
  filterGrantedRulesRoutes,
  type RoutedSemanticRegion,
} from "./oracle-rc3-semantic-context-router";
import { classifyGrantedRulesSpan } from "./oracle-rc3-granted-rules-classifier";
import {
  tagGrantedContext,
  tagTokenDefinitionContext,
  type RC3ActionExtensions,
} from "./oracle-rc3-extraction-metadata";

export type GrantedAbilityType = "activated" | "triggered" | "static";

export interface GrantedQuoteContext {
  grantedAbilityId: string;
  grantedAbilityType: GrantedAbilityType;
  innerLocalStart: number;
  innerText: string;
  quoteLocalStart: number;
  quoteLocalEnd: number;
  structuralCue?: string;
  grantedTo?: string;
  typography?: GrantedRulesSpan["typography"];
}

export function inferGrantedAbilityType(innerText: string): GrantedAbilityType {
  const t = innerText.trim();
  if (/^[+\−-]\d+:/.test(t) || /^\{[^}]+\}(?:\{[^}]+\})*:/.test(t)) return "activated";
  if (/^(When|Whenever|At the beginning of)/i.test(t)) return "triggered";
  return "static";
}

function unquoteInner(text: string): string {
  const t = text.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("\u201c") && t.endsWith("\u201d"))) {
    return t.slice(1, -1);
  }
  if (t.startsWith("(") && t.endsWith(")")) return t.slice(1, -1).trim();
  return t;
}

/** Granted ability spans — excludes token definitions (routed separately). */
export function findGrantedQuoteContexts(
  paragraph: string,
  parentAbilityId: string,
): GrantedQuoteContext[] {
  const routes = filterGrantedRulesRoutes(routeCandidateRegions(paragraph, parentAbilityId));

  return routes
    .map((route) => buildGrantedQuoteContext(paragraph, route, parentAbilityId))
    .filter((ctx): ctx is GrantedQuoteContext => ctx !== null && ctx.innerText.length >= 3);
}

function buildGrantedQuoteContext(
  paragraph: string,
  route: RoutedSemanticRegion,
  parentAbilityId: string,
): GrantedQuoteContext | null {
  const span = route.span;
  const classified = classifyGrantedRulesSpan(paragraph, span);
  if (classified.classification !== "granted_rules_ability") return null;
  const innerText = unquoteInner(span.innerText).trim();
  const innerOffset =
    span.typography === "quoted" && (span.text.startsWith('"') || span.text.startsWith("\u201c"))
      ? span.localStart + 1
      : span.localStart;
  return {
    grantedAbilityId: `${parentAbilityId}:granted:${span.localStart}`,
    grantedAbilityType:
      classified.grantedAbilityType === "replacement"
        ? "static"
        : (classified.grantedAbilityType ?? inferGrantedAbilityType(innerText)),
    innerLocalStart: innerOffset,
    innerText,
    quoteLocalStart: span.localStart,
    quoteLocalEnd: span.localEnd,
    structuralCue: route.structuralCue ?? span.structuralCue,
    grantedTo: span.grantedTo,
    typography: span.typography,
  };
}

export function isInsideGrantedQuote(paragraph: string, localStart: number): boolean {
  return findGrantedQuoteContexts(paragraph, "probe").some(
    (ctx) => localStart >= ctx.quoteLocalStart && localStart < ctx.quoteLocalEnd,
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

export function isTokenDefinitionStructuralCue(cue?: string): boolean {
  return (
    cue === "token_definition_with" ||
    cue === "created_token_with" ||
    cue === "parenthetical_token_definition" ||
    cue === "created_object_it_has"
  );
}

export function grantedContextExtensions(ctx: GrantedQuoteContext): RC3ActionExtensions {
  if (isTokenDefinitionStructuralCue(ctx.structuralCue)) {
    return tagTokenDefinitionContext({
      action: { extractionSource: "rc3_clause_native" },
      grantingClauseId: ctx.grantedAbilityId.split(":granted:")[0] ?? ctx.grantedAbilityId,
      grantedAbilityId: ctx.grantedAbilityId,
      grantedTo: ctx.grantedTo,
    });
  }
  return tagGrantedContext({
    action: { extractionSource: "rc3_clause_native" },
    grantingClauseId: ctx.grantedAbilityId.split(":granted:")[0] ?? ctx.grantedAbilityId,
    grantedAbilityId: ctx.grantedAbilityId,
    grantedTo: ctx.grantedTo,
  });
}

export function validateGrantedProvenance(input: {
  paragraphLength: number;
  quoteLocalStart: number;
  quoteLocalEnd: number;
  nestedLocalStart: number;
  nestedLocalEnd: number;
}): boolean {
  if (input.quoteLocalStart < 0 || input.quoteLocalEnd > input.paragraphLength) return false;
  if (input.nestedLocalStart < input.quoteLocalStart || input.nestedLocalEnd > input.quoteLocalEnd) return false;
  return input.nestedLocalStart < input.nestedLocalEnd;
}
