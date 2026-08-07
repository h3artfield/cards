/**
 * Derive complete catalog-backed gold labels from oracle text only.
 * Used for Category B gold completion — parser output is never authoritative.
 */
import { segmentAbilities, segmentCardFaces } from "../../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import type {
  ExpectedCondition,
  ExpectedPrimitiveAction,
  ExpectedStructure,
  OracleActionEvalCaseV2,
} from "../audit-oracle-action-eval-cases";
import { inferDerivedRoles, type PrimitiveActionType } from "../../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import { evidenceMatchesOracle } from "../oracle-action-eval-shared";
import { stripMechanicReminderText, isReminderTextOnlyPrimitive } from "./gold-reminder-text-policy";
import {
  hasGenericLibraryShuffle,
  hasOptionalStandaloneShuffle,
  hasShuffleIntoLibraryMove,
  shuffleIntoLibraryEvidence,
  shuffleLibraryEvidence,
} from "./taxonomy-v13-shuffle-migration";
import type { CatalogEvalCase } from "./eval-provenance-guard";
import { resolveNamedCardFromCatalog } from "./eval-case-from-catalog";
import { goldenFaceRecords, type GoldenCatalogIndex } from "./load-golden-catalog-index";
import { buildDevelopmentCardNameLookup } from "./dev-case-card-name-lookup";
import { HELD_OUT_SEEDS } from "../generate-oracle-action-held-out-set";

export type GoldCompletenessStatus = "complete" | "incomplete";

export interface CatalogGoldCompletion {
  expectedPrimitiveActions: ExpectedPrimitiveAction[];
  expectedStructure?: ExpectedStructure;
  expectedConditions?: ExpectedCondition[];
  expectedRoles?: OracleActionEvalCaseV2["expectedRoles"];
  forbiddenPrimitiveActions?: PrimitiveActionType[];
  goldCompletenessStatus: GoldCompletenessStatus;
  completionReason?: string;
  incompleteReasons: string[];
}

const PRIMITIVE_RULES: Array<{
  type: PrimitiveActionType;
  pattern: RegExp;
  zones?: Partial<ExpectedPrimitiveAction>;
}> = [
  { type: "draw", pattern: /\b(?:Draw|draws?)(?: [^.—\n]{0,40})?/i },
  { type: "search_library", pattern: /\b[Ss]earch(?:es)? (?:your |their |a )?library[^.—\n]*/i },
  { type: "add_mana", pattern: /\bAdd \{[^}]+\}/i },
  { type: "destroy", pattern: /\bDestroy (?:target|all|up to)[^.—\n]*/i },
  { type: "exile", pattern: /\b(?:Exile|exile) (?:target|all|up to|the top|one or two|it instead|any number)[^.—\n]*/i },
  { type: "counter", pattern: /\bCounter target[^.—\n]*/i },
  { type: "return_to_hand", pattern: /\bReturn target[^.—\n]* to (?:its|their) owner'?s hand/i },
  {
    type: "return_to_battlefield",
    pattern: /\b(?:Return|Put) target[^.—\n]* from (?:your |a )?graveyard (?:to your hand|to the battlefield|onto the battlefield)/i,
  },
  {
    type: "return_to_battlefield",
    pattern: /\b(?:Return|Put) target[^.—\n]* from a graveyard onto the battlefield/i,
  },
  { type: "put_onto_battlefield", pattern: /\bput [^.—\n]* onto the battlefield/i },
  { type: "create_token", pattern: /\b(?:create|creates) (?:a |an |one |two |three |up to )?[\d/]*[\w ]*token/i },
  { type: "cast", pattern: /\b(?:You may )?[Cc]ast [^.—\n]*/i },
  { type: "play", pattern: /\b(?:You may )?play (?:lands|land cards|that card|an additional land|spells from)/i },
  { type: "copy", pattern: /\b[Cc]opy (?:target|that spell|the exiled|equipped|of target)/i },
  { type: "sacrifice", pattern: /\b[Ss]acrifice[^.—\n]*/i },
  { type: "discard", pattern: /\b(?:Discard|discards)[^.—\n]*/i },
  { type: "deal_damage", pattern: /\b(?:deals?|Deal) (?:\d+|X|up to \d+) damage[^.—\n]*/i },
  { type: "gain_life", pattern: /\bgain(?:s)? \d+ life/i },
  { type: "lose_life", pattern: /\bloses? \d+ life/i },
  { type: "mill", pattern: /\b(?:mill|mills)[^.—\n]*/i },
  { type: "scry", pattern: /\bScry (?:\d+|up to \d+)/i },
  { type: "surveil", pattern: /\bSurveil \d+/i },
  { type: "tap", pattern: /\bTap (?:target|all|up to)[^.—\n]*/i },
  { type: "untap", pattern: /\bUntap (?:target|all|up to)[^.—\n]*/i },
  { type: "put_counter", pattern: /\bPut (?:a |one |up to one )?[\+\-]?\/?[\+\-]?\d+[^.—\n]*/i },
  { type: "shuffle_into_library", pattern: /\bshuffles?[^.—\n]* into[^.—\n]* library/i },
  { type: "shuffle_library", pattern: /\b(?:then )?[Ss]huffle(?:s)?(?: your library)?(?![\w ]+ into\b)[^.—\n]*/i },
  { type: "shuffle_library", pattern: /\bYou may shuffle\.?\b/i },
];

function prepareGoldDerivationCorpus(oracleText: string, cardFace?: string): string {
  let corpus = stripMechanicReminderText(faceCorpus(oracleText, cardFace));
  corpus = corpus.replace(/\(As this Saga enters and after your draw step[^)]*\)/gi, "");
  corpus = corpus.replace(/\b(?:Menace|Flying|Trample|Deathtouch|Lifelink|Hexproof|Defender|Reach|Vigilance|First strike|Double strike) \([^)]*\)/gi, "");
  corpus = corpus.replace(/\bCycling \{[^}]+\} \([^)]*\)/gi, "");
  corpus = corpus.replace(/\bFlashback \{[^}]+\} \([^)]*\)/gi, "");
  corpus = corpus.replace(/\bAftermath \([^)]*\)/gi, "");
  corpus = corpus.replace(/\bStorm \([^)]*\)/gi, "");
  corpus = corpus.replace(/\bEvoke \{[^}]+\}/gi, "");
  return corpus.trim();
}

function isPersistentPermissionSpan(corpus: string, span: string): boolean {
  const lower = span.toLowerCase();
  if (/\byou may cast this (?:card|spell) from\b/i.test(span)) return true;
  if (/\byou may play (?:cards|lands|land cards) (?:from|exiled)\b/i.test(span)) return true;
  const idx = corpus.toLowerCase().indexOf(lower);
  if (idx < 0) return false;
  const before = corpus.slice(Math.max(0, idx - 80), idx);
  if (/\bemblem with\b/i.test(before) || /\bhas "/i.test(before)) return true;
  if (/\bplayers can't cast spells\b/i.test(corpus) && /\bcast spells from graveyards\b/i.test(span)) return true;
  return false;
}

function isCostOnlySpan(span: string, corpus: string): boolean {
  if (/\bas an additional cost\b/i.test(corpus) && /\bpay \d+ life\b/i.test(span)) return true;
  if (/\bDiscard this card:/i.test(corpus) && /\bDraw a card\b/i.test(span)) return true;
  return false;
}

function routePutOntoBattlefieldPrimitive(span: string, primitive: ExpectedPrimitiveAction): ExpectedPrimitiveAction {
  if (/\bto (?:your |their )?hand\b/i.test(span) && /\bfrom (?:your |a )?graveyard\b/i.test(span)) {
    return {
      ...primitive,
      actionType: "return_to_hand",
      sourceZone: "graveyard",
      destinationZone: "hand",
    };
  }
  if (/\bfrom (?:your |a )?graveyard\b/i.test(span)) {
    return {
      ...primitive,
      actionType: "return_to_battlefield",
      sourceZone: "graveyard",
      destinationZone: primitive.destinationZone ?? "battlefield",
    };
  }
  if (/\bfrom your hand onto the battlefield\b/i.test(span)) {
    return {
      ...primitive,
      actionType: "put_onto_battlefield",
      sourceZone: "hand",
      destinationZone: "battlefield",
    };
  }
  return primitive;
}

export function dedupeGoldPrimitives(
  primitives: ExpectedPrimitiveAction[],
): ExpectedPrimitiveAction[] {
  const kept: ExpectedPrimitiveAction[] = [];
  for (const p of primitives) {
    const dupeIdx = kept.findIndex(
      (k) =>
        k.actionType === p.actionType &&
        (k.cardFace ?? "") === (p.cardFace ?? "") &&
        (k.evidenceContains.toLowerCase().includes(p.evidenceContains.toLowerCase()) ||
          p.evidenceContains.toLowerCase().includes(k.evidenceContains.toLowerCase())),
    );
    if (dupeIdx >= 0) {
      if (p.evidenceContains.length > kept[dupeIdx].evidenceContains.length) {
        kept[dupeIdx] = p;
      }
      continue;
    }
    kept.push(p);
  }
  return kept;
}

function appendShuffleTaxonomyPrimitives(
  oracleText: string,
  cardFace: string | undefined,
  derived: ExpectedPrimitiveAction[],
  seen: Set<string>,
): void {
  const corpus = faceCorpus(oracleText, cardFace);
  const hasShuffleLibrary = derived.some((p) => p.actionType === "shuffle_library");
  const hasShuffleInto = derived.some((p) => p.actionType === "shuffle_into_library");

  if (!hasShuffleInto && hasShuffleIntoLibraryMove(corpus)) {
    const span = shuffleIntoLibraryEvidence(corpus);
    const key = `shuffle_into_library:${span.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      derived.push({ actionType: "shuffle_into_library", evidenceContains: span, cardFace });
    }
  }
  if (!hasShuffleLibrary && (hasGenericLibraryShuffle(corpus) || hasOptionalStandaloneShuffle(corpus))) {
    const span = shuffleLibraryEvidence(corpus);
    const key = `shuffle_library:${span.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      derived.push({ actionType: "shuffle_library", evidenceContains: span, cardFace });
    }
  }
}

function faceCorpus(oracleText: string, cardFace?: string): string {
  if (!cardFace || !oracleText.includes("\n//\n")) return oracleText;
  const parts = oracleText.split("\n//\n");
  if (cardFace === "back" || cardFace === "right") return parts[1] ?? parts[parts.length - 1] ?? oracleText;
  return parts[0] ?? oracleText;
}

function detectFaceForSpan(oracleText: string, span: string): string | undefined {
  if (!oracleText.includes("\n//\n")) return undefined;
  const parts = oracleText.split("\n//\n");
  const inFront = parts[0]?.toLowerCase().includes(span.toLowerCase());
  const inBack = parts[1]?.toLowerCase().includes(span.toLowerCase());
  if (inFront && !inBack) return "front";
  if (inBack && !inFront) return "back";
  return undefined;
}

function deriveStructure(corpus: string, prior?: ExpectedStructure): ExpectedStructure | undefined {
  const structure: ExpectedStructure = { ...prior };
  if (/\b(When|Whenever|At the beginning of)\b/i.test(corpus)) {
    structure.minTriggeredAbilities = Math.max(structure.minTriggeredAbilities ?? 0, 1);
  }
  if (/\{[^}]+\}:/.test(corpus) || /\{T\}/.test(corpus)) {
    structure.minActivatedAbilities = Math.max(structure.minActivatedAbilities ?? 0, 1);
  }
  if (/\bYou may\b/i.test(corpus)) structure.optional = true;
  return Object.keys(structure).length ? structure : undefined;
}

function deriveConditions(corpus: string): ExpectedCondition[] {
  const conditions: ExpectedCondition[] = [];
  const rules: Array<{ pattern: RegExp; type: ExpectedCondition["type"] }> = [
    { pattern: /\bIf you do\b/i, type: "if_you_do" },
    { pattern: /\bWhen you do\b/i, type: "when_you_do" },
    { pattern: /\bunless (?:their|that|a) controller pays\b/i, type: "unless" },
    { pattern: /\bonly if\b/i, type: "only_if" },
    { pattern: /\bAs long as\b/i, type: "as_long_as" },
    { pattern: /\bIf a source would\b/i, type: "replacement" },
    { pattern: /\bAt the beginning of the next end step\b/i, type: "delayed" },
    { pattern: /\bIf you control\b/i, type: "if" },
    { pattern: /\bif it is tapped\b/i, type: "if" },
    { pattern: /\bIf they don't\b/i, type: "unless" },
  ];
  for (const { pattern, type } of rules) {
    const m = corpus.match(pattern);
    if (m) {
      conditions.push({ textContains: m[0], type });
    }
  }
  return conditions;
}

function applyOptionality(primitive: ExpectedPrimitiveAction, span: string, corpus: string): ExpectedPrimitiveAction {
  const p = { ...primitive };
  if (/\bYou may\b/i.test(corpus) && span.toLowerCase().includes("you may")) {
    p.optional = true;
    p.optionalEffect = true;
  }
  const upTo = span.match(/\bup to (?:one|two|three|four|five|\d+|X)\b/i);
  if (upTo) {
    p.quantityMayBeZero = true;
    p.optionalEffect = false;
    const n = upTo[0].match(/\d+|one|two|three|four|five|X/i)?.[0];
    if (n === "one") p.targetMaximum = 1;
    else if (n === "two") p.targetMaximum = 2;
    else if (n === "three") p.targetMaximum = 3;
    else if (n === "X") p.targetMaximum = "X";
  }
  if (/\bas an additional cost\b/i.test(corpus) && p.actionType === "sacrifice") {
    p.optionalCost = true;
  }
  return p;
}

export function derivePrimitivesFromOracleText(
  oracleText: string,
  cardFace?: string,
): ExpectedPrimitiveAction[] {
  const corpus = prepareGoldDerivationCorpus(oracleText, cardFace);
  const derived: ExpectedPrimitiveAction[] = [];
  const seen = new Set<string>();

  for (const rule of PRIMITIVE_RULES) {
    const re = new RegExp(rule.pattern.source, rule.pattern.flags.includes("g") ? rule.pattern.flags : rule.pattern.flags + "g");
    let match: RegExpExecArray | null;
    while ((match = re.exec(corpus)) !== null) {
      const span = match[0].trim();
      const key = `${rule.type}:${span.toLowerCase()}`;
      if (seen.has(key)) continue;
      if (isReminderTextOnlyPrimitive(span)) continue;
      if (isPersistentPermissionSpan(corpus, span)) continue;
      if (isCostOnlySpan(span, corpus)) continue;
      seen.add(key);
      let primitive: ExpectedPrimitiveAction = {
        actionType: rule.type,
        evidenceContains: span,
        cardFace: cardFace ?? detectFaceForSpan(oracleText, span),
        ...rule.zones,
      };
      if (rule.type === "put_onto_battlefield") {
        primitive = routePutOntoBattlefieldPrimitive(span, primitive);
      }
      primitive = applyOptionality(primitive, span, corpus);
      derived.push(primitive);
    }
  }

  appendShuffleTaxonomyPrimitives(oracleText, cardFace, derived, seen);
  return dedupeGoldPrimitives(derived);
}

function findEvidenceInCorpus(corpus: string, hint: string): string | null {
  if (!hint.trim()) return null;
  const lower = corpus.toLowerCase();
  const idx = lower.indexOf(hint.toLowerCase());
  if (idx >= 0) return corpus.slice(idx, idx + hint.length);
  const words = hint.split(/\s+/).filter((w) => w.length > 4);
  for (const word of words) {
    const widx = lower.indexOf(word.toLowerCase());
    if (widx >= 0) {
      const start = Math.max(0, widx - 15);
      const end = Math.min(corpus.length, widx + hint.length + 15);
      return corpus.slice(start, end).trim();
    }
  }
  return null;
}

function deriveFromHeldSeed(
  testCase: CatalogEvalCase,
  seedIndex: number,
): ExpectedPrimitiveAction[] {
  const seed = HELD_OUT_SEEDS[seedIndex];
  if (!seed) return [];
  const corpus = faceCorpus(testCase.oracleText, seed.face ?? testCase.cardFace);
  const derived: ExpectedPrimitiveAction[] = [];
  for (const p of seed.primitives) {
    const span = findEvidenceInCorpus(corpus, p.evidenceContains);
    if (!span) continue;
    derived.push({
      actionType: p.actionType,
      evidenceContains: span,
      cardFace: seed.face ?? testCase.cardFace,
      optional: p.optional,
    });
  }
  return derived;
}

export function completeGoldFromCatalogOracle(input: {
  testCase: CatalogEvalCase;
  catalog?: GoldenCatalogIndex;
  cardNameLookup?: Map<string, string>;
}): CatalogGoldCompletion {
  const { testCase } = input;
  const incompleteReasons: string[] = [];
  let oracleText = testCase.oracleText;
  let cardFace = testCase.cardFace;

  const heldIdx = testCase.id.match(/^held-(\d+)$/)?.[1];
  if (heldIdx) {
    const primitives = deriveFromHeldSeed(testCase, parseInt(heldIdx, 10) - 1);
    const seed = HELD_OUT_SEEDS[parseInt(heldIdx, 10) - 1];
    const structure = deriveStructure(oracleText, seed?.structure ?? testCase.expectedStructure);
    const roles = inferDerivedRoles(primitives.map((p) => p.actionType));
    if (primitives.length === 0 && (seed?.primitives.length ?? 0) > 0) {
      incompleteReasons.push("Held seed primitives not found in catalog oracle text");
    }
    return {
      expectedPrimitiveActions: primitives,
      expectedStructure: structure,
      expectedConditions: testCase.expectedConditions,
      expectedRoles: roles.length
        ? roles.map((role) => ({
            role,
            fromPrimitiveActions: primitives.map((p) => p.actionType),
          }))
        : testCase.expectedRoles,
      forbiddenPrimitiveActions: seed?.forbidden ?? testCase.forbiddenPrimitiveActions,
      goldCompletenessStatus: incompleteReasons.length ? "incomplete" : "complete",
      incompleteReasons,
    };
  }

  let primitives = derivePrimitivesFromOracleText(oracleText, cardFace);
  if (primitives.length === 0 && testCase.expectedPrimitiveActions.length > 0) {
    primitives = testCase.expectedPrimitiveActions.filter((p) =>
      evidenceMatchesOracle(faceCorpus(oracleText, p.cardFace ?? cardFace), p.evidenceContains),
    );
  }

  const structure = deriveStructure(oracleText, testCase.expectedStructure);
  const conditions = deriveConditions(oracleText);
  const hasLayer1Only =
    primitives.length === 0 &&
    ((structure?.minTriggeredAbilities ?? 0) > 0 ||
      (structure?.minActivatedAbilities ?? 0) > 0 ||
      (testCase.forbiddenPrimitiveActions?.length ?? 0) > 0 ||
      conditions.length > 0 ||
      /\b(can't|cannot|don't|do not)\b/i.test(oracleText));

  if (primitives.length === 0 && !hasLayer1Only) {
    const faces = segmentCardFaces(oracleText);
    const hasAbilities = faces.some((f) => segmentAbilities(testCase.oracleId, f.faceId, f.text, f.start).length > 0);
    if (hasAbilities) {
      incompleteReasons.push("Oracle text has abilities but no Layer 2 primitives derived");
    }
  }

  for (const p of primitives) {
    const corpus = faceCorpus(oracleText, p.cardFace ?? cardFace);
    if (!evidenceMatchesOracle(corpus, p.evidenceContains)) {
      incompleteReasons.push(`Evidence "${p.evidenceContains}" not in oracle for ${p.actionType}`);
    }
  }

  const roles = inferDerivedRoles(primitives.map((p) => p.actionType));

  return {
    expectedPrimitiveActions: primitives,
    expectedStructure: structure,
    expectedConditions: conditions.length ? conditions : testCase.expectedConditions,
    expectedRoles: roles.length
      ? roles.map((role) => ({
          role,
          fromPrimitiveActions: primitives
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
      : testCase.expectedRoles,
    forbiddenPrimitiveActions: testCase.forbiddenPrimitiveActions,
    goldCompletenessStatus: incompleteReasons.length ? "incomplete" : "complete",
    incompleteReasons,
  };
}

export function maybeFixCaseIdentity(input: {
  testCase: CatalogEvalCase;
  catalog: GoldenCatalogIndex;
  cardNameLookup: Map<string, string>;
  reviewer: string;
}): CatalogEvalCase {
  const cardName = input.cardNameLookup.get(input.testCase.id);
  if (!cardName || cardName === input.testCase.cardName) return input.testCase;
  try {
    const identity = resolveNamedCardFromCatalog(
      input.catalog,
      { name: cardName, face: input.testCase.cardFace, layout: input.testCase.layout },
      input.reviewer,
    );
    const golden = input.catalog.byOracleId.get(identity.oracleId)!;
    const faces = goldenFaceRecords(golden);
    return {
      ...input.testCase,
      oracleId: identity.oracleId,
      oracleText: identity.oracleText,
      cardName: identity.cardName,
      layout: identity.layout ?? input.testCase.layout,
      colorIdentity: identity.colorIdentity,
      goldenCatalogVersion: identity.goldenCatalogVersion,
      goldenOracleTextHash: identity.goldenOracleTextHash,
      faceIndex: faces[0]?.faceIndex,
      faceName: faces[0]?.faceName,
      identityStatus: "catalog_exact",
    };
  } catch {
    return input.testCase;
  }
}
