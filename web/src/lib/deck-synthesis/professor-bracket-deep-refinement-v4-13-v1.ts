/**
 * Deep bracket refinement v4.13 — Sol deficit portfolio + opportunity cost + package drag.
 */
import type { FinalDeckDoctorDossierV48 } from "./professor-deck-dossier-v4-8-v1";
import { dossierToPromptText } from "./professor-deck-dossier-v4-8-v1";
import { callHeadProfessorJsonV48 } from "./professor-head-professor-caller-v4-8-v1";
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";
import type { BracketDeficitCategoryV413, RemainingBracketDeficitV413 } from "./professor-bracket-deficit-portfolio-v4-13-v1";
import {
  deriveOpportunityCostSlotsV413,
  resolveCardReferenceV413,
  type OpportunityCostSlotV413,
} from "./professor-opportunity-cost-slot-v4-13-v1";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { hasObviousFillerInDeckV412 } from "./professor-bracket-drag-slot-v4-12-v1";

export const PROFESSOR_BRACKET_DEEP_REFINEMENT_V4_13_V1_VERSION = "professor-bracket-deep-refinement-v4-13-v1";

export type PackageDragV413 = {
  packageName: string;
  cardNames: string[];
  oracleIds: (string | null)[];
  slotsConsumed: number;
  contribution: string;
  reasonInsufficient: string;
  suggestedReplacementFunction: string;
};

export type DeepRefinementAnalysisV413 = {
  version: typeof PROFESSOR_BRACKET_DEEP_REFINEMENT_V4_13_V1_VERSION;
  remainingBracketDeficits: RemainingBracketDeficitV413[];
  packageDrag: PackageDragV413[];
  opportunityCostSlots: OpportunityCostSlotV413[];
  refinementMode: "FILLER_DRAG" | "OPPORTUNITY_COST";
};

const DEEP_REFINEMENT_SYSTEM = `You are GPT-5.6 Sol performing DEEP bracket refinement.

The deck is no longer full of obvious filler. Your job: identify what prevents this deck from playing like the TARGET bracket.

Return JSON:
{
  "remainingBracketDeficits": [
    {
      "category": "ACCELERATION"|"FAST_MANA"|"ACCESS_TUTORS"|"CARD_VELOCITY"|"INTERACTION"|"PROTECTION"|"RESILIENCE"|"ENGINE_DENSITY"|"SACRIFICE_FUEL"|"WIN_COMPACTNESS"|"FINISHER_QUALITY"|"MANA_EFFICIENCY"|"REDUNDANCY"|"DEAD_CARD_RATE",
      "severity": "HIGH"|"MEDIUM"|"LOW",
      "explanation": "why this gap remains",
      "currentDeckEvidence": ["metric or observation"],
      "desiredImprovement": "what B4 needs here",
      "suggestedSlotsToReconsider": [
        { "oracleId": "uuid if known", "cardName": "exact name from list", "reason": "why this acceptable card should yield" }
      ]
    }
  ],
  "packageDrag": [
    {
      "packageName": "name",
      "cardNames": ["exact names"],
      "slotsConsumed": 2-5,
      "contribution": "what package does now",
      "reasonInsufficient": "why insufficient at target bracket",
      "suggestedReplacementFunction": "functional replacement"
    }
  ]
}

Rules:
- Use exact card names AND oracleIds from the provided canonical list
- suggestedSlotsToReconsider may include GOOD B3 cards — opportunity cost cuts
- Do NOT recommend cutting tutors if tutor/access deficit is already satisfied (4+ tutors)
- Focus remaining gap: interaction, protection, acceleration, compact win architecture
- Max 6 deficits, max 8 slots to reconsider, max 2 packages`;

type DeepRefinementJson = {
  remainingBracketDeficits?: RemainingBracketDeficitV413[];
  packageDrag?: PackageDragV413[];
};

function canonicalCardIndex(cards: CouncilCardV46[]): string {
  return cards
    .filter((c) => c.category !== "land")
    .map((c) => `${c.name} | oracleId=${c.oracleId ?? "null"} | roles=${c.roles.join(",")}`)
    .join("\n");
}

export async function runDeepRefinementAnalysisV413(args: {
  dossier: FinalDeckDoctorDossierV48;
  selectedCards: CouncilCardV46[];
  catalog: DeckResolutionCatalog;
  requestedBracket: CommanderBracket;
  predictedBracket: CommanderBracket;
  activeCategories: BracketDeficitCategoryV413[];
  tutorCount: number;
  skipSolCall?: boolean;
}): Promise<DeepRefinementAnalysisV413> {
  const fillerMode = hasObviousFillerInDeckV412(args.selectedCards);

  const prompt = [
    dossierToPromptText(args.dossier),
    "",
    "# DEEP BRACKET REFINEMENT",
    `Predicted: B${args.predictedBracket} | Target: B${args.requestedBracket}`,
    `Tutors in deck: ${args.tutorCount} — ${args.tutorCount >= 3 ? "ACCESS_TUTORS likely SATISFIED, do not prioritize more tutors" : "tutor gap may remain"}`,
    `Active deficit categories: ${args.activeCategories.join(", ")}`,
    "",
    "CANONICAL NONLAND CARDS (use exact names and oracleIds):",
    canonicalCardIndex(args.selectedCards),
    "",
    fillerMode
      ? "Some obvious filler may remain — prioritize those first."
      : "No obvious filler remains. Identify ACCEPTABLE cards with highest opportunity cost for B4 upgrade.",
  ].join("\n");

  let solDeficits: RemainingBracketDeficitV413[] = [];
  let packageDrag: PackageDragV413[] = [];

  if (!args.skipSolCall) {
    try {
      const { parsed } = await callHeadProfessorJsonV48<DeepRefinementJson>({
        system: DEEP_REFINEMENT_SYSTEM,
        userContent: prompt,
      });
      solDeficits = (parsed.remainingBracketDeficits ?? []).map((d) => ({
        ...d,
        suggestedSlotsToReconsider: (d.suggestedSlotsToReconsider ?? []).map((s) => {
          const resolved = resolveCardReferenceV413({
            selectedCards: args.selectedCards,
            ref: s,
          });
          return resolved
            ? { oracleId: resolved.oracleId, cardName: resolved.name, reason: s.reason }
            : s;
        }),
      }));
      packageDrag = (parsed.packageDrag ?? []).map((p) => ({
        ...p,
        oracleIds: p.cardNames.map((n) => {
          const c = resolveCardReferenceV413({ selectedCards: args.selectedCards, ref: { cardName: n } });
          return c?.oracleId ?? null;
        }),
      }));
    } catch {
      // fallback below
    }
  }

  const opportunityCostSlots = deriveOpportunityCostSlotsV413({
    selectedCards: args.selectedCards,
    catalog: args.catalog,
    solSuggestions: solDeficits,
    activeCategories: args.activeCategories,
    currentBracket: args.predictedBracket,
    targetBracket: args.requestedBracket,
  });

  return {
    version: PROFESSOR_BRACKET_DEEP_REFINEMENT_V4_13_V1_VERSION,
    remainingBracketDeficits: solDeficits,
    packageDrag,
    opportunityCostSlots,
    refinementMode: fillerMode ? "FILLER_DRAG" : "OPPORTUNITY_COST",
  };
}
