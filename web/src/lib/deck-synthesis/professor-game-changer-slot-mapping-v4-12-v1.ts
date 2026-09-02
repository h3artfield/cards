/**
 * Game Changer slot mapping v4.12 — every GC candidate must map to a drag slot or be rejected.
 */
import type { BracketDragSlotV412 } from "./professor-bracket-drag-slot-v4-12-v1";
import type { GameChangerEvaluationV411 } from "./professor-game-changer-discovery-v4-11-v1";

export const PROFESSOR_GAME_CHANGER_SLOT_MAPPING_V4_12_V1_VERSION = "professor-game-changer-slot-mapping-v4-12-v1";

export type GameChangerSlotProposalV412 = GameChangerEvaluationV411 & {
  needSolved: string;
  charterFit: boolean;
  currentCardToReplace: string | null;
  bracketContribution: number;
  reasonToReject: string | null;
};

function slotMatchesGc(slot: BracketDragSlotV412, gcRole: string): boolean {
  const desired = slot.desiredReplacementRole.join(" ").toLowerCase();
  const deficits = slot.bracketDeficitAddressed.join(" ").toLowerCase();
  const role = gcRole.toLowerCase();
  if (/game changer|gc/i.test(desired) || /game_changer/i.test(deficits)) return true;
  if (/finisher|win|engine/i.test(desired) && /finisher|token|sacrifice|engine/i.test(role)) return true;
  if (/acceler|ramp/i.test(desired) && /ramp|acceler/i.test(role)) return true;
  return false;
}

export function mapGameChangersToDragSlotsV412(args: {
  gameChangers: GameChangerEvaluationV411[];
  dragSlots: BracketDragSlotV412[];
  charterPrimaryStrategy?: string;
}): GameChangerSlotProposalV412[] {
  const usedSlots = new Set<string>();

  return args.gameChangers.map((gc) => {
    const charterFit = args.charterPrimaryStrategy
      ? gc.reasonRelevant.toLowerCase().includes(args.charterPrimaryStrategy.toLowerCase().slice(0, 8)) ||
        gc.role.toLowerCase().includes("sacrifice") ||
        gc.role.toLowerCase().includes("token")
      : gc.bracketPowerContribution >= 3;

    let currentCardToReplace: string | null = null;
    for (const slot of args.dragSlots) {
      if (usedSlots.has(slot.dragSlotId)) continue;
      if (slotMatchesGc(slot, gc.role)) {
        currentCardToReplace = slot.cardName;
        usedSlots.add(slot.dragSlotId);
        break;
      }
    }

    const needSolved = gc.deckNeedSatisfied ?? "BRACKET_POWER";
    let reasonToReject = gc.rejectionReason;
    if (!reasonToReject && !currentCardToReplace && gc.selected) {
      reasonToReject = "GC without clear drag slot — does not enter deck";
    }

    return {
      ...gc,
      needSolved,
      charterFit,
      currentCardToReplace,
      bracketContribution: gc.bracketPowerContribution,
      reasonToReject,
      selected: gc.selected && !!currentCardToReplace && !reasonToReject,
    };
  });
}
