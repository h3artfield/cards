import { HELD_OUT_SEEDS } from "./generate-oracle-action-held-out-set";

/** held-0001 … held-0104 case ID → card name (from held-out seed generation order). */
export const HELD_OUT_CARD_NAMES: Record<string, string> = Object.fromEntries(
  HELD_OUT_SEEDS.map((seed, idx) => [`held-${String(idx + 1).padStart(4, "0")}`, seed.name]),
);
