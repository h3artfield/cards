/**
 * Parser-blind v137 gold corrections — applied during run-1 measurement closure only.
 */
import type { Layer2ChoiceGroupGold, Layer2GoldEntry } from "./benchmark-identity";

export const GHOSTLY_TOUCH_CHOICE_GROUP_ID = "granted-nested-v137-006:tap-or-untap";

export function ghostlyTouchChoiceGold(): {
  layer2Gold: Layer2GoldEntry[];
  layer2ChoiceGroups: Layer2ChoiceGroupGold[];
} {
  return {
    layer2ChoiceGroups: [
      {
        choiceGroupId: GHOSTLY_TOUCH_CHOICE_GROUP_ID,
        optional: true,
        mutuallyExclusive: true,
        optionalityCueContains: "you may",
        effectClauseContains: "tap or untap target permanent",
      },
    ],
    layer2Gold: [
      {
        actionType: "tap",
        evidenceContains: "tap target permanent",
        optionalEffect: true,
        choiceGroupId: GHOSTLY_TOUCH_CHOICE_GROUP_ID,
        choiceAlternativeIndex: 0,
        targetContains: "target permanent",
      },
      {
        actionType: "untap",
        evidenceContains: "untap target permanent",
        optionalEffect: true,
        choiceGroupId: GHOSTLY_TOUCH_CHOICE_GROUP_ID,
        choiceAlternativeIndex: 1,
        targetContains: "target permanent",
      },
    ],
  };
}

export function sixthSenseDrawGold(): Layer2GoldEntry[] {
  return [
    {
      actionType: "draw",
      evidenceContains: "draw a card",
      optionalEffect: true,
    },
  ];
}

export function applyV137GoldAdjudicationCorrections(
  caseId: string,
  adjudication: { layer2Gold: Layer2GoldEntry[]; layer2ChoiceGroups?: Layer2ChoiceGroupGold[] },
): { layer2Gold: Layer2GoldEntry[]; layer2ChoiceGroups?: Layer2ChoiceGroupGold[]; corrected: boolean; note?: string } {
  if (caseId === "granted-nested-v137-006") {
    const choice = ghostlyTouchChoiceGold();
    return {
      ...choice,
      corrected: true,
      note: "Parser-blind choice re-adjudication: tap/untap are mutually exclusive alternatives under optional you may",
    };
  }
  if (caseId === "granted-nested-v137-005") {
    return {
      layer2Gold: sixthSenseDrawGold(),
      corrected: true,
      note: "Parser-blind optional draw: action evidence is draw a card; optionality cue is you may",
    };
  }
  return { ...adjudication, corrected: false };
}
