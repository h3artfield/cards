/**
 * Professor v4.4 — resolve any Commander via golden catalog for live brew.
 */
import { normalizeOracleName } from "@/lib/deck-builder/golden-catalog/normalize-name";
import { goldenOracleCardIsSoleCommanderPoolCandidate } from "@/lib/deck-builder/commander-pool-eligibility";
import type { GoldenCatalogOracleCard } from "@/lib/deck-builder/golden-catalog/schemas";
import { resolveBenchmarkCommanderName } from "./benchmark-commander-resolver-v1";
import {
  resolveBrewFixtureCase,
  type BrewArchetypeChoiceV42,
  type BrewFixtureCaseV42,
  DEFAULT_ARCHETYPE_CHOICE_V42,
} from "./professor-brew-fixtures-v4-2-v1";
import { getDeckResolutionCatalogRuntime } from "./professor-brew-catalog-runtime-v1";
import { buildProspectiveMechanismCatalogEntry } from "./professor-brew-prospective-truth-v4-4-v1";
import { getImplementedMechanismCatalog } from "../../../scripts/lib/phase6a1-implemented-mechanism-catalog-v1";
import { getPilotMechanismCatalogEntry } from "../../../scripts/lib/phase6a1-spent-pilot-truth-loader-v1";
import type { ImplementedMechanismCatalogEntry } from "../../../scripts/lib/phase6a1-implemented-mechanism-catalog-v1";
import { paperMetaForOracle } from "../../../scripts/lib/load-deck-resolution-catalog";

export const PROFESSOR_BREW_COMMANDER_RESOLVER_V4_4_V1_VERSION = "professor-brew-commander-resolver-v4-4-v1";
export const PROFESSOR_V4_3_ANY_COMMANDER_LIVE_KNOWLEDGE_TEAM_V1 =
  "PROFESSOR_V4_3_ANY_COMMANDER_LIVE_KNOWLEDGE_TEAM_V1_AUTHORIZED";

export type ResolvedProfessorCommanderV44 = {
  canonicalName: string;
  oracleId: string;
  colorIdentity: string[];
  mechanismTruthCaseId: string;
  catalogEntry: ImplementedMechanismCatalogEntry;
  fixtureCase: BrewFixtureCaseV42 | null;
  openingLine: string;
  archetypeChoices: BrewArchetypeChoiceV42[];
  commanderPrimerExpected: boolean;
};

function lookupCatalogCard(catalog: Awaited<ReturnType<typeof getDeckResolutionCatalogRuntime>>, oracleId: string): GoldenCatalogOracleCard | null {
  return catalog.byOracleId.get(oracleId) ?? null;
}

function normalizeNameMatch(a: string, b: string): boolean {
  return normalizeOracleName(a) === normalizeOracleName(b);
}

export function findAdjudicatedMechanismEntry(commanderName: string): ImplementedMechanismCatalogEntry | undefined {
  const normalized = normalizeOracleName(commanderName);
  for (const entry of getImplementedMechanismCatalog()) {
    if (entry.commanders.some((c) => normalizeNameMatch(c, commanderName))) return entry;
  }
  for (const entry of getImplementedMechanismCatalog()) {
    if (entry.commanders.some((c) => normalizeOracleName(c) === normalized)) return entry;
  }
  const pilotIds = ["multi-chatterfang", "multi-yuriko", "multi-zada"];
  for (const caseId of pilotIds) {
    const entry = getPilotMechanismCatalogEntry(caseId);
    if (entry?.commanders.some((c) => normalizeNameMatch(c, commanderName))) return entry;
  }
  return undefined;
}

function buildOpeningLine(card: GoldenCatalogOracleCard): string {
  const oracle = (card.oracleText ?? "").trim();
  const hook = oracle
    ? oracle
        .split("\n")
        .map((line) => line.trim())
        .find(Boolean)
        ?.replace(/\.$/, "")
        ?.slice(0, 220)
    : null;
  if (hook) {
    return `${card.canonicalName} — ${hook}. The interesting question is what kind of engine we want that mechanic to feed.`;
  }
  return `${card.canonicalName} — let's read what this card actually does and build from there.`;
}

function buildArchetypeChoicesFromOracle(card: GoldenCatalogOracleCard): BrewArchetypeChoiceV42[] {
  const text = (card.oracleText ?? "").toLowerCase();
  const typeLine = (card.typeLine ?? "").toLowerCase();
  const choices: BrewArchetypeChoiceV42[] = [];

  const add = (id: string, label: string, description: string, userIntentPatch: string) => {
    if (choices.some((c) => c.id === id)) return;
    choices.push({ id, label, description, userIntentPatch });
  };

  if (/graveyard|from your graveyard|dies|death|persist|undying|unearth|reanimate/.test(text)) {
    add("graveyard", "Graveyard Engine", "Exploit the graveyard as a resource loop.", "Graveyard Engine");
  }
  if (/token|create .* creature token/.test(text)) {
    add("tokens", "Token Strategy", "Build around token creation and payoffs.", "Token Strategy");
  }
  if (/instant|sorcery|spells? you cast|magecraft|storm/.test(text)) {
    add("spells", "Spells Matter", "Center the deck on casting and spell triggers.", "Spells Matter");
  }
  if (/\+1\/\+1 counter|counter on/.test(text)) {
    add("counters", "Counters Build", "Grow and exploit +1/+1 counters.", "Counters Build");
  }
  if (/attack|combat|deals combat damage|power/.test(text) || typeLine.includes("warrior")) {
    add("combat", "Combat Focus", "Pressure the table through combat and combat triggers.", "Combat Focus");
  }
  if (/artifact|treasure|clue|food|equip/.test(text)) {
    add("artifacts", "Artifact Synergy", "Use artifacts as engines, mana, or payoffs.", "Artifact Synergy");
  }
  if (/draw a card|draw cards|discover|investigate|surveil/.test(text)) {
    add("value", "Card Advantage", "Outvalue opponents with draw and selection.", "Card Advantage");
  }
  if (/sacrifice|sacrifices/.test(text)) {
    add("sacrifice", "Sacrifice Engine", "Convert sacrifices into resources and payoffs.", "Sacrifice Engine");
  }

  add("weird", "Something Weird", "Look for less conventional ways to exploit this commander.", "Something Weird");
  add("professor", "Let Professor Decide", "Professors pick the most interesting path.", DEFAULT_ARCHETYPE_CHOICE_V42.userIntentPatch);

  return choices.slice(0, 5);
}

export function auditProfessorBrewCommanderEligibility(
  catalog: Awaited<ReturnType<typeof getDeckResolutionCatalogRuntime>>,
  card: GoldenCatalogOracleCard,
): { ok: true } | { ok: false; message: string } {
  if (!goldenOracleCardIsSoleCommanderPoolCandidate(card)) {
    return {
      ok: false,
      message: `${card.canonicalName} is not eligible as a sole commander (must be a legendary creature or have commander permission text).`,
    };
  }
  const paper = paperMetaForOracle(catalog, card.oracleId);
  if (paper && !paper.paperEligible) {
    return { ok: false, message: `${card.canonicalName} is not paper-eligible in the catalog.` };
  }
  return { ok: true };
}

export async function resolveProfessorBrewCommanderV44(
  commanderName: string,
): Promise<{ ok: true; commander: ResolvedProfessorCommanderV44 } | { ok: false; message: string }> {
  const catalog = await getDeckResolutionCatalogRuntime();
  const audit = resolveBenchmarkCommanderName(catalog, commanderName);
  if (!audit.resolved || !audit.oracleId || audit.ambiguityHardFail) {
    return {
      ok: false,
      message: audit.ambiguityHardFail
        ? `Ambiguous commander name — pick an exact match from search (${commanderName}).`
        : `Could not resolve "${commanderName}" in the golden catalog.`,
    };
  }

  const card = lookupCatalogCard(catalog, audit.oracleId);
  if (!card) {
    return { ok: false, message: `Resolved oracle ID missing from catalog (${audit.oracleId}).` };
  }

  const eligibility = auditProfessorBrewCommanderEligibility(catalog, card);
  if (!eligibility.ok) return eligibility;

  const adjudicated = findAdjudicatedMechanismEntry(card.canonicalName);
  const catalogEntry = adjudicated ?? buildProspectiveMechanismCatalogEntry({ card });
  const fixture = resolveBrewFixtureCase(card.canonicalName);

  return {
    ok: true,
    commander: {
      canonicalName: card.canonicalName,
      oracleId: card.oracleId,
      colorIdentity: [...(card.colorIdentity ?? [])],
      mechanismTruthCaseId: catalogEntry.caseId,
      catalogEntry,
      fixtureCase: fixture?.fixtureCase ?? null,
      openingLine: fixture?.openingLine ?? buildOpeningLine(card),
      archetypeChoices: buildArchetypeChoicesFromOracle(card),
      commanderPrimerExpected: true,
    },
  };
}
