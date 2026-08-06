/** Failure codes for commander Oracle-ID consistency checks (P0). */
export type CommanderConsistencyFailureCode =
  | "requested_commander_unresolved"
  | "commander_oracle_id_changed"
  | "commander_slot_oracle_id_mismatch"
  | "deck_strategy_commander_mismatch"
  | "commander_color_identity_unverified";

export const COMMANDER_CONSISTENCY_FAILURE_MESSAGES: Record<
  CommanderConsistencyFailureCode,
  string
> = {
  requested_commander_unresolved:
    "The requested commander could not be canonically verified (no Oracle ID).",
  commander_oracle_id_changed:
    "The deck commander Oracle ID differs from the locked request identity.",
  commander_slot_oracle_id_mismatch:
    "The commander slot Oracle ID does not match the deck commander Oracle ID.",
  deck_strategy_commander_mismatch:
    "Deck strategy or title references a different commander identity than the locked Oracle ID.",
  commander_color_identity_unverified:
    "Commander color identity could not be verified from the Oracle record.",
};

export function commanderOracleIdRequired(input: {
  commanderOracleId?: string;
  context: string;
}): asserts input is { commanderOracleId: string; context: string } {
  if (!input.commanderOracleId?.trim()) {
    throw new Error(
      `${input.context}: commander Oracle ID is required before proceeding.`,
    );
  }
}

/** Compare Oracle IDs — the only authoritative identity key for commander builds. */
export function commanderOracleIdsMatch(
  a: string | undefined,
  b: string | undefined,
): boolean {
  const na = a?.trim();
  const nb = b?.trim();
  if (!na || !nb) return false;
  return na === nb;
}
