/**
 * Readable names for the derived functional roles.
 *
 * Deliberately free of imports: the editor UI needs these labels in the
 * browser, while the module that reads the role data is server-only because it
 * touches the filesystem. Keeping the vocabulary separate from the loader is
 * what lets both sides use one spelling of "Blink & flicker".
 */
export const DERIVED_ROLE_LABELS_V1: Record<string, string> = {
  removal: "Removal",
  board_interaction: "Board interaction",
  card_draw: "Card draw",
  card_advantage: "Card advantage",
  ramp: "Ramp",
  mana_generation: "Mana sources",
  mana_base: "Mana base",
  recursion: "Recursion",
  reanimation: "Reanimation",
  token_generation: "Token generation",
  sacrifice_outlet: "Sacrifice outlet",
  sacrifice_payoff: "Sacrifice payoff",
  blink_flicker: "Blink & flicker",
  graveyard_setup: "Graveyard setup",
  cast_from_exile: "Cast from exile",
  spell_copying: "Spell copying",
  countermagic: "Countermagic",
  counter_synergy: "Counter synergy",
  combat_manipulation: "Combat manipulation",
  life_gain: "Life gain",
  life_loss: "Life loss",
  mill: "Mill",
  tutor: "Tutor",
  protection: "Protection",
  board_wipe: "Board wipe",
  cost_reduction: "Cost reduction",
  copy_effects: "Copy effects",
  combat_payoff: "Combat payoff",
};

function humanizeV1(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/^\w/, (character) => character.toUpperCase());
}

export function derivedRoleLabelV1(role: string): string {
  return DERIVED_ROLE_LABELS_V1[role] ?? humanizeV1(role);
}

/**
 * Ramp and mana sources often tag the same cards today, so a short readout
 * that shows both looks like a duplicate column. Prefer Ramp — the Commander
 * term for going ahead of curve — and keep mana sources for the full list.
 */
const HEADLINE_ROLE_REDUNDANCY_V1: ReadonlyArray<readonly [string, string]> = [
  ["ramp", "mana sources"],
  ["ramp", "mana generation"],
];

const ROLE_HINTS_V1: Record<string, string> = {
  ramp: "Mana ahead of one land per turn — rocks, rituals, extra lands.",
  "mana base": "Tap-for-one lands that fix and fuel the deck.",
  "mana sources": "Cards that produce mana. Ramp is the tighter count.",
  "card advantage": "Ways to pull ahead on cards after the first draw.",
  "card draw": "Spells and engines that put extra cards in hand.",
  removal: "Spot answers for creatures and other permanents.",
  "board interaction": "Fighting over the battlefield, not just one target.",
  "board wipe": "Reset the board when it gets away from you.",
  countermagic: "Answers that stop a spell on the stack.",
  protection: "Keep your commander and engines alive.",
  tutor: "Find a specific card when the plan needs it.",
  recursion: "Get something back after it is gone.",
  reanimation: "Put creatures into play from a graveyard.",
  "token generation": "Make extra bodies for attacks, blocks, or fodder.",
  "sacrifice outlet": "A repeatable way to spend creatures or artifacts.",
  "sacrifice payoff": "Cards that get better when something dies.",
  mill: "Put cards from a library into a graveyard.",
};

export function derivedRoleHintV1(label: string): string {
  const key = label.trim().toLowerCase();
  return ROLE_HINTS_V1[key] ?? `How many cards in the list do this job.`;
}

export function pickDistinctRoleHeadlinesV1<T>(
  items: readonly T[],
  labelOf: (item: T) => string,
  limit: number,
): T[] {
  const labels = items.map((item) => labelOf(item).trim().toLowerCase());
  const skip = new Set<string>();
  for (const [keep, drop] of HEADLINE_ROLE_REDUNDANCY_V1) {
    if (labels.includes(keep)) skip.add(drop);
  }

  const picked: T[] = [];
  for (const item of items) {
    if (skip.has(labelOf(item).trim().toLowerCase())) continue;
    picked.push(item);
    if (picked.length >= limit) break;
  }
  return picked;
}

/** Oracle action identifiers are snake_case primitives from the text parse. */
export function oracleActionLabelV1(action: string): string {
  return humanizeV1(action);
}
