/**
 * Bracket drag slot v4.12 — reserved mission cut targets with role metadata.
 */
import { normalizeOracleName } from "@/lib/deck-builder/golden-catalog/normalize-name";
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";

export const PROFESSOR_BRACKET_DRAG_SLOT_V4_12_V1_VERSION = "professor-bracket-drag-slot-v4-12-v1";

export type BracketDragSlotV412 = {
  version: typeof PROFESSOR_BRACKET_DRAG_SLOT_V4_12_V1_VERSION;
  dragSlotId: string;
  cardId: string;
  oracleId: string | null;
  cardName: string;
  dragReason: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  roleCurrentlyFilled: string[];
  rolesThatMustBePreserved: string[];
  desiredReplacementRole: string[];
  bracketDeficitAddressed: string[];
  reservedForMission: boolean;
};

export function dragSlotFromCard(args: {
  card: CouncilCardV46;
  dragReason: string;
  priority: BracketDragSlotV412["priority"];
  desiredReplacementRole: string[];
  bracketDeficitAddressed: string[];
  slotIndex: number;
}): BracketDragSlotV412 {
  const preserve = args.card.roles.filter((r) =>
    ["sacrifice-outlet", "interaction", "protection", "token-generation"].includes(r),
  );
  return {
    version: PROFESSOR_BRACKET_DRAG_SLOT_V4_12_V1_VERSION,
    dragSlotId: `drag-slot-${args.slotIndex}-${args.card.cardId}`,
    cardId: args.card.cardId,
    oracleId: args.oracleId,
    cardName: args.card.name,
    dragReason: args.dragReason,
    priority: args.priority,
    roleCurrentlyFilled: args.card.roles.slice(0, 4),
    rolesThatMustBePreserved: preserve,
    desiredReplacementRole: args.desiredReplacementRole,
    bracketDeficitAddressed: args.bracketDeficitAddressed,
    reservedForMission: true,
  };
}

export function findCardInDeck(selected: CouncilCardV46[], nameOrId: { cardName?: string; cardId?: string; oracleId?: string | null }): CouncilCardV46 | null {
  if (nameOrId.cardId) {
    const byId = selected.find((c) => c.cardId === nameOrId.cardId);
    if (byId) return byId;
  }
  if (nameOrId.oracleId) {
    const byOracle = selected.find((c) => c.oracleId === nameOrId.oracleId);
    if (byOracle) return byOracle;
  }
  if (nameOrId.cardName) {
    const norm = normalizeOracleName(nameOrId.cardName);
    return (
      selected.find((c) => c.name && normalizeOracleName(c.name) === norm) ??
      selected.find((c) => c.name?.toLowerCase() === nameOrId.cardName!.toLowerCase()) ??
      null
    );
  }
  return null;
}

export function resolveActiveDragSlotsV412(args: {
  slots: BracketDragSlotV412[];
  selectedCards: CouncilCardV46[];
  unresolvedDeficits: string[];
}): BracketDragSlotV412[] {
  const active: BracketDragSlotV412[] = [];
  const usedCutIds = new Set<string>();

  for (const slot of args.slots) {
    const card = findCardInDeck(args.selectedCards, slot);
    if (card && !usedCutIds.has(card.cardId)) {
      active.push({ ...slot, cardId: card.cardId, cardName: card.name, oracleId: card.oracleId });
      usedCutIds.add(card.cardId);
    }
  }

  if (active.length > 0 || args.unresolvedDeficits.length === 0) return active;

  const replacement = findReplacementCutSlotV412({
    selectedCards: args.selectedCards,
    excludeCardIds: usedCutIds,
    unresolvedDeficits: args.unresolvedDeficits,
  });
  if (replacement) active.push(replacement);
  return active;
}

const FILLER_RE = /doorman|pummeler|line breaker|wei strike|guul draz|keldon raider|inquisitive puppet|ogre arsonist|ma chao|sagu pummeler|shadowcloak|dirtwater wraith|spider-ham|topography tracker|thran vigil|akki rockspeaker|crypt creeper|keldon|wei strike force|ogre arsonist/i;

export function hasObviousFillerInDeckV412(selected: CouncilCardV46[]): boolean {
  return selected.some((c) => c.category !== "land" && FILLER_RE.test(c.name));
}

function cutPriorityScore(card: CouncilCardV46): number {
  if (card.category === "land") return -1000;
  let score = 0;
  if (FILLER_RE.test(card.name)) score += 200;
  if (card.commanderDependence === "HIGH") score -= 50;
  if (card.roles.includes("sacrifice-outlet")) score -= 40;
  if (card.roles.includes("interaction")) score -= 30;
  if (card.roles.includes("token-generation")) score -= 20;
  if (card.roles.includes("card-advantage")) score -= 15;
  if (card.status === "CORE") score -= 100;
  score += (card.roles?.length ?? 0) * -2;
  return score;
}

export function findReplacementCutSlotV412(args: {
  selectedCards: CouncilCardV46[];
  excludeCardIds: Set<string>;
  unresolvedDeficits: string[];
}): BracketDragSlotV412 | null {
  const candidates = args.selectedCards
    .filter((c) => c.category !== "land" && !args.excludeCardIds.has(c.cardId) && c.status !== "CORE")
    .sort((a, b) => cutPriorityScore(b) - cutPriorityScore(a));

  const cut = candidates[0];
  if (!cut || cutPriorityScore(cut) < 50) return null;

  const deficit = args.unresolvedDeficits[0] ?? "BRACKET_ALIGNMENT";
  const desiredRole = /tutor|access/i.test(deficit)
    ? ["efficient tutor/access"]
    : /interaction/i.test(deficit)
      ? ["efficient interaction"]
      : /protection/i.test(deficit)
        ? ["protection"]
        : /acceler|ramp|fast/i.test(deficit)
          ? ["premium acceleration"]
          : ["compact engine piece"];

  return dragSlotFromCard({
    card: cut,
    dragReason: `Replacement cut slot — underlying deficit unresolved: ${deficit}`,
    priority: "HIGH",
    desiredReplacementRole: desiredRole,
    bracketDeficitAddressed: [deficit],
    slotIndex: 9000 + candidates.length,
  });
}

export function mapReplacementRoleToDeficit(role: string): string {
  const r = role.toLowerCase();
  if (/tutor|access|search|consistency/i.test(r)) return "TUTOR_ACCESS";
  if (/interaction|removal|counter/i.test(r)) return "INTERACTION";
  if (/protection|resilien/i.test(r)) return "PROTECTION";
  if (/acceler|ramp|fast mana/i.test(r)) return "ACCELERATION";
  if (/draw|velocity|card advantage/i.test(r)) return "CARD_VELOCITY";
  if (/finisher|win|compact/i.test(r)) return "WIN_ARCHITECTURE";
  if (/game changer|gc/i.test(r)) return "GAME_CHANGER";
  return "EFFICIENCY";
}
