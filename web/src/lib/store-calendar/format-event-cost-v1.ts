/** How entry cost reads on the public calendar. */
export function formatEventCostV1(cost: number | null | undefined): string | null {
  if (cost == null) return null;
  if (cost === 0) return "Free";
  return cost % 1 === 0 ? `$${cost}` : `$${cost.toFixed(2)}`;
}
