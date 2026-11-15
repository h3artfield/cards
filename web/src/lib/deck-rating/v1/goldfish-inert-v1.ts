/**
 * goldfishInert — cards that do nothing to a solo clock.
 * Coverage excludes them from numerator and denominator.
 * Versioned reviewed artifact: fit/goldfish-inert-v1.json
 */
import { familiesFromCardV1_1 } from "./tag-families-v1.1";

export const DR_GOLDFISH_INERT_V1 = "deck-rating-goldfish-inert-v1";

/** Tag-table exceptions: interact/protect that still move T_first. */
export const GOLDFISH_CLOCK_EXCEPTIONS = new Set([
  "Lightning Greaves",
  "Swiftfoot Boots",
  "Rhythm of the Wild",
  "Snap",
  "Boros Charm",
  "Lightning Bolt",
  "Walking Ballista",
]);

/**
 * Hand-reviewed inert cards the tag table can miss (stax/tax/fog/hate)
 * plus the explicit §10 review list.
 */
export const GOLDFISH_INERT_FORCE = new Set([
  "Swords to Plowshares",
  "Counterspell",
  "Force of Will",
  "Force of Negation",
  "Fierce Guardianship",
  "Pact of Negation",
  "Swan Song",
  "Flusterstorm",
  "Mental Misstep",
  "Mindbreak Trap",
  "Silence",
  "Orim's Chant",
  "Red Elemental Blast",
  "Pyroblast",
  "Deflecting Swat",
  "Misdirection",
  "Commandeer",
  "Redirect Lightning",
  "Flare of Duplication",
  "Into the Flood Maw",
  "Cyclonic Rift",
  "Chain of Vapor",
  "Teferi's Protection",
  "Heroic Intervention",
  "Flawless Maneuver",
  "Clever Concealment",
  "Mithril Coat",
  "Blasphemous Act",
  "Toxic Deluge",
  "Farewell",
  "Austere Command",
  "Propaganda",
  "Ghostly Prison",
  "Beast Within",
  "Chaos Warp",
  "Generous Gift",
  "Anguished Unmaking",
  "Deadly Rollick",
  "Vandalblast",
  "Dovin's Veto",
  "Negate",
  "Mana Drain",
]);

function isStaxTaxFog(text: string): boolean {
  return (
    /can't attack you unless/i.test(text) ||
    /creatures (?:your opponents control|can't attack)/i.test(text) ||
    /spells (?:your opponents|each opponent).*cost/i.test(text) ||
    /each opponent.*(?:more|additional) (?:to cast|mana)/i.test(text) ||
    /prevent all (?:combat )?damage/i.test(text) ||
    /players can't cast/i.test(text)
  );
}

export function isGoldfishInert(input: { name: string; typeLine?: string; text?: string }): boolean {
  if (GOLDFISH_CLOCK_EXCEPTIONS.has(input.name)) return false;
  if (GOLDFISH_INERT_FORCE.has(input.name)) return true;
  const fam = familiesFromCardV1_1({ typeLine: input.typeLine, oracleText: input.text });
  if (fam.has("interact") || fam.has("protect")) return true;
  return isStaxTaxFog(input.text ?? "");
}
