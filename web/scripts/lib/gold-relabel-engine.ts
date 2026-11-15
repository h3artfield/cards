/**
 * Derive catalog-confirmed gold labels from oracle text + review hints.
 */
import type {
  ExpectedPrimitiveAction,
  OracleActionEvalCaseV2,
} from "../audit-oracle-action-eval-cases";
import { inferDerivedRoles, type PrimitiveActionType } from "../../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import {
  evidenceMatchesOracle,
  inferSupportedPrimitiveFromEvidence,
} from "../oracle-action-eval-shared";
import type { CatalogEvalCase } from "./eval-provenance-guard";
import { PRODUCTION_GOLD_REVIEW_VERSION } from "./eval-provenance-guard";

export type GoldRelabelClassification =
  | "confirmed"
  | "modified"
  | "removed"
  | "newly_added"
  | "layer1_instead_of_layer2"
  | "invalid_prior_text";

export interface GoldRelabelChange {
  classification: GoldRelabelClassification;
  field: string;
  before?: unknown;
  after?: unknown;
  reason: string;
}

export interface GoldSeedHint {
  primitives?: Array<{
    actionType: PrimitiveActionType;
    evidenceContains: string;
    optional?: boolean;
    sourceZone?: string;
    destinationZone?: string;
    affectedObject?: string;
  }>;
  forbidden?: PrimitiveActionType[];
  structure?: OracleActionEvalCaseV2["expectedStructure"];
  face?: string;
}

const PRIMITIVE_PATTERNS: Partial<Record<PrimitiveActionType, RegExp>> = {
  add_mana: /\bAdd \{[^}]+\}/i,
  draw: /\b(?:draw|draws)(?:s)?(?: [^.—\n]{0,40})?/i,
  discard: /\b(?:discard|discards)[^.—\n]*/i,
  search_library: /\bsearch(?:es)? (?:your |their |a )?library[^.—\n]*/i,
  deal_damage: /\bdeals? (?:\d+|X) damage[^.—\n]*/i,
  destroy: /\bDestroy[^.—\n]*/i,
  exile: /\b(?:Exile|exile)[^.—\n]*/i,
  counter: /\bCounter target[^.—\n]*/i,
  return_to_hand: /\bReturn target[^.—\n]* to (?:its|their) owner'?s hand/i,
  return_to_battlefield: /\bReturn target[^.—\n]* from (?:your |a )?graveyard (?:to your hand|to the battlefield|onto the battlefield)/i,
  put_onto_battlefield: /\bput [^.—\n]* onto the battlefield/i,
  create_token: /\bcreate [^.—\n]* token/i,
  cast: /\b(?:cast|play) [^.—\n]*/i,
  play: /\bplay (?:lands|land cards|spells)[^.—\n]*/i,
  copy: /\b[Cc]opy [^.—\n]*/i,
  sacrifice: /\b[Ss]acrifice[^.—\n]*/i,
  mill: /\b(?:mill|mills)[^.—\n]*/i,
  gain_life: /\bgain \d+ life/i,
  lose_life: /\bloses? \d+ life/i,
  scry: /\bScry \d+/i,
  surveil: /\bSurveil \d+/i,
  tap: /\bTap target[^.—\n]*/i,
  untap: /\bUntap[^.—\n]*/i,
  put_counter: /\bPut (?:a |one |up to one )?[\+\-]?\/?[\+\-]?\d+[^.—\n]*/i,
  shuffle_into_library: /\bshuffles?[^.—\n]* into[^.—\n]* library/i,
};

function evidenceCorpus(oracleText: string, cardFace?: string): string {
  if (!cardFace || !oracleText.includes("\n//\n")) return oracleText;
  const parts = oracleText.split("\n//\n");
  if (cardFace === "back") return parts[1] ?? parts[parts.length - 1] ?? oracleText;
  if (cardFace === "front") return parts[0] ?? oracleText;
  return oracleText;
}

function findBestEvidenceSpan(
  corpus: string,
  actionType: PrimitiveActionType,
  hint?: string,
): string | null {
  if (hint?.trim()) {
    const lower = corpus.toLowerCase();
    const idx = lower.indexOf(hint.toLowerCase());
    if (idx >= 0) {
      return corpus.slice(idx, idx + hint.length);
    }
    const words = hint.split(/\s+/).filter((w) => w.length > 3);
    for (const word of words) {
      const widx = lower.indexOf(word.toLowerCase());
      if (widx >= 0) {
        const start = Math.max(0, widx - 20);
        const end = Math.min(corpus.length, widx + hint.length + 20);
        const slice = corpus.slice(start, end).trim();
        if (inferSupportedPrimitiveFromEvidence(corpus, slice) === actionType) return slice;
      }
    }
  }

  const pattern = PRIMITIVE_PATTERNS[actionType];
  if (pattern) {
    const match = corpus.match(pattern);
    if (match) return match[0].trim();
  }
  return null;
}

function primitiveKey(p: ExpectedPrimitiveAction): string {
  return `${p.actionType}:${p.evidenceContains.toLowerCase()}`;
}

function deriveStructure(corpus: string, hint?: OracleActionEvalCaseV2["expectedStructure"]) {
  const hasTrigger = /\b(When|Whenever|At the beginning of)\b/i.test(corpus);
  const hasActivated = /\{[^}]+\}:/.test(corpus) || /\{T\}/.test(corpus);
  const structure: OracleActionEvalCaseV2["expectedStructure"] = { ...hint };
  if (hasTrigger && (structure.minTriggeredAbilities ?? 0) < 1) {
    structure.minTriggeredAbilities = 1;
  }
  if (hasActivated && (structure.minActivatedAbilities ?? 0) < 1) {
    structure.minActivatedAbilities = 1;
  }
  if (/\bYou may\b/i.test(corpus) && structure.optional === undefined) {
    structure.optional = true;
  }
  return Object.keys(structure).length ? structure : undefined;
}

export function relabelCaseGold(input: {
  baseCase: CatalogEvalCase;
  seedHint?: GoldSeedHint;
  priorGold?: ExpectedPrimitiveAction[];
  reviewer: string;
  reviewedAt: string;
}): { testCase: CatalogEvalCase; changes: GoldRelabelChange[] } {
  const { baseCase, seedHint, priorGold = [], reviewer, reviewedAt } = input;
  const changes: GoldRelabelChange[] = [];
  const corpus = evidenceCorpus(baseCase.oracleText, baseCase.cardFace ?? seedHint?.face);
  const derived: ExpectedPrimitiveAction[] = [];
  const seen = new Set<string>();

  const addPrimitive = (primitive: ExpectedPrimitiveAction, source: string) => {
    const key = primitiveKey(primitive);
    if (seen.has(key)) return;
    seen.add(key);
    derived.push(primitive);
    const prior = priorGold.find(
      (p) => p.actionType === primitive.actionType && evidenceMatchesOracle(priorGold.length ? corpus : corpus, p.evidenceContains),
    );
    if (!prior) {
      changes.push({
        classification: "newly_added",
        field: "expectedPrimitiveActions",
        after: primitive,
        reason: `Derived from catalog oracle text via ${source}`,
      });
    } else if (
      prior.actionType !== primitive.actionType ||
      prior.evidenceContains !== primitive.evidenceContains
    ) {
      changes.push({
        classification: "modified",
        field: "expectedPrimitiveActions",
        before: prior,
        after: primitive,
        reason: `Evidence span updated to match catalog text (${source})`,
      });
    } else {
      changes.push({
        classification: "confirmed",
        field: "expectedPrimitiveActions",
        before: prior,
        after: primitive,
        reason: "Prior gold confirmed against catalog oracle text",
      });
    }
  };

  for (const hint of seedHint?.primitives ?? []) {
    const span = findBestEvidenceSpan(corpus, hint.actionType, hint.evidenceContains);
    if (!span) {
      const invalidPrior = priorGold.find((p) => p.actionType === hint.actionType);
      if (invalidPrior) {
        changes.push({
          classification: "invalid_prior_text",
          field: "expectedPrimitiveActions",
          before: invalidPrior,
          reason: `Seed/hint evidence "${hint.evidenceContains}" not found in catalog text — likely written against wrong card text`,
        });
      }
      continue;
    }
    addPrimitive(
      {
        actionType: hint.actionType,
        evidenceContains: span,
        cardFace: seedHint?.face ?? baseCase.cardFace,
        optional: hint.optional,
        optionalEffect: hint.optional,
        sourceZone: hint.sourceZone,
        destinationZone: hint.destinationZone,
        affectedObject: hint.affectedObject,
      },
      "seed hint",
    );
  }

  for (const prior of priorGold) {
    const key = primitiveKey(prior);
    if (seen.has(key)) continue;
    if (evidenceMatchesOracle(corpus, prior.evidenceContains)) {
      addPrimitive(prior, "prior gold");
    } else {
      changes.push({
        classification: "invalid_prior_text",
        field: "expectedPrimitiveActions",
        before: prior,
        reason: "Prior evidence not present in catalog oracle text",
      });
    }
  }

  if (
    priorGold.length === 0 &&
    derived.length === 0 &&
    seedHint?.forbidden?.length &&
    /\b(can't|cannot|don't|do not)\b/i.test(corpus)
  ) {
    changes.push({
      classification: "layer1_instead_of_layer2",
      field: "expectedPrimitiveActions",
      reason: "Static restriction / abstention — Layer 1 structure only, no Layer 2 primitives",
    });
  }

  const expectedStructure = deriveStructure(corpus, seedHint?.structure ?? baseCase.expectedStructure);
  const roles = inferDerivedRoles(derived.map((p) => p.actionType));

  const testCase: CatalogEvalCase = {
    ...baseCase,
    expectedPrimitiveActions: derived,
    expectedStructure,
    expectedRoles: roles.length
      ? roles.map((role) => ({
          role,
          fromPrimitiveActions: derived
            .map((p) => p.actionType)
            .filter((p) =>
              role === "tutor"
                ? p === "search_library"
                : role === "ramp"
                  ? p === "add_mana" || p === "put_onto_battlefield"
                  : role === "removal"
                    ? ["destroy", "exile", "deal_damage", "counter"].includes(p)
                    : role === "card_advantage"
                      ? p === "draw"
                      : role === "recursion"
                        ? ["return_to_battlefield", "play", "cast", "put_onto_battlefield"].includes(p)
                        : false,
            ),
        }))
      : undefined,
    forbiddenPrimitiveActions: seedHint?.forbidden ?? baseCase.forbiddenPrimitiveActions,
    cardFace: seedHint?.face ?? baseCase.cardFace,
    goldReviewVersion: PRODUCTION_GOLD_REVIEW_VERSION,
    goldReviewedAt: reviewedAt,
    goldReviewer: reviewer,
  };

  return { testCase, changes };
}

export function summarizeRelabelChanges(changes: GoldRelabelChange[]): Record<GoldRelabelClassification, number> {
  const counts = {
    confirmed: 0,
    modified: 0,
    removed: 0,
    newly_added: 0,
    layer1_instead_of_layer2: 0,
    invalid_prior_text: 0,
  };
  for (const c of changes) counts[c.classification] += 1;
  return counts;
}
