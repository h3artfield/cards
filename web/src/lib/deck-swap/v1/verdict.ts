/**
 * Turns two play rates into a plain reading of what a swap does.
 *
 * Deliberately coarse. Tournament play rate is evidence of consensus, not
 * proof of strength in a particular deck, so three wide buckets say more
 * honestly than a decimal ever could.
 */
export type SwapVerdict = "UPGRADE" | "SIDEGRADE" | "DOWNGRADE" | "UNKNOWN";

/** A card must be played at least this many times as often to count as an upgrade. */
const UPGRADE_LIFT = 2;
const DOWNGRADE_LIFT = 0.5;

export function swapVerdict(args: {
  outgoingRate: number | null;
  incomingRate: number | null;
}): { verdict: SwapVerdict; lift: number | null } {
  const { outgoingRate, incomingRate } = args;
  if (outgoingRate == null || incomingRate == null || outgoingRate <= 0) {
    return { verdict: "UNKNOWN", lift: null };
  }
  const lift = incomingRate / outgoingRate;
  if (lift >= UPGRADE_LIFT) return { verdict: "UPGRADE", lift };
  if (lift <= DOWNGRADE_LIFT) return { verdict: "DOWNGRADE", lift };
  return { verdict: "SIDEGRADE", lift };
}

export function describeVerdict(args: {
  verdict: SwapVerdict;
  lift: number | null;
  incomingRate: number | null;
}): string {
  if (args.verdict === "UNKNOWN" || args.lift == null) {
    return "No tournament play data for one of these cards.";
  }
  const played = args.incomingRate != null ? ` (${(args.incomingRate * 100).toFixed(0)}% of eligible decks)` : "";
  if (args.verdict === "UPGRADE") {
    return `Played ${args.lift.toFixed(1)}x more often by tournament players${played}.`;
  }
  if (args.verdict === "DOWNGRADE") {
    return `Played ${(1 / args.lift).toFixed(1)}x less often by tournament players${played}.`;
  }
  return `Played about as often by tournament players${played}.`;
}
