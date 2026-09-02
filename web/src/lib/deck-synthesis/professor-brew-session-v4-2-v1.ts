/**
 * Professor v4.2 brew session — RPG conversation + incremental Working Deck Theory state machine.
 */
import { reverseSearchFromMechanicV4 } from "./professor-abstraction-levels-v4";
import { moveIdeaLaneV4 } from "./professor-idea-board-v4";
import type { ResearchMessageV4 } from "./professor-research-message-v4";
import type { WorkingDeckTheoryV4, UserDirectionForkV4 } from "./professor-working-deck-theory-v4";
import { applyWorkingDeckTheoryPatchesV4 } from "./professor-working-deck-theory-v4";
import type { ProfessorV41ConversationLoopResultV1 } from "./professor-v4-1-conversation-loop-v1";
import type { BrewFixtureCaseV42 } from "./professor-brew-fixtures-v4-2-v1";
import { MEREN_ARCHETYPE_CHOICES_V42, RELATIONSHIP_CHOICES_V42, type BrewArchetypeChoiceV42 } from "./professor-brew-fixtures-v4-2-v1";
import { projectBrewTreeV42 } from "./professor-brew-tree-v4-2-v1";
import { buildProfessorDeckListV43 } from "./professor-brew-deck-list-v4-3-v1";
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import { DEFAULT_PROFESSOR_BREW_BRACKET } from "./professor-brew-bracket-v4-v1";
import { buildCollaborativeCouncilStateV45, deriveTreeGrowthLineFromTheory } from "./professor-council-orchestrator-v4-5-v1";
import { deckListFromCouncilStateV47 } from "./professor-council-assembly-v4-7-v1";
import { isDraftReadyV47, countCommittedDeckCardsV47, COMMANDER_DECK_TOTAL_CARDS_V47 } from "./professor-deck-completion-v4-7-v1";
import type { ProfessorCouncilStateV47 } from "./professor-council-assembly-v4-7-v1";
import type { ProfessorDeckFinalReportV48 } from "./professor-deck-final-report-v4-8-v1";
import type { ProfessorDeckGradeV4 } from "./professor-deck-grade-v4-v1";
import type { FinalDeckDoctorSessionV48 } from "./professor-final-deck-doctor-v4-8-v1";
import {
  PROFESSOR_BREW_SESSION_V4_2_V1_VERSION,
  PROFESSOR_V4_2_DECISION_V1,
  type BrewCostBudgetV42,
  type BrewDialogueChoiceV42,
  type BrewDiscoveryInterruptV42,
  type BrewProfessorLineV42,
  type BrewSessionModeV42,
  type BrewSessionPhaseV42,
  type BrewSessionV42,
  type BrewSessionViewV42,
  type BrewSessionCouncilStateV42,
} from "./professor-brew-session-types-v4-2-v1";
import { BREW_TREE_MAX_REVEAL_STEP_V42, getBrewDialogueChoicesV42 } from "./professor-brew-session-client-v4-2-v1";

export {
  PROFESSOR_BREW_SESSION_V4_2_V1_VERSION,
  PROFESSOR_V4_2_DECISION_V1,
  BREW_TREE_MAX_REVEAL_STEP_V42,
  getBrewDialogueChoicesV42,
};
export type {
  BrewSessionModeV42,
  BrewSessionPhaseV42,
  BrewDialogueChoiceV42,
  BrewProfessorLineV42,
  BrewCostBudgetV42,
  BrewDiscoveryInterruptV42,
  BrewSessionV42,
  BrewSessionViewV42,
} from "./professor-brew-session-types-v4-2-v1";

function emptyBudget(): BrewCostBudgetV42 {
  return {
    creativePass1Max: 1,
    researchCallsMax: 6,
    creativeRevisitMax: 1,
    creativePass1Used: 0,
    researchCallsUsed: 0,
    creativeRevisitUsed: 0,
  };
}

export function createBrewSessionV42(args: { sessionId: string; mode: BrewSessionModeV42 }): BrewSessionV42 {
  return {
    version: PROFESSOR_BREW_SESSION_V4_2_V1_VERSION,
    decision: PROFESSOR_V4_2_DECISION_V1,
    sessionId: args.sessionId,
    mode: args.mode,
    phase: "COMMANDER_SELECT",
    fixtureCase: null,
    commanderName: null,
    commanderSlug: null,
    commanderOracleId: null,
    commanderColorIdentity: [],
    bracket: DEFAULT_PROFESSOR_BREW_BRACKET,
    archetypeChoices: [],
    userIntent: [],
    relationshipLens: null,
    workingDeckTheory: null,
    loopResult: null,
    treeRevealStep: 0,
    verifiedPackageIds: [],
    cardStatusOverrides: {},
    professorLines: [],
    pendingChoices: [],
    discoveryInterrupt: null,
    warrantCreativeRevisit: false,
    selectedTreeNodeId: null,
    costBudget: emptyBudget(),
    journalEntries: [],
    cardImageUrls: {},
    mechanismTruthCaseId: null,
    liveStatus: null,
    autoBuildComplete: false,
    deckList: [],
    deckListRevealCount: 0,
    storeSlug: null,
    inStockNames: [],
    councilState: null,
    finalReport: null,
    deckGrade: null,
    finalDeckDoctor: null,
  };
}

function merenDefaultForks(): UserDirectionForkV4[] {
  return [
    {
      forkId: "fork-a",
      label: "A. Recursive control",
      description: "Lean into proven recursion and experience thresholds.",
      whyInteresting: "High mechanical confidence.",
      conventionality: "CONVENTIONAL",
      commanderDependence: "HIGH",
      mechanicalConfidence: "HIGH",
      expectedPlayStyle: "Grindy value engine.",
    },
    {
      forkId: "fork-b",
      label: "B. Self-sacrifice toolbox",
      description: "Creatures perform jobs and sacrifice themselves for recursion.",
      whyInteresting: "Flexible interaction.",
      conventionality: "MODERATE",
      commanderDependence: "MEDIUM",
      mechanicalConfidence: "MEDIUM",
      expectedPlayStyle: "Interactive midrange.",
    },
    {
      forkId: "fork-c",
      label: "C. Strange reset engine",
      description: "Permanents with drawbacks become attractive when reset repeatedly.",
      whyInteresting: "Unconventional sequencing.",
      conventionality: "UNCONVENTIONAL",
      commanderDependence: "MEDIUM",
      mechanicalConfidence: "MEDIUM",
      expectedPlayStyle: "Synergy-heavy engine.",
    },
  ];
}

function defaultForksFromTheory(theory: WorkingDeckTheoryV4): UserDirectionForkV4[] {
  return theory.packages.slice(0, 3).map((pkg, index) => ({
    forkId: `fork-${index + 1}`,
    label: `${String.fromCharCode(65 + index)}. ${pkg.name}`,
    description: pkg.purpose,
    whyInteresting: pkg.notes[0] ?? pkg.purpose,
    conventionality: index === 0 ? "CONVENTIONAL" : index === 1 ? "MODERATE" : "UNCONVENTIONAL",
    commanderDependence: pkg.commanderDependence,
    mechanicalConfidence: pkg.commanderDependence === "HIGH" ? "HIGH" : "MEDIUM",
    expectedPlayStyle: pkg.purpose.slice(0, 80),
  }));
}

function resolveDefaultForks(session: BrewSessionV42, theory: WorkingDeckTheoryV4): UserDirectionForkV4[] {
  if (session.fixtureCase === "meren") return merenDefaultForks();
  if (theory.userDirectionForks?.length) return theory.userDirectionForks;
  const fromPackages = defaultForksFromTheory(theory);
  return fromPackages.length > 0 ? fromPackages : merenDefaultForks();
}

export function buildSessionViewV42(session: BrewSessionV42): BrewSessionViewV42 {
  if (!session.workingDeckTheory) {
    return { session, tree: null };
  }
  const discoveryPattern = session.loopResult?.scoredDiscoveries.find((d) =>
    d.mechanicalPattern.includes("CROSS_RESOURCE"),
  )?.mechanicalPattern;
  const tree = projectBrewTreeV42({
    theory: session.workingDeckTheory,
    revealStep: session.treeRevealStep,
    verifiedPackageIds: new Set(session.verifiedPackageIds),
    discoveryPattern: session.discoveryInterrupt ? discoveryPattern ?? "CROSS_RESOURCE" : null,
    cardOverrides: session.cardStatusOverrides,
    cardImageUrls: session.cardImageUrls,
  });
  return { session, tree };
}

function pushLine(session: BrewSessionV42, body: string, intent?: ResearchMessageV4["intent"]): BrewProfessorLineV42[] {
  return [
    ...session.professorLines,
    { lineId: `line-${session.professorLines.length + 1}`, speaker: "PROFESSOR", body, intent },
  ];
}

function withTreeGrowthChoiceV42(session: BrewSessionV42): BrewSessionV42 {
  if (session.pendingChoices.length > 0) return session;
  const choices = getBrewDialogueChoicesV42(session);
  const growth = choices.find((choice) => choice.action === "ADVANCE_TREE");
  if (!growth) return session;
  return { ...session, pendingChoices: [growth] };
}

export type BrewSessionActionV42 =
  | {
      type: "SELECT_COMMANDER";
      commanderName: string;
      commanderSlug: string;
      oracleId: string;
      colorIdentity: string[];
      mechanismTruthCaseId: string;
      fixtureCase: BrewFixtureCaseV42 | null;
      openingLine: string;
      archetypeChoices: BrewArchetypeChoiceV42[];
      commanderImageUrl?: string;
      bracket?: CommanderBracket;
    }
  | { type: "SET_BRACKET"; bracket: CommanderBracket }
  | { type: "CONTINUE" }
  | { type: "CHOOSE_ARCHETYPE"; choiceId: string; userIntentPatch: string }
  | { type: "CHOOSE_RELATIONSHIP"; choiceId: string; lens: string; userIntentPatch: string }
  | { type: "APPEND_USER_INTENT"; userIntentPatch: string }
  | { type: "ADVANCE_TREE" }
  | { type: "DISCOVERY_CHOICE"; choiceId: string }
  | { type: "USER_FORK"; forkId: string }
  | { type: "SELECT_TREE_NODE"; nodeId: string | null }
  | { type: "CARD_ACTION"; nodeId: string; action: "KEEP" | "REMOVE" | "FIND_ALTERNATIVE" | "FIND_WEIRDER" }
  | { type: "RECONSIDER_IDEA"; ideaId: string }
  | { type: "HYDRATE_LOOP"; loopResult: ProfessorV41ConversationLoopResultV1; cardImageUrls?: Record<string, string> }
  | { type: "SET_LIVE_STATUS"; status: string | null }
  | { type: "APPEND_PROFESSOR_LINE"; body: string; intent?: ResearchMessageV4["intent"] }
  | { type: "MERGE_CARD_IMAGES"; cardImageUrls: Record<string, string> }
  | { type: "SET_STORE_SLUG"; storeSlug: string }
  | { type: "SET_IN_STOCK_NAMES"; inStockNames: string[] }
  | { type: "SET_AUTO_BUILD_COMPLETE" }
  | {
      type: "SYNC_COUNCIL_ASSEMBLY";
      councilState: ProfessorCouncilStateV47;
      deckList: { name: string; category: string }[];
      deckListRevealCount?: number;
    }
  | { type: "RUN_FINAL_REVIEW" }
  | { type: "RUN_MANA_BASE" }
  | { type: "RUN_BRACKET_RESEARCH" }
  | { type: "SET_FINAL_REPORT"; finalReport: ProfessorDeckFinalReportV48 }
  | {
      type: "SET_FINALIZATION_V48";
      finalReport: ProfessorDeckFinalReportV48;
      deckGrade: ProfessorDeckGradeV4;
      finalDeckDoctor: FinalDeckDoctorSessionV48;
      councilState: BrewSessionCouncilStateV42;
      deckList: { name: string; category: string }[];
    }
  | {
      type: "SET_FINALIZATION_FAILED_V48";
      finalDeckDoctor: FinalDeckDoctorSessionV48;
      councilState: BrewSessionCouncilStateV42;
      error: string;
    }
  | {
      type: "START_GRADE_IMPROVEMENT";
      optionId: string;
      categoryId: string;
      label: string;
      description: string;
      professorLine?: string;
    };

export function applyBrewSessionActionV42(
  session: BrewSessionV42,
  action: BrewSessionActionV42,
): BrewSessionV42 {
  switch (action.type) {
    case "SELECT_COMMANDER": {
      const cardImageUrls = { ...session.cardImageUrls };
      if (action.commanderImageUrl) {
        cardImageUrls[action.commanderName] = action.commanderImageUrl;
      }
      const bracket = action.bracket ?? session.bracket;
      return {
        ...session,
        phase: "OPENING_DIALOGUE",
        fixtureCase: action.fixtureCase,
        commanderName: action.commanderName,
        commanderSlug: action.commanderSlug,
        commanderOracleId: action.oracleId,
        commanderColorIdentity: action.colorIdentity,
        bracket,
        archetypeChoices: action.archetypeChoices,
        mechanismTruthCaseId: action.mechanismTruthCaseId,
        cardImageUrls,
        professorLines: pushLine(session, action.openingLine),
        pendingChoices: [{ choiceId: "continue-opening", label: "Continue", action: "CONTINUE" }],
        journalEntries: [...session.journalEntries, `Brew started with ${action.commanderName} at bracket ${bracket}.`],
      };
    }
    case "SET_BRACKET": {
      return {
        ...session,
        bracket: action.bracket,
        journalEntries: [...session.journalEntries, `Target bracket: ${action.bracket}`],
      };
    }
    case "CONTINUE": {
      if (session.phase === "OPENING_DIALOGUE") {
        const archetypeChoices =
          session.archetypeChoices.length > 0 ? session.archetypeChoices : MEREN_ARCHETYPE_CHOICES_V42;
        return {
          ...session,
          phase: "ARCHETYPE_CHOICE",
          professorLines: pushLine(
            session,
            "Before we start laying cards out, what sounds like the most fun way to exploit that?",
          ),
          pendingChoices: archetypeChoices.map((c) => ({
            choiceId: c.id,
            label: c.label,
            description: c.description,
            action: "CHOOSE_ARCHETYPE",
            meta: { userIntentPatch: c.userIntentPatch },
          })),
        };
      }
      if (session.phase === "COMPLETE") return session;
      return session;
    }
    case "CHOOSE_ARCHETYPE": {
      return {
        ...session,
        phase: "RELATIONSHIP_CHOICE",
        userIntent: [...session.userIntent, action.userIntentPatch],
        professorLines: pushLine(
          session,
          `Good — we'll steer toward ${action.userIntentPatch}. How much should this deck depend on ${session.commanderName?.split(" ").slice(-2).join(" ") ?? "your commander"}?`,
        ),
        pendingChoices: RELATIONSHIP_CHOICES_V42.map((c) => ({
          choiceId: c.id,
          label: c.label,
          description: c.description,
          action: "CHOOSE_RELATIONSHIP",
          meta: { lens: c.lens, userIntentPatch: c.userIntentPatch },
        })),
        journalEntries: [...session.journalEntries, `Archetype: ${action.userIntentPatch}`],
      };
    }
    case "CHOOSE_RELATIONSHIP": {
      const treeLine =
        session.mode === "live"
          ? "Got it — I'll build a thesis from this commander's mechanics. One moment…"
          : "Let's grow the deck from here — watch the tree.";
      const bracketIntent = `Bracket ${session.bracket}`;
      const userIntent = session.userIntent.includes(action.userIntentPatch)
        ? session.userIntent.includes(bracketIntent)
          ? session.userIntent
          : [...session.userIntent, bracketIntent]
        : [...session.userIntent, action.userIntentPatch, bracketIntent];
      return withTreeGrowthChoiceV42({
        ...session,
        phase: "TREE_GROWING",
        relationshipLens: action.lens,
        userIntent,
        professorLines: pushLine(session, treeLine),
        pendingChoices: [],
        journalEntries: [...session.journalEntries, `Relationship: ${action.lens}`],
        costBudget: { ...session.costBudget, creativePass1Used: session.mode === "live" ? 0 : 1 },
      });
    }
    case "APPEND_USER_INTENT": {
      if (session.userIntent.includes(action.userIntentPatch)) return session;
      return {
        ...session,
        userIntent: [...session.userIntent, action.userIntentPatch],
        journalEntries: [...session.journalEntries, `Win preference: ${action.userIntentPatch}`],
      };
    }
    case "HYDRATE_LOOP": {
      const lr = action.loopResult;
      let theory = lr.workingDeckTheory;
      if (!theory.userDirectionForks?.length) {
        const forks = resolveDefaultForks(session, theory);
        theory = applyWorkingDeckTheoryPatchesV4({
          theory,
          author: "RESEARCH_PROFESSOR",
          summary: session.fixtureCase === "meren" ? "Default strategic forks for user direction." : "Strategic forks derived from deck packages.",
          patches: [
            {
              op: "SET_CONVERSATION_STATE",
              state: theory.conversationState,
              userDirectionForks: forks,
            },
          ],
          preservedReasoning: [],
        });
      }
      for (const intent of session.userIntent) {
        if (!theory.userIntent.includes(intent)) {
          theory = applyWorkingDeckTheoryPatchesV4({
            theory,
            author: "USER",
            summary: `User intent: ${intent}`,
            patches: [],
            preservedReasoning: [intent],
          });
        }
      }
      const councilState =
        session.commanderName && !session.fixtureCase
          ? buildCollaborativeCouncilStateV45({
              context: {
                commanderName: session.commanderName,
                bracket: session.bracket,
                userIntent: session.userIntent,
                relationshipLens: session.relationshipLens,
                playStyle: session.userIntent.find((i) => !i.startsWith("Bracket") && !i.includes("SYNERGY")) ?? "Let professors decide",
                commanderRelationship: session.relationshipLens ?? "HARMONY",
                fixtureCase: session.fixtureCase,
              },
              loopResult: lr,
              theory,
            })
          : session.councilState;

      const deckList =
        councilState && councilState.selectedCards.length > 0 && session.commanderName
          ? deckListFromCouncilStateV47({ state: councilState, commanderName: session.commanderName }).map((c) => ({
              name: c.name,
              category: c.category,
            }))
          : session.commanderName
            ? [{ name: session.commanderName, category: "commander" }]
            : buildProfessorDeckListV43({
                fixtureCase: session.fixtureCase,
                theory,
                colorIdentity: session.commanderColorIdentity,
              }).map((c) => ({
                name: c.name,
                category: c.category,
              }));

      return withTreeGrowthChoiceV42({
        ...session,
        workingDeckTheory: theory,
        loopResult: lr,
        councilState,
        warrantCreativeRevisit: lr.warrantCreativeRevisit,
        treeRevealStep: 1,
        deckList,
        deckListRevealCount: deckList.length > 0 ? 1 : 0,
        cardImageUrls: { ...session.cardImageUrls, ...(action.cardImageUrls ?? {}) },
        costBudget: {
          ...session.costBudget,
          creativePass1Used: session.costBudget.creativePass1Used || 1,
          researchCallsUsed: Math.min(session.costBudget.researchCallsMax, lr.selectedResearchModes.length),
        },
        liveStatus: null,
      });
    }
    case "SET_LIVE_STATUS": {
      return { ...session, liveStatus: action.status };
    }
    case "APPEND_PROFESSOR_LINE": {
      return {
        ...session,
        professorLines: pushLine(session, action.body, action.intent),
        costBudget: {
          ...session.costBudget,
          researchCallsUsed: Math.min(
            session.costBudget.researchCallsMax,
            session.costBudget.researchCallsUsed + 1,
          ),
        },
      };
    }
    case "MERGE_CARD_IMAGES": {
      return { ...session, cardImageUrls: { ...session.cardImageUrls, ...action.cardImageUrls } };
    }
    case "SET_STORE_SLUG": {
      return { ...session, storeSlug: action.storeSlug };
    }
    case "SET_IN_STOCK_NAMES": {
      return { ...session, inStockNames: action.inStockNames };
    }
    case "SYNC_COUNCIL_ASSEMBLY": {
      return {
        ...session,
        councilState: action.councilState,
        deckList: action.deckList,
        deckListRevealCount: action.deckListRevealCount ?? session.deckListRevealCount,
      };
    }
    case "SET_FINALIZATION_V48": {
      return {
        ...session,
        finalReport: action.finalReport,
        deckGrade: action.deckGrade,
        finalDeckDoctor: action.finalDeckDoctor,
        councilState: action.councilState,
        deckList: action.deckList,
        deckListRevealCount: action.deckList.length,
      };
    }
    case "SET_FINALIZATION_FAILED_V48": {
      return {
        ...session,
        finalReport: null,
        deckGrade: null,
        finalDeckDoctor: action.finalDeckDoctor,
        councilState: action.councilState,
      };
    }
    case "SET_FINAL_REPORT": {
      return { ...session, finalReport: action.finalReport };
    }
    case "SET_AUTO_BUILD_COMPLETE": {
      const council = session.councilState;
      const committed = council
        ? countCommittedDeckCardsV47({ selectedNonCommanderCount: council.selectedCards.length })
        : session.deckList.length;
      const draftReady =
        (session.finalReport?.status === "COMPLETE" &&
          session.deckGrade !== null &&
          session.finalDeckDoctor?.headProfessorCallCompleted) ||
        (council
          ? isDraftReadyV47({ buildPhase: council.buildPhase ?? "BUILDING", legalityGate: council.legalityGate ?? null }) &&
            session.deckGrade !== null &&
            session.finalDeckDoctor?.headProfessorCallCompleted
          : committed >= COMMANDER_DECK_TOTAL_CARDS_V47 && session.fixtureCase !== null);
      if (!draftReady && !session.fixtureCase) {
        return session;
      }
      return {
        ...session,
        autoBuildComplete: true,
        phase: "COMPLETE",
        deckListRevealCount: session.deckList.length,
        pendingChoices: [],
        discoveryInterrupt: null,
        liveStatus: null,
      };
    }
    case "START_GRADE_IMPROVEMENT": {
      if (action.optionId === "improve-happy") {
        return {
          ...session,
          professorLines: pushLine(session, "Sounds good — swap any card you want, or download the list when you're ready."),
          pendingChoices: [],
        };
      }
      const improvementLine =
        action.professorLine ??
        `${action.description} I'll investigate ${action.label.toLowerCase()} and propose targeted changes.`;
      return {
        ...session,
        phase: "RESEARCH_ACTIVE",
        professorLines: pushLine(session, improvementLine, "PROPOSAL"),
        pendingChoices: [
          { choiceId: "grade-advance", label: "Show me what you found", action: "ADVANCE_TREE" },
          { choiceId: "grade-fork-weird", label: "Find something stranger", action: "USER_FORK", meta: { forkId: "weird" } },
          { choiceId: "grade-done", label: "I'm happy with the deck", action: "CONTINUE" },
        ],
        journalEntries: [...session.journalEntries, `Grade improvement: ${action.label}`],
      };
    }
    case "ADVANCE_TREE": {
      const nextStep = session.treeRevealStep + 1;
      const deckBatch = session.deckList.length > 0 ? Math.max(10, Math.ceil(session.deckList.length / 8)) : 0;
      let next = {
        ...session,
        treeRevealStep: nextStep,
        deckListRevealCount: Math.min(session.deckList.length, session.deckListRevealCount + deckBatch),
        pendingChoices: [] as BrewDialogueChoiceV42[],
      };
      const lines: BrewProfessorLineV42[] = [...next.professorLines];

      if (nextStep === 2) {
        const body =
          next.fixtureCase === "chatterfang"
            ? "Those engines branch from how token creation turns into Squirrel fuel and sacrifice payoffs."
            : next.fixtureCase === "meren"
              ? "Those deaths are doing two things for us — experience and graveyard setup."
              : deriveTreeGrowthLineFromTheory(next.workingDeckTheory, 2);
        lines.push({
          lineId: `line-${lines.length + 1}`,
          speaker: "PROFESSOR",
          body,
        });
      }
      if (nextStep === 3) {
        lines.push({
          lineId: `line-${lines.length + 1}`,
          speaker: "PROFESSOR",
          body: next.fixtureCase ? "I'm laying out the packages that implement each engine." : deriveTreeGrowthLineFromTheory(next.workingDeckTheory, 3),
        });
      }
      if (nextStep === 4) {
        lines.push({
          lineId: `line-${lines.length + 1}`,
          speaker: "PROFESSOR",
          body: next.fixtureCase ? "Cards are attaching to branches. Click any card to see why it's here." : deriveTreeGrowthLineFromTheory(next.workingDeckTheory, 4),
        });
        next = {
          ...next,
          phase: "RESEARCH_ACTIVE",
          verifiedPackageIds: next.loopResult?.selectedResearchModes.includes("MECHANIC")
            ? next.workingDeckTheory?.packages.slice(0, 2).map((p) => p.packageId) ?? []
            : next.verifiedPackageIds,
        };
      }
      if (nextStep >= 4 && next.fixtureCase === "meren") {
        lines.push({
          lineId: `line-${lines.length + 1}`,
          speaker: "PROFESSOR",
          body: "I've verified the death → experience → recursion chain. The core engine looks stable — we can keep brewing quietly.",
          intent: "CONFIRM",
        });
        next = {
          ...next,
          phase: "COMPLETE",
          pendingChoices: [
            { choiceId: "keep-brewing", label: "Keep Brewing", action: "CONTINUE" },
            { choiceId: "change-course", label: "Find Something Stranger", action: "USER_FORK", meta: { forkId: "weird" } },
          ],
        };
      }
      if (nextStep >= 4 && next.fixtureCase === "chatterfang" && !next.discoveryInterrupt) {
        next = {
          ...next,
          phase: "DISCOVERY_INTERRUPT",
          discoveryInterrupt: {
            interruptId: "disc-1",
            headline: "Hold on — I found something.",
            body:
              "We're already creating tokens. I found that one token event can produce two resource classes — the original token type plus Squirrel creatures. That could feed both a value engine and a sacrifice engine from the same trigger.",
            mechanicalPattern: "TOKEN_CREATION_CROSS_RESOURCE:MODIFY_TOKEN_CREATION_PRESERVES_ORIGINAL",
            choices: [
              { choiceId: "show-me", label: "Show me", action: "DISCOVERY_CHOICE" },
              { choiceId: "explore", label: "Explore this branch", action: "DISCOVERY_CHOICE" },
              { choiceId: "keep-plan", label: "Keep the current plan", action: "DISCOVERY_CHOICE" },
              { choiceId: "save-weird", label: "Save it as a weird idea", action: "DISCOVERY_CHOICE" },
            ],
          },
          pendingChoices: [],
        };
        lines.push({
          lineId: `line-${lines.length + 1}`,
          speaker: "PROFESSOR",
          body: next.discoveryInterrupt!.body,
          intent: "DISCOVERY",
        });
      }

      return withTreeGrowthChoiceV42({ ...next, professorLines: lines });
    }
    case "DISCOVERY_CHOICE": {
      let theory = session.workingDeckTheory;
      if (!theory) return session;
      if (action.choiceId === "show-me" || action.choiceId === "explore") {
        return {
          ...session,
          treeRevealStep: Math.max(session.treeRevealStep, 5),
          discoveryInterrupt: null,
          phase: "USER_FORK",
          warrantCreativeRevisit: true,
          professorLines: pushLine(
            session,
            "This changes the deck enough that I want to rethink parts of the original plan. See the glowing cross-resource branch?",
            "DISCOVERY",
          ),
          pendingChoices: (theory.userDirectionForks ?? []).slice(0, 3).map((f) => ({
            choiceId: f.forkId,
            label: f.label,
            description: f.description,
            action: "USER_FORK",
          })),
          journalEntries: [...session.journalEntries, "Discovery: cross-resource token engines explored."],
        };
      }
      if (action.choiceId === "save-weird") {
        theory = applyWorkingDeckTheoryPatchesV4({
          theory,
          author: "RESEARCH_PROFESSOR",
          summary: "Saved cross-resource discovery to WEIRD idea board.",
          patches: [],
          preservedReasoning: ["Cross-resource token branch saved as WEIRD"],
        });
        return {
          ...session,
          workingDeckTheory: theory,
          discoveryInterrupt: null,
          phase: "COMPLETE",
          professorLines: pushLine(session, "Saved to Professor's Notebook under Weird Ideas. We can revisit anytime."),
          pendingChoices: [{ choiceId: "keep-brewing", label: "Keep Brewing", action: "CONTINUE" }],
        };
      }
      return {
        ...session,
        discoveryInterrupt: null,
        phase: "COMPLETE",
        professorLines: pushLine(session, "Understood — keeping the conventional token plan for now."),
        pendingChoices: [{ choiceId: "keep-brewing", label: "Keep Brewing", action: "CONTINUE" }],
      };
    }
    case "USER_FORK": {
      const fork = session.workingDeckTheory?.userDirectionForks?.find((f) => f.forkId === action.forkId);
      return {
        ...session,
        phase: "COMPLETE",
        userIntent: fork ? [...session.userIntent, fork.label] : session.userIntent,
        professorLines: pushLine(
          session,
          fork
            ? `Steering research toward ${fork.label}. ${fork.expectedPlayStyle}`
            : "Find something stranger — I'll explore unconventional branches.",
        ),
        pendingChoices: [{ choiceId: "keep-brewing", label: "Keep Brewing", action: "CONTINUE" }],
        journalEntries: [...session.journalEntries, `Branch change: ${fork?.label ?? "explore weird"}`],
      };
    }
    case "SELECT_TREE_NODE": {
      return { ...session, selectedTreeNodeId: action.nodeId };
    }
    case "CARD_ACTION": {
      const overrides = { ...session.cardStatusOverrides };
      if (action.action === "KEEP") overrides[action.nodeId] = "VERIFIED";
      if (action.action === "REMOVE") overrides[action.nodeId] = "CANDIDATE";
      let lines = session.professorLines;
      if (action.action === "FIND_WEIRDER") {
        const reverse = reverseSearchFromMechanicV4({
          query: {
            mechanicSteps: ["sacrifice self", "produces value", "useful when recurred"],
            excludeCardNames: ["Sakura-Tribe Elder"],
          },
          candidatePool: ["Burnished Hart", "Shambling Ghast", "Plaguecrafter", "Caustic Caterpillar"],
        });
        lines = pushLine(
          session,
          `Searching by mechanic, not name similarity. Candidates: ${reverse.candidateCards.join(", ") || "none yet"}.`,
          "ALTERNATIVE",
        );
      }
      if (action.action === "FIND_ALTERNATIVE") {
        lines = pushLine(session, "Searching for alternatives with the same mechanical function…", "ALTERNATIVE");
      }
      return { ...session, cardStatusOverrides: overrides, professorLines: lines };
    }
    case "RECONSIDER_IDEA": {
      if (!session.workingDeckTheory) return session;
      const board = moveIdeaLaneV4({
        board: session.workingDeckTheory.ideaBoard,
        ideaId: action.ideaId,
        lane: "EXPLORE",
        statusReason: "User requested reconsideration.",
      });
      return {
        ...session,
        workingDeckTheory: { ...session.workingDeckTheory, ideaBoard: board },
        professorLines: pushLine(session, "Reopening that branch — I'll investigate again."),
        journalEntries: [...session.journalEntries, `Reconsidering idea ${action.ideaId}`],
      };
    }
    default:
      return session;
  }
}
