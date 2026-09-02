/**
 * Functional card profiles v4.7 — roles derived from golden-catalog Oracle text only.
 */
import type { GoldenCatalogOracleCard } from "@/lib/deck-builder/golden-catalog/schemas";
import { combinedGoldenOracleText } from "../../../scripts/lib/load-golden-catalog-index";
import { extractCardFunctionalCapabilities } from "./functional-match-v1";

export const PROFESSOR_FUNCTIONAL_PROFILE_V4_7_V1_VERSION = "professor-functional-profile-v4-7-v1";

export type FunctionalRoleV47 =
  | "ramp"
  | "card-advantage"
  | "interaction"
  | "protection"
  | "recovery"
  | "proliferate"
  | "counter-engine"
  | "counter-payoff"
  | "lifegain-enabler"
  | "lifegain-payoff"
  | "sacrifice-outlet"
  | "token-generation"
  | "finisher"
  | "legendary"
  | "land";

export type FunctionalCardProfileV47 = {
  oracleId: string;
  name: string;
  exactOracleText: string;
  typeLine: string;
  manaValue: number;
  colorIdentity: string[];
  roles: FunctionalRoleV47[];
  mechanics: string[];
  eventsProduced: string[];
  eventsConsumed: string[];
  resourcesProduced: string[];
  resourcesConsumed: string[];
  cardTypes: string[];
  roleCompressionScore: number;
};

function norm(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function inferRolesFromCapabilities(args: {
  caps: ReturnType<typeof extractCardFunctionalCapabilities>;
  oracleText: string;
  typeLine: string;
}): FunctionalRoleV47[] {
  const roles = new Set<FunctionalRoleV47>();
  const text = norm(args.oracleText);
  const tl = norm(args.typeLine);

  if (args.caps.ramp) roles.add("ramp");
  if (args.caps.cardDraw) roles.add("card-advantage");
  if (/destroy target|exile target|damage target|return target .* to/.test(text)) roles.add("interaction");
  if (/counter target spell/.test(text)) roles.add("interaction");
  if (
    /indestructible|hexproof|protection from|prevent all damage|can't be destroyed|phase out/.test(text) ||
    /gain hexproof|gain indestructible|hexproof and indestructible|permanents you control gain/.test(text)
  ) {
    roles.add("protection");
  }
  if (/return .* from .* graveyard|reanimate|from your graveyard to/.test(text)) roles.add("recovery");
  if (args.caps.counterActions.some((c) => c.action === "MULTIPLY_COUNTER")) {
    roles.add("proliferate");
  }
  if (args.caps.counterActions.some((c) => c.action === "PLACE_COUNTER")) roles.add("counter-engine");
  if (/\+1\/\+1 counter/.test(text) && /whenever|each time|for each|power .* toughness/.test(text)) {
    roles.add("counter-payoff");
  }
  if (/you gain .* life|lifelink/.test(text) && !/pay .* life.* draw/.test(text)) {
    if (/whenever .* gains life|whenever you gain life/.test(text)) roles.add("lifegain-payoff");
    else roles.add("lifegain-enabler");
  }
  if (/pay .* life.* draw|whenever you gain life, draw/.test(text)) {
    roles.add("lifegain-payoff");
    roles.add("card-advantage");
  }
  if (args.caps.sacrificeOutlet) roles.add("sacrifice-outlet");
  if (args.caps.tokenGeneration) roles.add("token-generation");
  if (/you win the game|can't be blocked|extra turn/.test(text)) roles.add("finisher");
  if (/legendary/.test(tl)) roles.add("legendary");
  if (/\bland\b/.test(tl) && !/\bcreature\b|\bartifact\b|\benchantment\b/.test(tl)) roles.add("land");

  return [...roles];
}

export function buildFunctionalCardProfileV47(card: GoldenCatalogOracleCard): FunctionalCardProfileV47 {
  const exactOracleText = combinedGoldenOracleText(card);
  const caps = extractCardFunctionalCapabilities(exactOracleText, card.typeLine ?? "");
  const roles = inferRolesFromCapabilities({ caps, oracleText: exactOracleText, typeLine: card.typeLine ?? "" });
  const mechanics: string[] = [];
  if (caps.counterActions.some((c) => c.action === "MULTIPLY_COUNTER")) {
    mechanics.push("proliferate");
  }
  if (caps.counterActions.some((c) => c.action === "PLACE_COUNTER")) mechanics.push("place_counters");
  if (caps.cardDraw) mechanics.push("draw_cards");
  if (caps.ramp) mechanics.push("mana_acceleration");
  if (caps.sacrificeOutlet) mechanics.push("sacrifice");
  if (caps.tokenGeneration) mechanics.push("tokens");

  const eventsProduced: string[] = [];
  if (roles.includes("lifegain-enabler")) eventsProduced.push("life_gain");
  if (roles.includes("counter-engine") || roles.includes("proliferate")) eventsProduced.push("counter_change");
  if (roles.includes("sacrifice-outlet")) eventsProduced.push("sacrifice");
  if (roles.includes("token-generation")) eventsProduced.push("token_creation");

  const cardTypes = (card.typeLine ?? "")
    .split(/[—\-]/)
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    oracleId: card.oracleId,
    name: card.canonicalName,
    exactOracleText,
    typeLine: card.typeLine ?? "",
    manaValue: card.manaValue ?? 0,
    colorIdentity: card.colorIdentity ?? [],
    roles,
    mechanics,
    eventsProduced,
    eventsConsumed: [],
    resourcesProduced: eventsProduced,
    resourcesConsumed: [],
    cardTypes,
    roleCompressionScore: roles.length,
  };
}

export function roleCoverageFromProfiles(profiles: FunctionalCardProfileV47[]): Record<string, number> {
  const coverage: Record<string, number> = {};
  for (const profile of profiles) {
    for (const role of profile.roles) {
      coverage[role] = (coverage[role] ?? 0) + 1;
    }
  }
  return coverage;
}
