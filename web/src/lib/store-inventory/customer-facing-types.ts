/** Customer-facing card references require a canonical Oracle ID. */
export interface CustomerFacingCardReference {
  oracleId: string;
  canonicalName: string;
  displayPrintingId?: string;
  inventoryListingId?: string;
}

export type DeckSlotReference =
  | (CustomerFacingCardReference & {
      type?: "card";
      qty: number;
    })
  | {
      type: "unfilled_role";
      role: string;
      quantityMissing: number;
    };

export function isUnfilledRole(
  slot: DeckSlotReference,
): slot is Extract<DeckSlotReference, { type: "unfilled_role" }> {
  return slot.type === "unfilled_role";
}
