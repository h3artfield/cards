/**
 * Professor v4.16.3 — hard structural slot budget (lands may not fill missing nonland capacity).
 */
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";
import type { ManaPlanV416 } from "./professor-mana-plan-v4-16-v1";
import { COMMANDER_DECK_LIBRARY_SIZE_V47 } from "./professor-deck-completion-v4-7-v1";

export const PROFESSOR_DECK_SLOT_BUDGET_V4_16_3_V1_VERSION = "professor-deck-slot-budget-v4-16-3-v1";

export type DeckSlotBudgetStatusV4163 = "OK" | "BUILD_STRUCTURALLY_INCOMPLETE" | "LAND_SLOT_OVERSUBSCRIBED";

export type DeckSlotBudgetV4163 = {
  version: typeof PROFESSOR_DECK_SLOT_BUDGET_V4_16_3_V1_VERSION;
  expectedLands: number;
  selectedLands: number;
  expectedNonlands: number;
  selectedNonlands: number;
  remainingLandSlots: number;
  remainingNonlandSlots: number;
  structurallyComplete: boolean;
  landOversubscribed: boolean;
  status: DeckSlotBudgetStatusV4163;
  summary: string;
};

const LAND_TOLERANCE = 2;

export function assessDeckSlotBudgetV4163(args: {
  manaPlan: ManaPlanV416 | null;
  selectedCards: CouncilCardV46[];
}): DeckSlotBudgetV4163 {
  const expectedLands = args.manaPlan?.expectedLandCount ?? 35;
  const expectedNonlands = args.manaPlan?.structuralNonLandTarget ?? COMMANDER_DECK_LIBRARY_SIZE_V47 - expectedLands;
  const selectedLands = args.selectedCards.filter((c) => c.category === "land").length;
  const selectedNonlands = args.selectedCards.length - selectedLands;
  const remainingLandSlots = Math.max(0, expectedLands - selectedLands);
  const remainingNonlandSlots = Math.max(0, expectedNonlands - selectedNonlands);
  const structurallyComplete = selectedNonlands >= expectedNonlands;
  const landOversubscribed = selectedLands > expectedLands + LAND_TOLERANCE;

  let status: DeckSlotBudgetStatusV4163 = "OK";
  if (!structurallyComplete) status = "BUILD_STRUCTURALLY_INCOMPLETE";
  else if (landOversubscribed) status = "LAND_SLOT_OVERSUBSCRIBED";

  const summary =
    status === "BUILD_STRUCTURALLY_INCOMPLETE"
      ? `${selectedNonlands}/${expectedNonlands} nonlands — ${remainingNonlandSlots} structural slots remain; mana base may not pad with lands`
      : landOversubscribed
        ? `${selectedLands}/${expectedLands} lands — utility land pressure; replace worst land slot`
        : `Slot budget OK — ${selectedNonlands} nonlands, ${remainingLandSlots} land slots reserved`;

  return {
    version: PROFESSOR_DECK_SLOT_BUDGET_V4_16_3_V1_VERSION,
    expectedLands,
    selectedLands,
    expectedNonlands,
    selectedNonlands,
    remainingLandSlots,
    remainingNonlandSlots,
    structurallyComplete,
    landOversubscribed,
    status,
    summary,
  };
}

/** Lands mana assembly may add — never fills missing structural nonland capacity. */
export function manaAssemblyLandAllowanceV4163(args: {
  slotBudget: DeckSlotBudgetV4163;
  libraryCount: number;
}): number {
  if (!args.slotBudget.structurallyComplete) return 0;
  const slotsTo99 = Math.max(0, COMMANDER_DECK_LIBRARY_SIZE_V47 - args.libraryCount);
  return Math.min(args.slotBudget.remainingLandSlots, slotsTo99);
}
