/**
 * Bracket drag slot analysis v4.12 — Sol produces full BracketDragSlotV412 entries.
 */
import type { FinalDeckDoctorDossierV48 } from "./professor-deck-dossier-v4-8-v1";
import { dossierToPromptText } from "./professor-deck-dossier-v4-8-v1";
import { callHeadProfessorJsonV48 } from "./professor-head-professor-caller-v4-8-v1";
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";
import {
  dragSlotFromCard,
  findCardInDeck,
  mapReplacementRoleToDeficit,
  type BracketDragSlotV412,
} from "./professor-bracket-drag-slot-v4-12-v1";

export const PROFESSOR_BRACKET_DRAG_ANALYSIS_V4_12_V1_VERSION = "professor-bracket-drag-analysis-v4-12-v1";

const DRAG_SLOT_SYSTEM = `You are GPT-5.6 Sol inspecting a complete Commander deck for bracket upgrade.

Return JSON:
{
  "bracketDragSlots": [
    {
      "cardName": "exact name from list",
      "dragReason": "why this slot drags bracket down",
      "priority": "HIGH"|"MEDIUM"|"LOW",
      "roleCurrentlyFilled": ["roles this card currently provides"],
      "rolesThatMustBePreserved": ["critical roles that must not be lost deck-wide if cut — usually empty for filler"],
      "desiredReplacementRole": ["functional role(s) for replacement e.g. efficient tutor/access"],
      "bracketDeficitAddressed": ["TUTOR_ACCESS"|"ACCELERATION"|"INTERACTION"|"PROTECTION"|"CARD_VELOCITY"|"WIN_ARCHITECTURE"|"GAME_CHANGER"|"EFFICIENCY"]
    }
  ]
}

Rules:
- Use exact card names from the list
- Prefer low-impact filler, off-charter, or too-slow cards for B4 upgrade
- Do NOT cut essential sacrifice engines unless clearly off-charter
- desiredReplacementRole describes FUNCTION not specific card names
- Max 8 slots, prioritize HIGH first`;

type DragSlotJson = {
  cardName: string;
  dragReason: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  roleCurrentlyFilled?: string[];
  rolesThatMustBePreserved?: string[];
  desiredReplacementRole: string[];
  bracketDeficitAddressed?: string[];
};

type DragJson = { bracketDragSlots?: DragSlotJson[] };

const FILLER_RE = /doorman|pummeler|keldon raider|topography tracker|thran vigil|akki rockspeaker|inquisitive puppet|ogre arsonist/i;

export function fallbackDragSlotsV412(selected: CouncilCardV46[]): BracketDragSlotV412[] {
  return selected
    .filter((c) => c.category !== "land" && FILLER_RE.test(c.name))
    .slice(0, 6)
    .map((card, i) =>
      dragSlotFromCard({
        card,
        dragReason: "Low-impact filler with minimal sacrifice-engine contribution for target bracket",
        priority: "HIGH",
        desiredReplacementRole: ["efficient tutor/access", "compact engine piece"],
        bracketDeficitAddressed: ["TUTOR_ACCESS", "EFFICIENCY"],
        slotIndex: i,
      }),
    );
}

export async function runBracketDragSlotAnalysisV412(args: {
  dossier: FinalDeckDoctorDossierV48;
  selectedCards: CouncilCardV46[];
  requestedBracket: CommanderBracket;
  predictedBracket: CommanderBracket;
  missionType: "UPGRADE" | "DOWNGRADE";
}): Promise<BracketDragSlotV412[]> {
  const prompt = [
    dossierToPromptText(args.dossier),
    "",
    "# BRACKET DRAG SLOT ANALYSIS",
    `Requested: B${args.requestedBracket} | Predicted: B${args.predictedBracket} | Mission: ${args.missionType}`,
    "Which existing slots prevent this deck from behaving like the requested bracket?",
    "For each, specify desiredReplacementRole as functional roles (not card names).",
  ].join("\n");

  let fromSol: BracketDragSlotV412[] = [];
  try {
    const { parsed } = await callHeadProfessorJsonV48<DragJson>({
      system: DRAG_SLOT_SYSTEM,
      userContent: prompt,
    });

    fromSol = (parsed.bracketDragSlots ?? [])
      .map((s, i) => {
        const card = findCardInDeck(args.selectedCards, { cardName: s.cardName });
        if (!card) return null;
        return {
          version: "professor-bracket-drag-slot-v4-12-v1" as const,
          dragSlotId: `drag-slot-sol-${i}-${card.cardId}`,
          cardId: card.cardId,
          oracleId: card.oracleId,
          cardName: card.name,
          dragReason: s.dragReason,
          priority: s.priority,
          roleCurrentlyFilled: s.roleCurrentlyFilled ?? card.roles.slice(0, 4),
          rolesThatMustBePreserved: s.rolesThatMustBePreserved ?? [],
          desiredReplacementRole: s.desiredReplacementRole,
          bracketDeficitAddressed:
            s.bracketDeficitAddressed ??
            s.desiredReplacementRole.map(mapReplacementRoleToDeficit),
          reservedForMission: true,
        };
      })
      .filter((s): s is BracketDragSlotV412 => s !== null);
  } catch {
    // fall through to fallback
  }

  if (fromSol.length > 0) return fromSol.slice(0, 8);
  return fallbackDragSlotsV412(args.selectedCards);
}
