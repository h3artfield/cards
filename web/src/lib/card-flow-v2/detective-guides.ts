import type { CardCategory, CategoryDetectiveGuide } from "./types";
import { MTG_DETECTIVE_GUIDE } from "./knowledge/mtg";
import { RIFTBOUND_DETECTIVE_GUIDE } from "./knowledge/riftbound";

const GUIDES: Record<CardCategory, CategoryDetectiveGuide> = {
  pokemon: {
    category: "pokemon",
    importantRegions: [
      "card name and HP line",
      "set logo / set name banner",
      "collector number bottom-right",
      "set symbol bottom-left",
      "rarity symbol",
      "foil pattern on artwork or text box",
      "promo stamp or league stamp",
      "language indicator",
      "slab label when graded",
    ],
    keyFields: [
      "card_name",
      "set_name",
      "collector_number",
      "language",
      "rarity",
      "foil_pattern",
      "promo_stamp",
      "slab_company",
      "slab_grade",
      "cert_number",
    ],
    variantTraps: [
      "same Pokémon name can exist in many sets with different numbers and art",
      "reverse holo vs holo vs non-holo are different market products",
      "reverse holo text box: same base color as normal but with repeating holo pattern; normal text box is uniform solid with no pattern — not necessarily gray",
      "modern reverse holos (Scarlet/Violet): repeating pattern often visible on border/frame outside illustration — not only text box",
      "promo codes (SWSH###, SVP###) must not be confused with set numbers",
    "Character Rare / alt-art / full-art vs standard printing",
    "Master Ball vs Poké Ball vs standard reverse holo on PE/151-style sets — look for M on ball in border/text box pattern",
    "Japanese vs English prints with different artwork",
      "1st edition vs unlimited where applicable",
    ],
    lockRequirements: [
      "card_name",
      "set_name or set code",
      "collector_number",
      "language when not English",
      "foil treatment when variants exist",
      "promo stamp when present",
    ],
    staffTips: [
      "If collector number is unreadable, show candidate printings — do not lock.",
      "Reverse holo (Pokémon): look for repeating holo pattern (star, gear, Poké Ball motifs) in the TEXT BOX and/or the border/frame outside the illustration — modern SV cards often show pattern on the border even when text box looks solid in photos.",
      "Normal/non-holo: text box and border areas are uniform solid with NO repeating pattern — base color can be gray, beige, or any set-specific solid.",
      "Never use HP as the collector number.",
    ],
  },
  yugioh: {
    category: "yugioh",
    importantRegions: [
      "card name",
      "attribute and level/rank stars",
      "set code bottom-left",
      "collector number",
      "edition (1st / unlimited)",
      "foil or ghost rare surface",
      "language",
      "slab label when graded",
    ],
    keyFields: [
      "card_name",
      "set_code",
      "collector_number",
      "edition",
      "rarity",
      "foil_pattern",
      "language",
      "slab_company",
      "slab_grade",
    ],
    variantTraps: [
      "same card name across many sets with different set codes",
      "1st edition vs unlimited pricing differs sharply",
      "alternate art and ghost rare treatments",
      "OTS / tournament pack stamps",
    ],
    lockRequirements: [
      "card_name",
      "set_code",
      "collector_number",
      "edition when relevant",
      "rarity or finish when variants exist",
    ],
    staffTips: [
      "Set code in bottom-left is often the fastest lock field.",
      "If set code is blocked, list possible set versions for staff.",
    ],
  },
  mtg: MTG_DETECTIVE_GUIDE,
  sports: {
    category: "sports",
    importantRegions: [
      "front player name",
      "team logo or uniform",
      "manufacturer logo",
      "product line",
      "rookie logo",
      "card number on back",
      "parallel color or surface pattern",
      "serial number",
      "autograph area",
      "relic or patch window",
      "slab label",
    ],
    keyFields: [
      "playerName",
      "year",
      "manufacturer",
      "productLine",
      "cardNumber",
      "parallelName",
      "serialNumber",
      "rookie",
      "autograph",
      "relic",
      "grade",
    ],
    variantTraps: [
      "player plus card number is not enough",
      "base, silver, colored parallels, numbered parallels, autos, relics, and short prints must be separated",
      "raw and graded cards must not share comps",
      "PSA, CGC, BGS, SGC, and TAG grades must be treated separately",
      "jersey number on front is often NOT the set card number",
    ],
    lockRequirements: [
      "player",
      "year",
      "manufacturer",
      "product line",
      "card number",
      "parallel when relevant",
      "serial/autograph/relic status when relevant",
      "grade context if slabbed",
    ],
    staffTips: [
      "If the parallel surface is not clear, show possible parallels to staff.",
      "If the serial number area is blocked, do not lock a numbered parallel.",
      "Read card number from the back when the front shows a jersey number.",
    ],
  },
  riftbound: RIFTBOUND_DETECTIVE_GUIDE,
  onepiece: {
    category: "onepiece",
    importantRegions: [
      "card name",
      "set code / set name",
      "collector number",
      "rarity",
      "parallel indicator",
      "language",
      "foil treatment",
    ],
    keyFields: [
      "card_name",
      "set_code",
      "collector_number",
      "rarity",
      "parallel_indicator",
      "language",
      "foil_pattern",
    ],
    variantTraps: [
      "manga rare, alt-art, and SP parallels are distinct products",
      "Japanese vs English printings differ",
    ],
    lockRequirements: [
      "card_name",
      "set code or set name",
      "collector_number",
      "parallel when relevant",
      "language when not English",
    ],
    staffTips: [
      "If parallel art treatment is unclear, do not lock — show candidates.",
    ],
  },
  lorcana: {
    category: "lorcana",
    importantRegions: [
      "card name",
      "ink cost and inkwell icon",
      "set symbol / set name",
      "collector number",
      "rarity gem",
      "foil treatment",
      "language",
      "enchanted / promo indicators",
    ],
    keyFields: [
      "card_name",
      "set_name",
      "collector_number",
      "rarity",
      "foil_pattern",
      "language",
      "promo_stamp",
    ],
    variantTraps: [
      "enchanted and promo versions are separate market products",
      "cold foil vs normal foil vs non-foil",
    ],
    lockRequirements: [
      "card_name",
      "set name",
      "collector_number",
      "finish when variants exist",
      "enchanted/promo status when relevant",
    ],
    staffTips: [
      "Enchanted cards have distinct border/art treatment — mark unknown if not visible.",
    ],
  },
  unknown: {
    category: "unknown",
    importantRegions: [
      "card name if visible",
      "manufacturer or publisher logo",
      "set identifier",
      "collector number",
      "language",
      "slab label if present",
    ],
    keyFields: [
      "card_name",
      "set_name",
      "collector_number",
      "language",
      "category_hint",
    ],
    variantTraps: [
      "category unclear — do not assume Pokémon or sports defaults",
      "variant finish unknown until category guide is loaded",
    ],
    lockRequirements: [
      "category classification",
      "any two of: name, set, collector number",
    ],
    staffTips: [
      "Use this guide when category confidence is low.",
      "Show staff what was visible and what was missing.",
    ],
  },
};

export function getDetectiveGuide(category: CardCategory): CategoryDetectiveGuide {
  return GUIDES[category] ?? GUIDES.unknown;
}

export function listDetectiveGuideCategories(): CardCategory[] {
  return Object.keys(GUIDES) as CardCategory[];
}

/** Compact guide block for vision / LLM prompts. */
export function formatDetectiveGuideForPrompt(
  guide: CategoryDetectiveGuide,
  options?: { maxTraps?: number; maxTips?: number },
): string {
  const maxTraps = options?.maxTraps ?? 6;
  const maxTips = options?.maxTips ?? 4;
  const parts = [
    `Lock requirements: ${guide.lockRequirements.join(", ")}`,
  ];
  if (guide.identificationFormula) {
    parts.push(`Identification formula: ${guide.identificationFormula}`);
  }
  if (guide.variantTraps.length) {
    parts.push(
      `Variant traps:\n- ${guide.variantTraps.slice(0, maxTraps).join("\n- ")}`,
    );
  }
  if (guide.staffTips.length) {
    parts.push(`Staff tips:\n- ${guide.staffTips.slice(0, maxTips).join("\n- ")}`);
  }
  if (guide.catalogSources?.length) {
    parts.push(`Catalog: ${guide.catalogSources.join(" ")}`);
  }
  return parts.join("\n\n");
}
