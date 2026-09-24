import { deleteCustomerSavedDeckV1 } from "../customer-saved-decks/customer-saved-deck-store";
import type { CustomerDeckOriginV1 } from "./deck-list-v1";
import { deleteEditableDeckV1, getEditableDeckV1 } from "./store-v1";

export async function deleteCustomerDeckV1(args: {
  customerId: string;
  deckId: string;
  origin: CustomerDeckOriginV1;
  /** The list row key — for professor builds that were never opened, same as saved-deck id. */
  listKey: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (args.origin === "hand") {
    const result = await deleteEditableDeckV1({
      deckId: args.deckId,
      customerId: args.customerId,
    });
    if (result === "deleted") return { ok: true };
    if (result === "forbidden") return { ok: false, message: "That deck belongs to someone else." };
    return { ok: false, message: "That deck was not found." };
  }

  const editable = await getEditableDeckV1(args.deckId);
  if (editable) {
    if (editable.customerId !== args.customerId) {
      return { ok: false, message: "That deck belongs to someone else." };
    }
    const removed = await deleteEditableDeckV1({
      deckId: args.deckId,
      customerId: args.customerId,
    });
    if (removed !== "deleted") {
      return { ok: false, message: "That deck was not found." };
    }
    if (editable.buildId) {
      await deleteCustomerSavedDeckV1({
        id: `${args.customerId}_${editable.buildId}`,
        customerId: args.customerId,
      });
    }
    return { ok: true };
  }

  const saved = await deleteCustomerSavedDeckV1({
    id: args.listKey,
    customerId: args.customerId,
  });
  if (saved === "deleted") return { ok: true };
  if (saved === "forbidden") return { ok: false, message: "That deck belongs to someone else." };
  return { ok: false, message: "That deck was not found." };
}
