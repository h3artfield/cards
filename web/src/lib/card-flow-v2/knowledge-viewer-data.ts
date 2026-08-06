import type { CardCategory, CategoryDetectiveGuide } from "./types";
import { getDetectiveGuide } from "./detective-guides";
import { MTG_DETECTIVE_GUIDE, MTG_IMAGE_EVIDENCE_RULES } from "./knowledge/mtg";
import { POKEMON_IMAGE_EVIDENCE_RULES } from "./knowledge/pokemon";
import {
  RIFTBOUND_DETECTIVE_GUIDE,
  RIFTBOUND_IMAGE_EVIDENCE_RULES,
  RIFTBOUND_KNOWLEDGE_VERSION,
  RIFTBOUND_VALUE_CRITICAL_FLAGS,
  RIFTBOUND_FORBIDDEN_SEARCH_TERMS,
} from "./knowledge/riftbound";

export type KnowledgeGuideCompleteness = "complete" | "partial" | "generic";

export type KnowledgeCategoryView = {
  category: CardCategory;
  displayName: string;
  completeness: KnowledgeGuideCompleteness;
  highRiskVariants: boolean;
  knowledgeVersion?: string;
  staffSummary: string;
  guide: CategoryDetectiveGuide;
  marketSearchRules: string[];
  compRejectionRules: string[];
  offerPreviewNotes: string[];
  extraNotes: string[];
  rawJson: Record<string, unknown>;
};

const DISPLAY_NAMES: Record<CardCategory, string> = {
  pokemon: "Pokémon",
  mtg: "Magic: The Gathering",
  yugioh: "Yu-Gi-Oh",
  sports: "Sports Cards",
  riftbound: "Riftbound",
  onepiece: "One Piece",
  lorcana: "Lorcana",
  unknown: "Unknown / Generic",
};

const STAFF_SUMMARIES: Record<CardCategory, string> = {
  pokemon: `Pokémon cards must distinguish normal, holo, reverse holo, promo stamped, first edition, shadowless, language variants, and slab/grade context. Reverse holo is identified by repeating holo pattern on the text box or border — not by gray vs colored fill. Same Pokémon name can exist in many sets with different numbers and art.`,
  mtg: `MTG cards can have the same name and artwork but be different printings. Staff should check set code, collector number, foil/nonfoil, frame treatment, promo stamp, language, and special symbols. Never price from card name alone — set code + collector number + finish are required.`,
  yugioh: `Yu-Gi-Oh cards repeat names across many sets. Set code (bottom-left) and collector number are the fastest lock fields. Distinguish 1st edition vs unlimited, alternate art, ghost rare, and language variants before locking identity.`,
  sports: `Sports cards require player, year, manufacturer, product line, card number, and parallel when relevant. Jersey numbers on the front are often NOT the set card number — read the back. Raw and graded comps must never be mixed; parallel surface must be visible before locking.`,
  riftbound: `Riftbound value can change dramatically based on collector number suffix, overnumbered status, official signature status, foil treatment, Ultimate rarity, and set code. Same card name does not mean same market product. Staff should carefully check: collector number; whether the number ends in "a"; whether the number is above the set total; whether there is a signature or asterisk; whether the card is base, alternate art, overnumbered, or Signature Overnumbered.`,
  onepiece: `One Piece TCG parallels (manga rare, alt-art, SP) and Japanese vs English printings are distinct products. If parallel art treatment is unclear, keep candidates visible and do not lock. Catalog integration is still placeholder — staff confirmation is especially important.`,
  lorcana: `Lorcana enchanted, cold foil, and promo versions are separate market products. Distinguish finish and enchanted/promo indicators before locking. Catalog integration is still placeholder.`,
  unknown: `When category confidence is low, V2 uses a generic guide. Show staff what was visible and what was missing rather than assuming Pokémon or sports defaults.`,
};

function completenessFor(category: CardCategory, guide: CategoryDetectiveGuide): KnowledgeGuideCompleteness {
  if (category === "mtg" || category === "riftbound") return "complete";
  if (category === "unknown" || category === "onepiece" || category === "lorcana") return "generic";
  if (guide.identificationFormula || guide.variantTraps.length >= 8) return "complete";
  if (guide.variantTraps.length >= 4) return "partial";
  return "generic";
}

function marketSearchRules(category: CardCategory): string[] {
  const common = [
    "Exact queries use card name + set + collector/card number.",
    "Broad name-only queries are for candidate discovery only — not valuation.",
    "Raw searches forbid PSA/CGC/BGS/slab/graded terms; graded searches forbid raw/ungraded.",
    "Lots, bundles, sealed product, proxies, and digital codes are forbidden.",
  ];
  switch (category) {
    case "mtg":
      return [...common, "MTG exact: quoted name + set code + collector number + foil tag.", "Forbidden: gold border, oversized, arena, proxy."];
    case "pokemon":
      return [...common, "Pokémon exact: quoted name + set + collector number.", "Finish terms (reverse holo vs normal) required when both exist."];
    case "sports":
      return [...common, "Sports exact: player + set/product + card number + parallel name.", "Parallel-specific query when parallel is known."];
    case "riftbound":
      return [
        ...common,
        "Riftbound exact: Riftbound + name + set code + #collector + variant label.",
        "Alternate art: include Alternate Art and collector suffix 'a'.",
        "Overnumbered: include Overnumbered and exact collector # above set total.",
        "Signature: include Signature and asterisk marker when official.",
        "Base searches forbid: alternate art, overnumbered, signature, signed.",
      ];
    case "yugioh":
      return [...common, "Yu-Gi-Oh exact: name + set code + edition + rarity."];
    default:
      return common;
  }
}

function compRejectionRules(category: CardCategory): string[] {
  const common = [
    "Reject lots, bundles, sealed product, proxies, digital codes.",
    "Reject raw vs graded mismatch.",
    "Active eBay listings are maybe/sanity only — never sold comps.",
  ];
  switch (category) {
    case "pokemon":
      return [...common, "Reject reverse holo vs normal mismatch in listing title.", "Reject wrong collector number."];
    case "mtg":
      return [...common, "Reject foil vs nonfoil mismatch.", "Reject wrong set code or collector number.", "Reject wrong edition (1st vs unlimited)."];
    case "sports":
      return [...common, "Reject wrong parallel.", "Reject PSA/CGC/BGS grade mismatch when slab context is known."];
    case "riftbound":
      return [
        ...common,
        "Base comps rejected for alternate art, overnumbered, or signature listings.",
        "Signature Overnumbered comps rejected for non-signature overnumbered listings.",
        "Aftermarket hand-signed listings rejected for official Signature comps.",
        "Never mix base, alt-art, overnumbered, and signature versions.",
      ];
    default:
      return common;
  }
}

function offerPreviewNotes(category: CardCategory): string[] {
  const shadow = [
    "V2 offer preview is shadow-only — stored under cardFlowV2OfferPreview only.",
    "Preview never writes marketPrice, cashOffer, tradeOffer, or status.",
    "No offer-influence flag exists or is enabled.",
  ];
  switch (category) {
    case "pokemon":
    case "mtg":
    case "yugioh":
    case "lorcana":
    case "onepiece":
      return [
        ...shadow,
        "TCG-style: lowest TCG listing is the offer when available; TCG market + PriceCharting are 30-day references.",
        "Variant uncertainty blocks until staff confirms or vision locks.",
        "High value ≥$250 triggers manual review.",
      ];
    case "sports":
      return [
        ...shadow,
        "Sports parallel uncertainty blocks preview unless staff confirmed.",
        "PriceCharting-only without sold comps is low confidence.",
        "Slab grade context must match for preview.",
      ];
    case "riftbound":
      return [
        ...shadow,
        "Signature Overnumbered, Ultimate, and aftermarket autographs require staff review.",
        "High-value overnumbered triggers manual review.",
        "TCGplayer + PriceCharting blend when identity is staff-confirmed or vision-locked.",
      ];
    default:
      return shadow;
  }
}

function extraNotes(category: CardCategory): string[] {
  switch (category) {
    case "pokemon":
      return ["Image evidence rules: pattern vs solid on text box/border for reverse holo."];
    case "mtg":
      return ["Image evidence: foil reflection vs security stamp distinction.", "Catalog: Scryfall primary."];
    case "riftbound":
      return [
        "Collector suffix 'a' = alternate art.",
        "Collector # above set total = overnumbered (Origins OGN main set = 298, #299+).",
        "Asterisk in collector # = official Signature Overnumbered.",
        "OGS (Proving Grounds) cards do not have foil versions.",
        "Ultimate rarity always requires staff review.",
        `Knowledge version: ${RIFTBOUND_KNOWLEDGE_VERSION}`,
        `Value-critical flags: ${RIFTBOUND_VALUE_CRITICAL_FLAGS.join(", ")}`,
      ];
    case "onepiece":
    case "lorcana":
      return ["Catalog adapter is placeholder — suspects may be empty until integration."];
    default:
      return [];
  }
}

function buildRawJson(category: CardCategory, guide: CategoryDetectiveGuide): Record<string, unknown> {
  const base: Record<string, unknown> = { ...guide };
  if (category === "mtg") base.imageEvidenceRules = MTG_IMAGE_EVIDENCE_RULES;
  if (category === "pokemon") base.imageEvidenceRules = POKEMON_IMAGE_EVIDENCE_RULES;
  if (category === "riftbound") {
    base.imageEvidenceRules = RIFTBOUND_IMAGE_EVIDENCE_RULES;
    base.knowledgeVersion = RIFTBOUND_KNOWLEDGE_VERSION;
    base.valueCriticalFlags = RIFTBOUND_VALUE_CRITICAL_FLAGS;
    base.forbiddenSearchTerms = RIFTBOUND_FORBIDDEN_SEARCH_TERMS;
  }
  return base;
}

export function getKnowledgeCategoryView(category: CardCategory): KnowledgeCategoryView {
  const guide =
    category === "mtg"
      ? MTG_DETECTIVE_GUIDE
      : category === "riftbound"
        ? RIFTBOUND_DETECTIVE_GUIDE
        : getDetectiveGuide(category);

  const completeness = completenessFor(category, guide);
  const highRisk =
    category === "riftbound" ||
    category === "mtg" ||
    category === "sports" ||
    guide.variantTraps.length >= 8;

  return {
    category,
    displayName: DISPLAY_NAMES[category],
    completeness,
    highRiskVariants: highRisk,
    knowledgeVersion:
      category === "riftbound"
        ? RIFTBOUND_KNOWLEDGE_VERSION
        : category === "mtg"
          ? "2026-03.v1-mtg-module"
          : undefined,
    staffSummary: STAFF_SUMMARIES[category],
    guide,
    marketSearchRules: marketSearchRules(category),
    compRejectionRules: compRejectionRules(category),
    offerPreviewNotes: offerPreviewNotes(category),
    extraNotes: extraNotes(category),
    rawJson: buildRawJson(category, guide),
  };
}

export function getAllKnowledgeCategories(): KnowledgeCategoryView[] {
  const order: CardCategory[] = [
    "pokemon",
    "mtg",
    "yugioh",
    "sports",
    "riftbound",
    "onepiece",
    "lorcana",
    "unknown",
  ];
  return order.map(getKnowledgeCategoryView);
}

export function searchKnowledgeCategories(
  query: string,
  categories: KnowledgeCategoryView[] = getAllKnowledgeCategories(),
): KnowledgeCategoryView[] {
  const q = query.trim().toLowerCase();
  if (!q) return categories;
  return categories.filter((c) => {
    const haystack = [
      c.displayName,
      c.category,
      c.staffSummary,
      ...c.guide.variantTraps,
      ...c.guide.staffTips,
      ...c.guide.keyFields,
      ...c.extraNotes,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}
