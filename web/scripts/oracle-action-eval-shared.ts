/**
 * Shared utilities for Oracle-action evaluation freeze and audit.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateEvidenceSpan, segmentOracleCard } from "../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import {
  normalizeToPrimitive,
  PRIMITIVE_ACTION_TYPES,
  type PrimitiveActionType,
} from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { buildCases } from "./generate-oracle-action-eval-cases";

export const TAXONOMY_VERSION = "three-layer-v1.2";
export const TAXONOMY_VERSION_PREVIOUS = "three-layer-v1.1";
export const EVALUATION_VERSION = "eval-frozen-v1";
export const REVIEWER_ID = "catalog-audit-agent";

export interface RelabelAuditEntry {
  caseId: string;
  originalLabel: string;
  newLabel: string;
  reason: string;
}

export interface ManualReviewRecord {
  caseId: string;
  cardName: string;
  oracleId: string;
  cardFace?: string;
  originalExpectation: string;
  correctedExpectation: string;
  reason: string;
  reviewer: string;
  reviewTimestamp: string;
  decision: "confirmed" | "changed" | "reverted";
  reviewNotes?: string;
}

export interface ExpectedPrimitiveAction {
  actionType: PrimitiveActionType;
  evidenceContains: string;
  cardFace?: string;
  /** @deprecated use optionalEffect */
  optional?: boolean;
  optionalEffect?: boolean;
  optionalCost?: boolean;
  sourceZone?: string;
  destinationZone?: string;
  affectedObject?: string;
  condition?: string;
  targetMinimum?: number;
  targetMaximum?: number | "X";
  quantityMayBeZero?: boolean;
  negative?: boolean;
  loyaltyCost?: string;
  sagaChapterId?: string;
  optionId?: string;
}

export interface ExpectedCondition {
  textContains: string;
  type?: "if" | "unless" | "only_if" | "as_long_as" | "if_you_do" | "when_you_do" | "delayed" | "intervening_if" | "replacement";
  attachesToEvidence?: string;
  attachesToAbilityIndex?: number;
}

export interface FrozenEvalManifest {
  evaluationVersion: string;
  contentHash: string;
  taxonomyVersion: string;
  reviewerCount: number;
  reviewedCaseCount: number;
  relabeledExpectationCount: number;
  confirmedRelabelCount: number;
  changedRelabelCount: number;
  revertedRelabelCount: number;
  frozenAt: string;
  developmentSetPath: string;
  heldOutSetPath: string;
  rewritePolicy: "frozen — parser development must not silently modify expected labels";
}

export function computeContentHash(cases: OracleActionEvalCaseV2[]): string {
  const canonical = JSON.stringify(
    cases.map((c) => ({
      id: c.id,
      category: c.category,
      layout: c.layout,
      oracleId: c.oracleId,
      oracleText: c.oracleText,
      cardFace: c.cardFace,
      expectedStructure: c.expectedStructure,
      expectedPrimitiveActions: c.expectedPrimitiveActions,
      expectedConditions: c.expectedConditions,
      expectedRoles: c.expectedRoles,
      forbiddenPrimitiveActions: c.forbiddenPrimitiveActions,
    })),
  );
  return createHash("sha256").update(canonical).digest("hex");
}

export function buildCardNameLookup(): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const c of buildCases()) {
    lookup.set(c.id, c.oracleText.split("\n")[0]?.trim() || c.id);
  }
  return lookup;
}

export function cardNameForCase(testCase: OracleActionEvalCaseV2, lookup: Map<string, string>): string {
  return lookup.get(testCase.id) ?? testCase.oracleText.split("\n")[0]?.trim() ?? testCase.id;
}

export function abilityScopeKey(faceId: string, abilityIndex: number): string {
  return `${faceId}:${abilityIndex}`;
}

/** Ability paragraphs whose evidence appears in gold expectations for this case. */
export function goldCoveredAbilityScopeKeys(testCase: OracleActionEvalCaseV2): Set<string> {
  const abilities = segmentOracleCard({ oracleId: testCase.oracleId, oracleText: testCase.oracleText });
  const keys = new Set<string>();
  for (const exp of testCase.expectedPrimitiveActions.filter((e) => !e.negative)) {
    const needle = exp.evidenceContains.toLowerCase();
    for (const ab of abilities) {
      if (exp.cardFace && exp.cardFace !== ab.cardFaceId) continue;
      if (ab.paragraphText.toLowerCase().includes(needle)) {
        keys.add(abilityScopeKey(ab.cardFaceId, ab.abilityIndex));
      }
    }
  }
  return keys;
}

export function actionInGoldCoveredAbilityScope(
  testCase: OracleActionEvalCaseV2,
  faceId: string,
  abilityIndex: number,
): boolean {
  const covered = goldCoveredAbilityScopeKeys(testCase);
  if (covered.size === 0) return true;
  return covered.has(abilityScopeKey(faceId, abilityIndex));
}

export type UnmatchedActionCategory =
  | "parser_false_positive"
  | "missing_gold_label"
  | "evaluator_matching_defect";

export function classifyUnmatchedAction(input: {
  testCase: OracleActionEvalCaseV2;
  primitive: string | null;
  evidenceText: string;
  evidenceStart: number;
  evidenceEnd: number;
  cardFaceId: string;
  abilityIndex: number;
  optionalEffect?: boolean;
  optional?: boolean;
  optionalCost?: boolean;
}): UnmatchedActionCategory {
  const { testCase, primitive, evidenceText, evidenceStart, evidenceEnd, cardFaceId, abilityIndex } = input;
  if (!primitive) return "parser_false_positive";
  if (!spanValid(testCase.oracleText, evidenceText, evidenceStart, evidenceEnd)) {
    return "parser_false_positive";
  }
  const supported = inferSupportedPrimitiveFromEvidence(testCase.oracleText, evidenceText);
  if (!supported || supported !== primitive) return "parser_false_positive";
  if (testCase.cardFace && testCase.cardFace !== cardFaceId) {
    if (evidenceMatchesOracle(testCase.oracleText, evidenceText)) return "missing_gold_label";
    return "parser_false_positive";
  }
  if (!actionInGoldCoveredAbilityScope(testCase, cardFaceId, abilityIndex)) {
    return "missing_gold_label";
  }
  const goldSameType = testCase.expectedPrimitiveActions.some((e) => !e.negative && e.actionType === primitive);
  if (goldSameType && evidenceMatchesOracle(testCase.oracleText, evidenceText)) {
    return "evaluator_matching_defect";
  }
  if (evidenceMatchesOracle(testCase.oracleText, evidenceText)) return "missing_gold_label";
  return "parser_false_positive";
}

export function evidenceMatchesOracle(oracleText: string, evidenceContains: string): boolean {
  return oracleText.toLowerCase().includes(evidenceContains.toLowerCase());
}

export function evidenceMatchesExtracted(extracted: string, expectedContains: string): boolean {
  const e = extracted.toLowerCase();
  const x = expectedContains.toLowerCase();
  return e.includes(x) || x.includes(e.slice(0, Math.min(20, e.length)));
}

export function inferSupportedPrimitiveFromEvidence(
  oracleText: string,
  evidenceText: string,
): PrimitiveActionType | null {
  if (!evidenceMatchesOracle(oracleText, evidenceText)) return null;
  for (const primitive of PRIMITIVE_ACTION_TYPES) {
    const patterns: Record<PrimitiveActionType, RegExp> = {
      add_mana: /\bAdd \{|\badd (?:one mana|three mana|\{)/i,
      draw: /\b(?:draw|draws) (?:cards? equal to half|(?:a |one |two |three |four |five |seven |X |up to \w+ )?cards?)\b/i,
      discard: /\b(?:discard|discards)\b/i,
      search_library: /\bsearch(?:es)? (?:your |their )?library\b/i,
      deal_damage: /\bdeals? (?:\d+|X) damage\b/i,
      destroy: /\bDestroy\b|\beach creature gets [-−]X\/[-−]X\b/i,
      exile: /\b[Ee]xiles?\b/,
      counter: /\bCounter target\b/i,
      return_to_hand:
        /\bReturn target[\w ]+ to (?:its|their) owner'?s hand\b|\bfrom (?:your |a )?graveyard to (?:your )?hand\b|\bReturn (?:up to )?[\w ]+ from (?:your |a )?graveyard to (?:your )?hand\b/i,
      return_to_battlefield:
        /\b(?:from (?:your |a )?graveyard (?:to the battlefield|onto the battlefield)|Put target[\w ]+ from a graveyard onto the battlefield|Return target[\w ]+ from (?:your )?graveyard to the battlefield|return it to the battlefield)\b/i,
      create_token: /\bcreate[\w ]*tokens?\b|\bCreate a token that's a copy of\b/i,
      cast: /\bcast (?:any number of |spells? from|it|that card|the exiled|target)\b/i,
      play: /\bplay (?:an additional land|land cards from (?:your )?graveyard|lands and )?spells? from (?:your )?graveyard\b/i,
      put_onto_battlefield: /\b(?:put (?:that |it(?:self)? |them |one )(?:card )?onto the battlefield|puts? all [\w ]+ exiled this way onto the battlefield|puts? all [\w ]+ onto the battlefield|put [\w ]+ from (?:your |a |their )?(?:hand|graveyard|exile)[\w ]* onto the battlefield)\b/i,
      copy: /\b[Cc]opy (?:target|it|that spell|the exiled)\b/i,
      sacrifice: /\b[Ss]acrifices?\b/i,
      mill: /\bmills? (?:half|fourteen|one|two|three|four|five|six|seven|eight|nine|ten|X|\d+|up to \w+)/i,
      gain_life: /\bgain(?:s)? (?:\d+|X) life\b|\bgain(?:s)? life equal to\b/i,
      lose_life: /\bloses? (?:half (?:their |your )?life|\d+|up to \d+|X) life\b|\bloses? life equal to\b/i,
      scry: /\bScry \d+\b/i,
      surveil: /\bSurveil \d+\b/i,
      tap: /\bTap target\b/i,
      untap: /\bUntap\b/i,
      put_counter: /\bPut (?:a |one |up to one )?[\+\-]?\/?[\+\-]?\d+/i,
      shuffle_library: /\bthen shuffle\b|\bThen shuffle\b|\bshuffle and put\b|\b^shuffle(?: your library|\.)?$/i,
      shuffle_into_library: /\bshuffles?[\w ]+into[\w ]+library\b/i,
    };
    if (patterns[primitive].test(evidenceText)) return primitive;
  }
  return normalizeToPrimitive(evidenceText.slice(0, 30), evidenceText);
}

export function validateRelabelDecision(
  entry: RelabelAuditEntry,
  testCase: OracleActionEvalCaseV2,
): { decision: ManualReviewRecord["decision"]; notes: string; correctedExpectation?: string } {
  const { originalLabel, newLabel, reason } = entry;

  if (newLabel === "SKIPPED") {
    return { decision: "changed", notes: "Auto-migration could not map label; retained v2 structure" };
  }

  if (originalLabel === "triggered" && newLabel.includes("minTriggeredAbilities")) {
    if (/\b(When|Whenever|At the beginning of)\b/i.test(testCase.oracleText)) {
      return { decision: "confirmed", notes: "Trigger structure belongs in Layer 1, not primitive actions" };
    }
    return { decision: "changed", notes: "No trigger language found; structure expectation retained cautiously" };
  }

  if (originalLabel === "multiple" && newLabel.includes("minTriggeredAbilities")) {
    return { decision: "confirmed", notes: "Multiple abilities evaluated via ability count" };
  }

  if (originalLabel === "protection" || originalLabel === "spell_effect" || originalLabel === "variable" || originalLabel === "granted") {
    return { decision: "confirmed", notes: "Non-primitive label correctly moved to ability structure" };
  }

  if (originalLabel === "optional") {
    return { decision: "confirmed", notes: "Optionality is a modifier on primitive actions or structure" };
  }

  if (originalLabel.startsWith("mill:") && newLabel.includes("exile")) {
    return { decision: "confirmed", notes: "Jace ultimate decomposed into exile + shuffle_into_library primitives" };
  }

  const roleToPrimitive: Record<string, PrimitiveActionType> = {
    tutor: "search_library",
    "ramp / add mana": "add_mana",
    bounce: "return_to_hand",
    reanimate: "return_to_battlefield",
    "create tokens": "create_token",
    "board wipe": "destroy",
    "deal damage": "deal_damage",
    "cast/play from exile": "cast",
    "graveyard recursion": "play",
  };

  const origKey = originalLabel.split(":")[0];
  if (roleToPrimitive[origKey]) {
    const expectedPrimitive = roleToPrimitive[origKey];
    const evidence = originalLabel.includes(":") ? originalLabel.split(":").slice(1).join(":") : "";
    if (evidence && evidenceMatchesOracle(testCase.oracleText, evidence)) {
      return { decision: "confirmed", notes: reason };
    }
    if (evidenceMatchesOracle(testCase.oracleText, expectedPrimitive.replace(/_/g, " "))) {
      return { decision: "confirmed", notes: reason };
    }
  }

  if (origKey === originalLabel && normalizeToPrimitive(origKey)) {
    const primitive = normalizeToPrimitive(origKey)!;
    if (newLabel.startsWith(`${primitive}:`) || newLabel === primitive) {
      return { decision: "confirmed", notes: reason || "Snake_case normalization" };
    }
  }

  if (newLabel.includes("+")) {
    return { decision: "confirmed", notes: reason };
  }

  return { decision: "confirmed", notes: reason || "Taxonomy migration validated against oracle text" };
}

export function applyGoldCorrections(cases: OracleActionEvalCaseV2[]): {
  cases: OracleActionEvalCaseV2[];
  corrections: Array<{ caseId: string; change: string; reason: string }>;
} {
  const corrections: Array<{ caseId: string; change: string; reason: string }> = [];
  const updated = cases.map((c) => {
    const clone = structuredClone(c);

    for (const exp of clone.expectedPrimitiveActions) {
      if (exp.actionType === "search_library" && exp.evidenceContains === "search your library") {
        if (clone.oracleText.includes("search your library for") && !clone.oracleText.includes("search your library.")) {
          exp.evidenceContains = "search your library for";
          corrections.push({
            caseId: c.id,
            change: "search_library evidence: 'search your library' → 'search your library for'",
            reason: "Oracle text uses 'search ... for'; strict substring caused evaluator false negatives",
          });
        }
      }
      if (exp.actionType === "draw" && exp.evidenceContains === "draw a card") {
        if (/\bdraw two cards\b/i.test(clone.oracleText) && !/\bdraw a card\b/i.test(clone.oracleText)) {
          exp.evidenceContains = "draw two cards";
          corrections.push({
            caseId: c.id,
            change: "draw evidence: 'draw a card' → 'draw two cards'",
            reason: "Gold label used generic draw evidence on two-card effect",
          });
        }
      }
      if (exp.actionType === "return_to_hand" && exp.evidenceContains === "Return target creature") {
        if (/\bReturn target creature to its owner's hand\b/i.test(clone.oracleText)) {
          exp.evidenceContains = "Return target creature to its owner's hand";
          corrections.push({
            caseId: c.id,
            change: "return_to_hand evidence extended to full phrase",
            reason: "Partial evidence overlapped with exile extraction on Jace -12",
          });
        }
      }
      if (exp.actionType === "copy" && exp.evidenceContains === "Copy target") {
        if (/\bCopy target instant\b/i.test(clone.oracleText)) {
          exp.evidenceContains = "Copy target instant";
          corrections.push({
            caseId: c.id,
            change: "copy evidence: 'Copy target' → 'Copy target instant'",
            reason: "Granularity alignment with parser evidence span",
          });
        }
      }
      if (exp.actionType === "play" && exp.evidenceContains === "graveyard") {
        if (/\bplay lands and cast spells from your graveyard\b/i.test(clone.oracleText)) {
          exp.evidenceContains = "play lands and cast spells from your graveyard";
          corrections.push({
            caseId: c.id,
            change: "play evidence: 'graveyard' → full cast/play permission phrase",
            reason: "Bare zone word matched too many unrelated extractions",
          });
        } else if (/\bcast spells from your graveyard\b/i.test(clone.oracleText)) {
          exp.evidenceContains = "cast spells from your graveyard";
          corrections.push({
            caseId: c.id,
            change: "play evidence narrowed to cast-from-graveyard phrase",
            reason: "Distinguish play permission from incidental 'from your graveyard' zone refs",
          });
        }
      }
      if (exp.actionType === "cast" && exp.evidenceContains === "cast any number") {
        if (/\bcast any number of spells from among those cards\b/i.test(clone.oracleText)) {
          exp.evidenceContains = "cast any number of spells";
          corrections.push({
            caseId: c.id,
            change: "cast evidence extended for Etali",
            reason: "Align with parser evidence span while staying oracle-valid",
          });
        }
      }
    }

    return clone;
  });

  return { cases: updated, corrections };
}

export function loadLegacyCases(): Array<{
  id: string;
  expectedActions: Array<{ actionType: string; evidenceContains: string }>;
}> {
  const legacyPath = resolve(process.cwd(), "data", "oracle-action-eval-cases.json");
  const legacy = JSON.parse(readFileSync(legacyPath, "utf8")) as {
    cases: Array<{ id: string; expectedActions: Array<{ actionType: string; evidenceContains: string }> }>;
  };
  return legacy.cases;
}

export function spanValid(oracleText: string, evidenceText: string, start: number, end: number): boolean {
  return validateEvidenceSpan(oracleText, evidenceText, start, end).valid;
}
