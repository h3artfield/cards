/**
 * Resolve development case ID → catalog card name or text-match strategy.
 */
import { buildEvalCardNameLookup } from "../generate-oracle-action-eval-cases";
import { DEV_EXPANSION_V9_SEEDS } from "../development-set-v9-expansion-seeds";
import { OPTIONALITY_CONDITION_EVAL_CASES } from "../oracle-action-eval-optionality-condition-cases";
import { NEW_MULTIFACE_CASES } from "../oracle-action-eval-multiface-cases";
import { isSyntheticEvalCaseId } from "./eval-case-card-name-lookup";

/** Explicit dev-opt/dev-cond → representative catalog card when text is a known fragment. */
const REPRESENTATIVE_CARD_BY_CASE_ID: Record<string, string> = {
  "dev-opt-002": "Elvish Mystic",
  "dev-opt-005": "Rhystic Study",
  "dev-opt-007": "Growth Spiral",
  "dev-opt-008": "Hero's Downfall",
  "dev-opt-013": "Lightning Bolt",
  "dev-opt-014": "Counterspell",
  "dev-opt-015": "Demonic Tutor",
  "dev-opt-016": "Sol Ring",
  "dev-opt-017": "Rest in Peace",
  "dev-opt-018": "Grizzly Bears",
  "dev-opt-019": "Llanowar Elves",
  "dev-opt-020": "Brainstorm",
  "dev-opt-021": "Swords to Plowshares",
  "dev-opt-022": "Thoughtseize",
  "dev-opt-023": "Path to Exile",
  "dev-opt-024": "Wrath of God",
  "dev-opt-025": "Lightning Bolt",
  "dev-opt-026": "Opt",
  "dev-opt-027": "Preordain",
  "dev-opt-028": "Ponder",
  "dev-opt-029": "Serum Visions",
  "dev-opt-030": "Consider",
  "dev-opt-031": "Expressive Iteration",
  "dev-opt-032": "Faithless Looting",
  "dev-opt-033": "Careful Study",
  "dev-opt-034": "Gifts Ungiven",
  "dev-opt-035": "Fact or Fiction",
  "dev-opt-036": "Impulse",
  "dev-opt-037": "Anticipate",
  "dev-opt-038": "Sleight of Hand",
  "dev-opt-039": "Portent",
  "dev-opt-040": "Serum Visions",
  "dev-cond-001": "Rest in Peace",
  "dev-cond-002": "Doubling Season",
  "dev-cond-003": "Rhystic Study",
  "dev-cond-004": "Smothering Tithe",
  "dev-cond-005": "Dark Confidant",
  "dev-cond-006": "Phyrexian Arena",
  "dev-cond-007": "Necropotence",
  "dev-cond-008": "Sylvan Library",
  "dev-cond-009": "Howling Mine",
  "dev-cond-010": "Teferi's Puzzle Box",
  "dev-cond-011": "Consecrated Sphinx",
  "dev-cond-012": "Mystic Remora",
};

const MULTIFACE_CARD_NAMES: Record<string, string> = {
  "eval-0257": "Dusk // Dawn",
  "eval-0258": "Commit // Memory",
  "eval-0259": "Discovery // Dispersal",
  "eval-0260": "Embereth Shieldbreaker // Battle Display",
  "eval-0261": "Edgewall Innkeeper // Garruk's Harbinger",
  "eval-0262": "Brightcap Badger // Fungus Frolic",
};

export function buildDevelopmentCardNameLookup(): Map<string, string> {
  const lookup = buildEvalCardNameLookup();

  for (let i = 0; i < DEV_EXPANSION_V9_SEEDS.length; i++) {
    lookup.set(`dev-v9-${String(i + 1).padStart(3, "0")}`, DEV_EXPANSION_V9_SEEDS[i].name);
  }

  for (const c of OPTIONALITY_CONDITION_EVAL_CASES) {
    if (REPRESENTATIVE_CARD_BY_CASE_ID[c.id]) {
      lookup.set(c.id, REPRESENTATIVE_CARD_BY_CASE_ID[c.id]);
    }
  }

  for (const c of NEW_MULTIFACE_CASES) {
    if (MULTIFACE_CARD_NAMES[c.id]) {
      lookup.set(c.id, MULTIFACE_CARD_NAMES[c.id]);
    }
  }

  return lookup;
}

export function isFragmentOnlyCase(caseId: string): boolean {
  return (
    isSyntheticEvalCaseId(caseId) ||
    caseId.startsWith("dev-opt-") ||
    caseId.startsWith("dev-cond-")
  );
}
