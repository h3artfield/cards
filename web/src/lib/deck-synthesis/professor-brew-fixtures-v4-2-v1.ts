/**
 * Professor v4.2 brew fixtures — deterministic offline replay from v4.1 milestone artifacts.
 */
import type { ProfessorV41ConversationLoopResultV1 } from "./professor-v4-1-conversation-loop-v1";
import type { CreativeProfessorPass1V4 } from "./professor-creative-pass1-contracts-v4";

export const PROFESSOR_BREW_FIXTURES_V4_2_V1_VERSION = "professor-brew-fixtures-v4-2-v1";

export type BrewFixtureCaseV42 = "meren" | "chatterfang";

export type BrewCommanderFixtureV42 = {
  name: string;
  slug: string;
  fixtureCase: BrewFixtureCaseV42;
  mechanismTruthCaseId: string;
  openingLine: string;
  archetypePrompt: string;
};

export const BREW_COMMANDER_FIXTURES_V42: BrewCommanderFixtureV42[] = [
  {
    name: "Meren of Clan Nel Toth",
    slug: "meren-of-clan-nel-toth",
    fixtureCase: "meren",
    mechanismTruthCaseId: "single-graveyard-meren",
    openingLine:
      "Meren turns the death of your creatures into experience, then uses that experience to turn your graveyard into a recurring toolbox.",
    archetypePrompt: "Before we start laying cards out, what sounds like the most fun way to exploit that?",
  },
  {
    name: "Chatterfang, Squirrel General",
    slug: "chatterfang-squirrel-general",
    fixtureCase: "chatterfang",
    mechanismTruthCaseId: "multi-chatterfang",
    openingLine:
      "Chatterfang turns token creation into Squirrels, then turns Squirrel deaths into resources and scaling payoffs.",
    archetypePrompt: "Squirrel tokens are the fuel — how aggressively do you want to lean into that engine?",
  },
];

export function resolveBrewFixtureCase(commanderName: string): BrewCommanderFixtureV42 | null {
  const lower = commanderName.toLowerCase();
  if (lower.includes("meren")) return BREW_COMMANDER_FIXTURES_V42[0]!;
  if (lower.includes("chatterfang")) return BREW_COMMANDER_FIXTURES_V42[1]!;
  return null;
}

export type BrewArchetypeChoiceV42 = {
  id: string;
  label: string;
  description: string;
  userIntentPatch: string;
};

export const MEREN_ARCHETYPE_CHOICES_V42: BrewArchetypeChoiceV42[] = [
  { id: "toolbox", label: "Graveyard Toolbox", description: "Sacrifice utility creatures and recur them repeatedly.", userIntentPatch: "Graveyard Toolbox" },
  { id: "aristocrats", label: "Aristocrats", description: "Turn creature deaths into damage, cards, mana, and other resources.", userIntentPatch: "Aristocrats" },
  { id: "reanimator", label: "Reanimator", description: "Use the graveyard to cheat powerful creatures into play.", userIntentPatch: "Reanimator" },
  { id: "weird", label: "Something Weird", description: "Look for less conventional ways to exploit the commander.", userIntentPatch: "Something Weird" },
  { id: "professor", label: "Let Professor Decide", description: "Professors pick the most interesting path.", userIntentPatch: "Let Professor Decide" },
];

export const DEFAULT_ARCHETYPE_CHOICE_V42 = MEREN_ARCHETYPE_CHOICES_V42.find((c) => c.id === "professor")!;

export const RELATIONSHIP_CHOICES_V42 = [
  {
    id: "dependent",
    label: "Commander Focus",
    description: "Make the commander the centerpiece. The deck becomes substantially stronger when they're in play.",
    lens: "DEPENDENT_SYNERGY" as const,
    userIntentPatch: "Commander Focus — DEPENDENT_SYNERGY",
  },
  {
    id: "independent",
    label: "Independent Engine",
    description: "Build a strong engine that works by itself, with the commander enhancing it rather than holding it together.",
    lens: "INDEPENDENT_SYNERGY" as const,
    userIntentPatch: "Independent Engine — INDEPENDENT_SYNERGY",
  },
  {
    id: "harmony",
    label: "Interlocking Systems",
    description: "Build independent systems that become much stronger together.",
    lens: "HARMONY" as const,
    userIntentPatch: "Interlocking Systems — HARMONY",
  },
  {
    id: "professor",
    label: "Let Professor Decide",
    description: "Compare paths and show me what's most interesting.",
    lens: "PROFESSOR_DECIDES" as const,
    userIntentPatch: "Let Professor Decide — compare relationship paths",
  },
];

export const DEFAULT_RELATIONSHIP_CHOICE_V42 = RELATIONSHIP_CHOICES_V42.find((c) => c.id === "professor")!;

/** Lazy-load milestone JSON — server-side only via readFileSync in service. */
export type BrewFixtureBundleV42 = {
  fixtureCase: BrewFixtureCaseV42;
  loopResult: ProfessorV41ConversationLoopResultV1;
  creativePass1: CreativeProfessorPass1V4;
};
