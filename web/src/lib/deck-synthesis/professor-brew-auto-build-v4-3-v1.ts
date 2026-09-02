/**
 * Professor brew auto-build — setup batch + agents build deck without manual tree clicks.
 */
import {
  BREW_TREE_MAX_REVEAL_STEP_V42,
  type BrewSessionModeV42,
  type BrewSessionV42,
  type BrewSessionViewV42,
} from "./professor-brew-session-v4-2-v1";
import {
  DEFAULT_ARCHETYPE_CHOICE_V42,
  DEFAULT_RELATIONSHIP_CHOICE_V42,
} from "./professor-brew-fixtures-v4-2-v1";
import { DEFAULT_WIN_PREFERENCE_V415 } from "./professor-win-preference-v4-15-v1";
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import {
  DEFAULT_PROFESSOR_BREW_BRACKET,
  parseProfessorBrewBracket,
} from "./professor-brew-bracket-v4-v1";
import {
  createProfessorBrewSessionV42,
  dispatchProfessorBrewActionV42,
  tryResolveCommanderSelection,
} from "./professor-brew-service-v4-2-v1";
import { professorBrewShouldContinueAutoBuildV47 } from "./professor-brew-progress-v4-7-v1";

export const PROFESSOR_BREW_AUTO_BUILD_V4_3_V1_VERSION = "professor-brew-auto-build-v4-3-v1";

export type ProfessorBrewConfigureInputV43 = {
  mode?: BrewSessionModeV42;
  storeSlug: string;
  commanderName: string;
  commanderSlug: string;
  bracket?: CommanderBracket;
  archetypeChoiceId?: string;
  archetypeIntent?: string;
  relationshipChoiceId?: string;
  relationshipLens?: string;
  relationshipIntent?: string;
  winPreferenceChoiceId?: string;
  winPreferenceIntent?: string;
};

function defaultForkId(session: BrewSessionV42): string {
  return session.workingDeckTheory?.userDirectionForks?.[0]?.forkId ?? "fork-a";
}

export async function configureAndStartProfessorBrewV43(
  input: ProfessorBrewConfigureInputV43,
): Promise<BrewSessionViewV42 | { error: string }> {
  const mode = input.mode ?? "live";
  const created = createProfessorBrewSessionV42({ mode });
  const sessionId = created.session.sessionId;

  let view: BrewSessionViewV42 | { error: string } = await dispatchProfessorBrewActionV42(sessionId, {
    type: "SET_STORE_SLUG",
    storeSlug: input.storeSlug,
  });
  if ("error" in view) return view;

  const bracket = parseProfessorBrewBracket(input.bracket ?? DEFAULT_PROFESSOR_BREW_BRACKET);
  view = await dispatchProfessorBrewActionV42(sessionId, { type: "SET_BRACKET", bracket });
  if ("error" in view) return view;

  const resolved = await tryResolveCommanderSelection(input.commanderName, input.commanderSlug, bracket);
  if (!resolved.ok) return { error: resolved.message };

  view = await dispatchProfessorBrewActionV42(sessionId, resolved.action);
  if ("error" in view) return view;

  const archetypeId = input.archetypeChoiceId ?? DEFAULT_ARCHETYPE_CHOICE_V42.id;
  const archetypeIntent = input.archetypeIntent ?? DEFAULT_ARCHETYPE_CHOICE_V42.userIntentPatch;
  const relationshipId = input.relationshipChoiceId ?? DEFAULT_RELATIONSHIP_CHOICE_V42.id;
  const relationshipLens = input.relationshipLens ?? DEFAULT_RELATIONSHIP_CHOICE_V42.lens;
  const relationshipIntent = input.relationshipIntent ?? DEFAULT_RELATIONSHIP_CHOICE_V42.userIntentPatch;

  view = await dispatchProfessorBrewActionV42(sessionId, {
    type: "CHOOSE_ARCHETYPE",
    choiceId: archetypeId,
    userIntentPatch: archetypeIntent,
  });
  if ("error" in view) return view;

  view = await dispatchProfessorBrewActionV42(sessionId, {
    type: "CHOOSE_RELATIONSHIP",
    choiceId: relationshipId,
    lens: relationshipLens,
    userIntentPatch: relationshipIntent,
  });
  if ("error" in view) return view;

  const winPreferenceIntent = input.winPreferenceIntent ?? DEFAULT_WIN_PREFERENCE_V415.userIntentPatch;
  if (winPreferenceIntent && !view.session.userIntent.includes(winPreferenceIntent)) {
    view = await dispatchProfessorBrewActionV42(sessionId, {
      type: "APPEND_USER_INTENT",
      userIntentPatch: winPreferenceIntent,
    });
    if ("error" in view) return view;
  }

  return view;
}

export async function autoBuildProfessorDeckV43(
  sessionId: string,
): Promise<BrewSessionViewV42 | { error: string }> {
  let view = await dispatchProfessorBrewActionV42(sessionId, {
    type: "SET_LIVE_STATUS",
    status: "Creative and Research Professors building your deck…",
  });
  if ("error" in view) return view;

  const maxPasses = 12;
  for (let pass = 0; pass < maxPasses; pass++) {
    const session = view.session;

    if (session.discoveryInterrupt) {
      view = await dispatchProfessorBrewActionV42(sessionId, {
        type: "DISCOVERY_CHOICE",
        choiceId: "explore",
      });
      if ("error" in view) return view;
      continue;
    }

    if (session.phase === "USER_FORK") {
      view = await dispatchProfessorBrewActionV42(sessionId, {
        type: "USER_FORK",
        forkId: defaultForkId(session),
      });
      if ("error" in view) return view;
      continue;
    }

    if (session.deckListRevealCount >= session.deckList.length && session.treeRevealStep >= BREW_TREE_MAX_REVEAL_STEP_V42) {
      break;
    }

    if (!session.fixtureCase && !professorBrewShouldContinueAutoBuildV47(session)) {
      break;
    }

    if (session.phase === "COMPLETE" && session.deckListRevealCount >= session.deckList.length && session.treeRevealStep >= BREW_TREE_MAX_REVEAL_STEP_V42) {
      break;
    }

    if (!session.workingDeckTheory) {
      return { error: "Deck theory not seeded — configure brew first." };
    }

    view = await dispatchProfessorBrewActionV42(sessionId, { type: "ADVANCE_TREE" });
    if ("error" in view) return view;
  }

  view = await dispatchProfessorBrewActionV42(sessionId, { type: "SET_LIVE_STATUS", status: null });
  if ("error" in view) return view;

  return dispatchProfessorBrewActionV42(sessionId, { type: "SET_AUTO_BUILD_COMPLETE" });
}
