/** Why a suspect received a candidate market snapshot at ingest. */
export type MarketSnapshotReason =
  | "top_score"
  | "inspector_favored"
  | "variant_trap"
  | "staff_visible"
  | "staff_confirmed_selected";
