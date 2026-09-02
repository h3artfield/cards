/**
 * GPT-5.6 Sol bracket drag analysis — which cards prevent bracket target.
 */
import type { FinalDeckDoctorDossierV48 } from "./professor-deck-dossier-v4-8-v1";
import { dossierToPromptText } from "./professor-deck-dossier-v4-8-v1";
import { callHeadProfessorJsonV48 } from "./professor-head-professor-caller-v4-8-v1";
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";

export const PROFESSOR_BRACKET_DRAG_ANALYSIS_V4_11_V1_VERSION = "professor-bracket-drag-analysis-v4-11-v1";

export type BracketDragCardV411 = {
  card: string;
  whyItDragsBracket: string;
  replaceWithRole: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
};

const DRAG_ANALYSIS_SYSTEM = `You are GPT-5.6 Sol inspecting a complete Commander deck.

The deck was requested at a specific bracket but plays lower (or higher). Identify existing cards that most prevent bracket alignment.

Return JSON:
{
  "bracketDragCards": [
    {
      "card": "exact name from list",
      "whyItDragsBracket": "short reason",
      "replaceWithRole": "what role should replace it (e.g. efficient tutor, cheap interaction)",
      "priority": "HIGH"|"MEDIUM"|"LOW"
    }
  ]
}

Rules:
- Use exact card names from the list
- Prefer cuts that are low-impact, off-charter, or too slow for the target bracket
- Do NOT recommend cutting essential synergy engines unless clearly off-charter
- Max 8 drag cards, sorted by priority
- For DOWNGRADE missions, identify cards that overshoot (too fast, too many GCs, etc.)`;

type DragJson = { bracketDragCards?: BracketDragCardV411[] };

export function fallbackBracketDragCardsV411(cards: { name: string; category: string }[]): BracketDragCardV411[] {
  const fillerRe = /doorman|pummeler|line breaker|wei strike|guul draz|keldon raider|inquisitive puppet|ogre arsonist|ma chao|sagu pummeler|shadowcloak|dirtwater wraith|spider-ham|topography tracker|thran vigil|akki rockspeaker/i;
  return cards
    .filter((c) => c.category !== "land" && fillerRe.test(c.name))
    .map((c) => ({
      card: c.name,
      whyItDragsBracket: "Low-impact filler with minimal sacrifice-engine contribution for B4",
      replaceWithRole: "efficient tutor or compact engine piece",
      priority: "HIGH" as const,
    }))
    .slice(0, 6);
}

export async function runBracketDragAnalysisV411(args: {
  dossier: FinalDeckDoctorDossierV48;
  requestedBracket: CommanderBracket;
  predictedBracket: CommanderBracket;
  missionType: "UPGRADE" | "DOWNGRADE";
}): Promise<BracketDragCardV411[]> {
  const prompt = [
    dossierToPromptText(args.dossier),
    "",
    "# BRACKET DRAG ANALYSIS",
    `Requested: B${args.requestedBracket} | Predicted: B${args.predictedBracket} | Mission: ${args.missionType}`,
    "Which cards in this EXACT list are the biggest reasons the deck fails bracket alignment?",
  ].join("\n");

  const { parsed } = await callHeadProfessorJsonV48<DragJson>({
    system: DRAG_ANALYSIS_SYSTEM,
    userContent: prompt,
  });

  const deckNames = new Set(args.dossier.cards.map((c) => c.name.toLowerCase()));
  const fromSol = (parsed.bracketDragCards ?? [])
    .filter((d) => deckNames.has(d.card.toLowerCase()))
    .slice(0, 8);
  if (fromSol.length > 0) return fromSol;
  return fallbackBracketDragCardsV411(args.dossier.cards);
}
