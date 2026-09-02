/**
 * Client-safe Professor brew session helpers — no server/catalog/firebase imports.
 */
import type { BrewDialogueChoiceV42, BrewSessionV42 } from "./professor-brew-session-types-v4-2-v1";

export const BREW_TREE_MAX_REVEAL_STEP_V42 = 6;

function treeGrowthChoiceV42(session: BrewSessionV42): BrewDialogueChoiceV42 | null {
  if (session.treeRevealStep >= BREW_TREE_MAX_REVEAL_STEP_V42) return null;
  if (session.discoveryInterrupt) return null;
  if (session.phase === "COMPLETE" || session.phase === "USER_FORK") return null;
  if (!session.workingDeckTheory) return null;
  const nextStep = session.treeRevealStep + 1;
  const label =
    session.treeRevealStep === 0
      ? "Show me the structure"
      : nextStep >= 4
        ? `Show me the cards (${nextStep}/${BREW_TREE_MAX_REVEAL_STEP_V42})`
        : `Grow the tree (${nextStep}/${BREW_TREE_MAX_REVEAL_STEP_V42})`;
  return { choiceId: `grow-tree-${nextStep}`, label, action: "ADVANCE_TREE" };
}

export function getBrewDialogueChoicesV42(session: BrewSessionV42): BrewDialogueChoiceV42[] {
  if (session.discoveryInterrupt) return session.discoveryInterrupt.choices;
  if (session.pendingChoices.length > 0) return session.pendingChoices;
  const growth = treeGrowthChoiceV42(session);
  return growth ? [growth] : [];
}

export type {
  BrewSessionV42,
  BrewSessionViewV42,
  BrewDialogueChoiceV42,
  BrewDiscoveryInterruptV42,
  BrewProfessorLineV42,
} from "./professor-brew-session-types-v4-2-v1";
