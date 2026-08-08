/**
 * Generic action-argument and field-level provenance extraction from ability/option text.
 */
import type { PrimitiveActionType } from "./oracle-action-taxonomy";
import { parseVariableQuantityFields } from "./oracle-variable-quantity";
import type {
  EvidenceSpan,
  SemanticActionArguments,
  SemanticActionProvenance,
} from "./oracle-semantic-parse-schema";

function spanInText(text: string, textCardStart: number, pattern: RegExp): EvidenceSpan | undefined {
  const m = text.match(pattern);
  if (!m || m.index === undefined) return undefined;
  const matched = m[0];
  return {
    text: matched,
    cardStart: textCardStart + m.index,
    cardEnd: textCardStart + m.index + matched.length,
  };
}

function spanContainedIn(outer: EvidenceSpan, inner: EvidenceSpan): boolean {
  return inner.cardStart >= outer.cardStart && inner.cardEnd <= outer.cardEnd;
}

/** Prefer action-local spans; fall back to container only when contained in action span. */
function spanForField(input: {
  actionEvidence: EvidenceSpan;
  containerText: string;
  containerCardStart: number;
  pattern: RegExp;
}): EvidenceSpan | undefined {
  const inAction = spanInText(input.actionEvidence.text, input.actionEvidence.cardStart, input.pattern);
  if (inAction) return inAction;
  const inContainer = spanInText(input.containerText, input.containerCardStart, input.pattern);
  if (inContainer && spanContainedIn(input.actionEvidence, inContainer)) return inContainer;
  return undefined;
}

const PLAYER_TARGET_PATTERNS: Array<{
  pattern: RegExp;
  affectedPlayer: SemanticActionArguments["affectedPlayer"];
}> = [
  { pattern: /\bTarget opponent\b/i, affectedPlayer: "target_opponent" },
  { pattern: /\bTarget player\b/i, affectedPlayer: "target_player" },
  { pattern: /\bEach player\b/i, affectedPlayer: "each_player" },
  { pattern: /\bEach opponent\b/i, affectedPlayer: "each_opponent" },
  { pattern: /\beach opponent\b/i, affectedPlayer: "each_opponent" },
];

function extractPlayerTarget(input: {
  actionType: PrimitiveActionType;
  actionEvidence: EvidenceSpan;
  containerText: string;
  containerCardStart: number;
}): { affectedPlayer?: SemanticActionArguments["affectedPlayer"]; targetSpan?: EvidenceSpan } {
  const playerActionTypes = new Set<PrimitiveActionType>([
    "lose_life",
    "gain_life",
    "deal_damage",
    "mill",
    "discard",
    "sacrifice",
    "draw",
    "search_library",
  ]);
  if (!playerActionTypes.has(input.actionType)) {
    return {};
  }
  for (const { pattern, affectedPlayer } of PLAYER_TARGET_PATTERNS) {
    const targetSpan = spanForField({
      actionEvidence: input.actionEvidence,
      containerText: input.containerText,
      containerCardStart: input.containerCardStart,
      pattern,
    });
    if (targetSpan) return { affectedPlayer, targetSpan };
  }
  return {};
}

export function extractActionArguments(input: {
  actionType: PrimitiveActionType;
  actionEvidence: EvidenceSpan;
  containerText: string;
  containerCardStart: number;
}): { arguments: SemanticActionArguments; provenance: SemanticActionProvenance } {
  const { actionType, actionEvidence, containerText, containerCardStart } = input;
  const provenance: SemanticActionProvenance = { actionSpan: actionEvidence };
  const args: SemanticActionArguments = {};

  const playerTarget = extractPlayerTarget(input);
  if (playerTarget.affectedPlayer) args.affectedPlayer = playerTarget.affectedPlayer;
  if (playerTarget.targetSpan) provenance.targetSpan = playerTarget.targetSpan;

  const roundingSpan = spanForField({
    actionEvidence,
    containerText,
    containerCardStart,
    pattern: /\b(?:rounded up|Round up each time)\b/i,
  });
  if (roundingSpan) provenance.roundingSpan = roundingSpan;

  const qtyFields = parseVariableQuantityFields(actionType, actionEvidence.text, containerText);
  const quantitySpan = findQuantitySpan(actionType, actionEvidence, containerText, containerCardStart);
  if (qtyFields.quantityType || quantitySpan) {
    args.quantity = {
      ...qtyFields,
      evidence: quantitySpan,
      roundingEvidence: roundingSpan,
      quantityRounding:
        roundingSpan || /\b(?:rounded up|Round up each time)\b/i.test(containerText)
          ? "up"
          : qtyFields.quantityRounding ?? "none",
    };
    if (quantitySpan) provenance.quantitySpan = quantitySpan;
  }

  if (actionType === "lose_life" && args.quantity?.quantityExpression?.includes("half")) {
    args.quantity.quantityBase =
      args.affectedPlayer === "target_opponent" ? "affected_player.life_total" : "their life total";
  }

  if (actionType === "sacrifice") {
    args.object = {
      type: "creature",
      controller: args.affectedPlayer === "target_opponent" ? "affected_player" : "their_controller",
      evidence: spanForField({
        actionEvidence,
        containerText,
        containerCardStart,
        pattern: /\b(?:creatures|permanents|lands) they control\b/i,
      }),
    };
    if (/\bof their choice\b/i.test(actionEvidence.text)) {
      args.choice = {
        chooser: "affected_player",
        evidence: spanForField({
          actionEvidence,
          containerText,
          containerCardStart,
          pattern: /\bof their choice\b/i,
        }),
      };
    }
  }

  if (actionType === "discard") {
    args.object = {
      zone: "hand",
      controller: args.affectedPlayer === "target_opponent" ? "affected_player" : "their_controller",
      evidence: spanForField({
        actionEvidence,
        containerText,
        containerCardStart,
        pattern: /\b(?:cards in their hand|their hand|cards in your hand|your hand)\b/i,
      }),
    };
  }

  if (actionType === "return_to_hand") {
    args.destinationZone = ["hand"];
    args.sourceZone = /\bfrom (?:your )?graveyard\b/i.test(actionEvidence.text) ? ["graveyard"] : ["battlefield"];
    const objectEvidence = spanForField({
      actionEvidence,
      containerText,
      containerCardStart,
      pattern: /\b(?:target permanent|those creatures|those permanents|Return it|Return each [\w ]+|target [\w ]+)/i,
    });
    args.object = {
      type: /\bthose creatures\b/i.test(actionEvidence.text)
        ? "creature"
        : /\bpermanent\b/i.test(actionEvidence.text)
          ? "permanent"
          : /\bit\b/i.test(actionEvidence.text)
            ? "referent"
            : "permanent",
      zone: args.sourceZone[0],
      controller: /\byou control\b/i.test(actionEvidence.text)
        ? "you"
        : /\byou don't control\b/i.test(actionEvidence.text)
          ? "opponent"
          : "their_controller",
      evidence: objectEvidence,
    };
    if (objectEvidence) provenance.objectSpan = objectEvidence;
    if (/\bthose\b/i.test(actionEvidence.text)) {
      args.referentObjectId = undefined;
    }
  }

  if (actionType === "counter") {
    args.object = { type: "spell_or_ability", zone: "stack" };
    if (/\bopponents control\b/i.test(containerText)) {
      args.affectedController = "opponent";
    }
    const unlessPay = spanForField({
      actionEvidence,
      containerText,
      containerCardStart,
      pattern: /\bunless (?:its|their) controller pays (\{[^}]+\})/i,
    });
    if (unlessPay) {
      const payMatch = unlessPay.text.match(/\{([^}]+)\}/);
      args.condition = {
        type: "unless",
        payment: payMatch ? `{${payMatch[1]}}` : undefined,
        evidence: unlessPay,
      };
    }
  }

  if (actionType === "exile" && /\bfrom their hand\b/i.test(actionEvidence.text)) {
    args.object = { type: "card", zone: "hand", controller: "target_player" };
    args.affectedPlayer = "target_player";
    const targetSpan = spanForField({
      actionEvidence,
      containerText,
      containerCardStart,
      pattern: /\bTarget player\b/i,
    });
    if (targetSpan) provenance.targetSpan = targetSpan;
  }

  return { arguments: args, provenance };
}

function findQuantitySpan(
  actionType: PrimitiveActionType,
  actionEvidence: EvidenceSpan,
  containerText: string,
  containerCardStart: number,
): EvidenceSpan | undefined {
  const patterns: Partial<Record<PrimitiveActionType, RegExp>> = {
    sacrifice: /\bhalf the creatures they control\b|\ba third of the creatures they control\b/i,
    discard: /\bhalf the cards in their hand\b|\ba third of the cards in their hand\b/i,
    lose_life: /\bhalf their life\b|\ba third of their life\b/i,
    mill: /\bhalf (?:their )?library\b/i,
  };
  const p = patterns[actionType];
  if (p) {
    const s = spanForField({ actionEvidence, containerText, containerCardStart, pattern: p });
    if (s) return s;
  }
  if (/\bhalf\b/i.test(actionEvidence.text)) {
    return spanForField({ actionEvidence, containerText, containerCardStart, pattern: /\bhalf [^.]+/i });
  }
  if (/\ba third of\b/i.test(actionEvidence.text)) {
    return spanForField({ actionEvidence, containerText, containerCardStart, pattern: /\ba third of [^.]+/i });
  }
  return undefined;
}

export function toEvidenceSpan(text: string, cardStart: number, cardEnd: number): EvidenceSpan {
  return { text, cardStart, cardEnd };
}

export function parseSpreeChoose(headerText: string): { minimum: number; maximum: number | "all" } {
  if (/Choose one or more/i.test(headerText)) return { minimum: 1, maximum: "all" };
  if (/Choose two/i.test(headerText)) return { minimum: 2, maximum: 2 };
  if (/Choose three/i.test(headerText)) return { minimum: 3, maximum: 3 };
  if (/Choose one/i.test(headerText)) return { minimum: 1, maximum: 1 };
  return { minimum: 1, maximum: 1 };
}

export function parseAdditionalCostFromLine(lineText: string, cardStart: number): {
  mana: string[];
  rawText: string;
  evidence: EvidenceSpan;
} | undefined {
  const m = lineText.match(/^(\+(?:\s*\{[^}]+\})+)\s*—/);
  if (!m) return undefined;
  const rawText = m[1].trim();
  const mana = [...rawText.matchAll(/\{([^}]+)\}/g)].map((x) => x[1]);
  return {
    mana,
    rawText,
    evidence: toEvidenceSpan(rawText, cardStart, cardStart + rawText.length),
  };
}

/** Deterministic optionalEffect from Oracle grammar — not confidence calibration. */
export function inferOptionalEffectFromGrammar(input: {
  abilityParagraph: string;
  actionEvidenceText: string;
  actionEvidenceStart: number;
  abilityParagraphStart: number;
}): boolean {
  const localStart = input.actionEvidenceStart - input.abilityParagraphStart;
  const permissionWindow = input.abilityParagraph.slice(Math.max(0, localStart - 32), localStart);
  if (/\b(?:you|they|that player|its controller|an opponent) may\b/i.test(permissionWindow)) return true;
  if (/\b(?:you|they) may\b/i.test(input.actionEvidenceText)) return true;
  if (/^When .+ enters,/i.test(input.abilityParagraph.trim()) && !/\byou may\b/i.test(input.abilityParagraph)) {
    return false;
  }
  if (/^Whenever .+/i.test(input.abilityParagraph.trim()) && !/\byou may\b/i.test(input.actionEvidenceText)) {
    return false;
  }
  const ifYouDoIdx = input.abilityParagraph.search(/\bIf you do,\s/i);
  if (ifYouDoIdx >= 0 && localStart > ifYouDoIdx) return true;
  return false;
}
