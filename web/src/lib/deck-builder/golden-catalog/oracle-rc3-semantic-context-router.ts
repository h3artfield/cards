/**
 * SemanticContextRouter — route candidate rules regions before grant classification.
 *
 * Candidate rules region
 *       ↓
 * SemanticContextRouter
 *       ├─ granted_rules      → GrantedRulesRegion
 *       ├─ token_definition   → TokenDefinitionRegion
 *       ├─ reminder_only      → ReminderOnlyRegion
 *       └─ card_native/other  → excluded from grant pipeline
 */
import {
  CREATE_TOKEN_WITH,
  CREATE_TOKEN_WITH_QUOTE,
  detectGrantedRulesSpans,
  inferStructuralCue,
  type GrantedRulesSpan,
} from "./oracle-rc3-granted-rules-span-detector";
import { classifyGrantedRulesSpan } from "./oracle-rc3-granted-rules-classifier";
import { isTokenDefinitionStructuralCue } from "./oracle-granted-ability-extraction";

export type SemanticContextKind =
  | "granted_rules"
  | "token_definition"
  | "reminder_only"
  | "card_native"
  | "other";

export type RoutedSemanticRegion = {
  contextKind: SemanticContextKind;
  span: GrantedRulesSpan;
  structuralCue?: string;
  recipientOrigin?: "existing_object" | "newly_created_object" | "token_definition";
};

function isNewlyCreatedObjectCapability(paragraph: string, span: GrantedRulesSpan): boolean {
  const before = paragraph.slice(Math.max(0, span.localStart - 220), span.localStart);
  const immediate = paragraph.slice(Math.max(0, span.localStart - 40), span.localStart);
  if (!/\b(?:It|They|Each) (?:has|have)\s*["(\u201c]?\s*$/i.test(immediate)) return false;
  if (/\bcreate (?:a |an |two |three |four |five |six |seven |eight |nine |ten |\d+ )[^.!\n]{0,80} tokens?\b/i.test(before)) {
    return true;
  }
  if (/\bcreate [^.!\n]{0,100} tokens?[^.!\n]{0,40}\.\s+(?:It|They|Each) (?:has|have)\s*["(\u201c]?\s*$/i.test(before)) {
    return true;
  }
  return false;
}

function isTokenDefinitionSpan(paragraph: string, span: GrantedRulesSpan): boolean {
  if (isNewlyCreatedObjectCapability(paragraph, span)) return true;
  const before = paragraph.slice(Math.max(0, span.localStart - 120), span.localStart);
  const cue = span.structuralCue ?? inferStructuralCue(before);
  if (isTokenDefinitionStructuralCue(cue)) return true;
  if (CREATE_TOKEN_WITH_QUOTE.test(before)) return true;
  if (span.typography === "parenthetical_rules" && CREATE_TOKEN_WITH.test(span.innerText.trim())) {
    return true;
  }
  if (/\b(?:A|The|This) \w+ token is an artifact with\s*["(\u201c]?\s*$/i.test(before)) return true;
  if (/\bThe token is an artifact with\s*["(\u201c]?\s*$/i.test(before)) return true;
  if (/^A \w+ token is an/i.test(span.innerText.trim())) return true;
  if (span.typography === "parenthetical_rules" && /is an artifact with/i.test(span.innerText)) {
    if (/^A \w+ token is an/i.test(span.innerText.trim())) return true;
    const nested = span.innerText.match(/["\u201c]([^"\u201d]+)["\u201d]/);
    if (nested && /\{[^}]+\}|Sacrifice|Add \{/i.test(nested[1])) return true;
  }
  return false;
}

/** Route one candidate span to its semantic context — token definitions never become granted_rules. */
export function routeSemanticContext(paragraph: string, span: GrantedRulesSpan): RoutedSemanticRegion {
  const before = paragraph.slice(Math.max(0, span.localStart - 120), span.localStart);
  const structuralCue = span.structuralCue ?? inferStructuralCue(before);

  if (isTokenDefinitionSpan(paragraph, span)) {
    const newlyCreated = isNewlyCreatedObjectCapability(paragraph, span);
    return {
      contextKind: "token_definition",
      span,
      structuralCue: newlyCreated ? "created_object_it_has" : structuralCue,
      recipientOrigin: newlyCreated ? "newly_created_object" : "token_definition",
    };
  }

  const classified = classifyGrantedRulesSpan(paragraph, span);
  if (classified.classification === "reminder_mechanic_text") {
    return { contextKind: "reminder_only", span, structuralCue };
  }

  if (classified.classification === "granted_rules_ability") {
    const recipientOrigin = /\bCreate a \w+/i.test(before)
      ? "newly_created_object"
      : "existing_object";
    return { contextKind: "granted_rules", span, structuralCue, recipientOrigin };
  }

  if (classified.classification === "quoted_card_name_reference") {
    return { contextKind: "other", span, structuralCue };
  }

  return { contextKind: "other", span, structuralCue };
}

/** Detect all candidate spans and route each to a semantic context bucket. */
export function routeCandidateRegions(
  paragraph: string,
  parentAbilityId?: string,
): RoutedSemanticRegion[] {
  return detectGrantedRulesSpans(paragraph, parentAbilityId).map((span) =>
    routeSemanticContext(paragraph, span),
  );
}

export function filterGrantedRulesRoutes(routes: RoutedSemanticRegion[]): RoutedSemanticRegion[] {
  return routes.filter((r) => r.contextKind === "granted_rules");
}

export function filterTokenDefinitionRoutes(routes: RoutedSemanticRegion[]): RoutedSemanticRegion[] {
  return routes.filter((r) => r.contextKind === "token_definition");
}
