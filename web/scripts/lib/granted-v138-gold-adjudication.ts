/**
 * Parser-blind v138 gold corrections — applied during transfer measurement closure.
 */
import type { Layer2GoldEntry } from "./benchmark-identity";

export function snakeUmbraDrawGold(): Layer2GoldEntry[] {
  return [
    {
      actionType: "draw",
      evidenceContains: "draw a card",
      optionalEffect: true,
    },
  ];
}

export function applyV138GoldAdjudicationCorrections(
  caseId: string,
  adjudication: { layer2Gold: Layer2GoldEntry[] },
): { layer2Gold: Layer2GoldEntry[]; corrected: boolean; note?: string } {
  if (caseId === "granted-nested-v138-007") {
    return {
      layer2Gold: snakeUmbraDrawGold(),
      corrected: true,
      note: "Parser-blind optional draw: action evidence is draw a card; optionality cue is you may (Sixth Sense pattern)",
    };
  }
  return { ...adjudication, corrected: false };
}
