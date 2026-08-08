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

function spanInContainer(
  containerText: string,
  containerCardStart: number,
  pattern: RegExp,
): EvidenceSpan | undefined {
  const m = containerText.match(pattern);
  if (!m || m.index === undefined) return undefined;
  const text = m[0];
  const localStart = m.index;
  return {
    text,
    cardStart: containerCardStart + localStart,
    cardEnd: containerCardStart + localStart + text.length,
  };
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

  const targetOpponent = spanInContainer(containerText, containerCardStart, /\bTarget opponent\b/i);
  if (targetOpponent) {
    args.affectedPlayer = "target_opponent";
    provenance.targetSpan = targetOpponent;
  } else if (/\bEach player\b/i.test(containerText)) {
    args.affectedPlayer = "each_player";
    provenance.targetSpan = spanInContainer(containerText, containerCardStart, /\bEach player\b/i);
  } else if (/\bEach opponent\b/i.test(containerText)) {
    args.affectedPlayer = "each_opponent";
    provenance.targetSpan = spanInContainer(containerText, containerCardStart, /\bEach opponent\b/i);
  }

  const roundingSpan = spanInContainer(containerText, containerCardStart, /\brounded up\b/i);
  if (roundingSpan) provenance.roundingSpan = roundingSpan;

  const qtyFields = parseVariableQuantityFields(actionType, actionEvidence.text, containerText);
  const quantitySpan = findQuantitySpan(actionType, containerText, containerCardStart, actionEvidence.text);
  if (qtyFields.quantityType || quantitySpan) {
    args.quantity = {
      ...qtyFields,
      evidence: quantitySpan,
      roundingEvidence: roundingSpan,
      quantityRounding:
        roundingSpan || /\brounded up\b/i.test(containerText)
          ? "up"
          : qtyFields.quantityRounding ?? "none",
    };
    if (quantitySpan) provenance.quantitySpan = quantitySpan;
  }

  if (actionType === "lose_life" && args.quantity?.quantityExpression?.includes("half")) {
    args.quantity.quantityBase = args.affectedPlayer === "target_opponent" ? "affected_player.life_total" : "their life total";
  }

  if (actionType === "sacrifice") {
    args.object = {
      type: "creature",
      controller: args.affectedPlayer === "target_opponent" ? "affected_player" : "their_controller",
      evidence: spanInContainer(containerText, containerCardStart, /\b(?:creatures|permanents|lands) they control\b/i),
    };
    if (/\bof their choice\b/i.test(containerText)) {
      args.choice = {
        chooser: "affected_player",
        evidence: spanInContainer(containerText, containerCardStart, /\bof their choice\b/i),
      };
    }
  }

  if (actionType === "discard") {
    args.object = {
      zone: "hand",
      controller: args.affectedPlayer === "target_opponent" ? "affected_player" : "their_controller",
      evidence: spanInContainer(containerText, containerCardStart, /\b(?:cards in their hand|their hand)\b/i),
    };
  }

  if (actionType === "return_to_hand") {
    args.destinationZone = ["hand"];
    args.sourceZone = ["battlefield"];
  }

  if (actionType === "counter") {
    args.object = { type: "spell_or_ability", zone: "stack" };
  }

  return { arguments: args, provenance };
}

function findQuantitySpan(
  actionType: PrimitiveActionType,
  containerText: string,
  containerCardStart: number,
  actionEvidenceText: string,
): EvidenceSpan | undefined {
  const patterns: Partial<Record<PrimitiveActionType, RegExp>> = {
    sacrifice: /\bhalf the creatures they control\b/i,
    discard: /\bhalf the cards in their hand\b/i,
    lose_life: /\bhalf their life\b/i,
    mill: /\bhalf (?:their )?library\b/i,
  };
  const p = patterns[actionType];
  if (p) {
    const s = spanInContainer(containerText, containerCardStart, p);
    if (s) return s;
  }
  if (/\bhalf\b/i.test(actionEvidenceText)) {
    return spanInContainer(containerText, containerCardStart, /\bhalf [^.]+/i);
  }
  if (/\ba third of\b/i.test(actionEvidenceText)) {
    return spanInContainer(containerText, containerCardStart, /\ba third of [^.]+/i);
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
