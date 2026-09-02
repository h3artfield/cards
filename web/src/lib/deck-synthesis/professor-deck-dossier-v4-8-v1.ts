/**
 * Deterministic pre-review deck dossier for GPT-5.6 Sol Head Professor.
 */
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { DeckCharterV45 } from "./professor-council-state-v4-5-v1";
import type { ProfessorCouncilStateV47 } from "./professor-council-assembly-v4-7-v1";
import {
  computeDeckSnapshotV47,
  evaluateLegalityGateV47,
} from "./professor-council-assembly-v4-7-v1";
import type { WorkingDeckTheoryV4 } from "./professor-working-deck-theory-v4";
import { bracketLabel } from "./professor-brew-bracket-v4-v1";
import { COMMANDER_DECK_LIBRARY_SIZE_V47, COMMANDER_DECK_TOTAL_CARDS_V47 } from "./professor-deck-completion-v4-7-v1";

export const PROFESSOR_DECK_DOSSIER_V4_8_V1_VERSION = "professor-deck-dossier-v4-8-v1";

export type FinalDeckDoctorDossierCardV48 = {
  name: string;
  oracleId: string | null;
  manaValue: number | null;
  typeLine: string | null;
  roles: string[];
  packages: string[];
  commanderDependence: string;
  category: string;
  oracleSummary: string;
};

export type FinalDeckDoctorDossierV48 = {
  version: typeof PROFESSOR_DECK_DOSSIER_V4_8_V1_VERSION;
  generatedAt: string;
  userIntent: string[];
  bracket: CommanderBracket;
  bracketLabel: string;
  playStyle: string;
  commanderRelationship: string;
  commander: {
    name: string;
    oracleId: string | null;
    colorIdentity: string[];
    oracleText: string;
  };
  charter: DeckCharterV45 | null;
  theorySummary: string;
  legalityGate: ReturnType<typeof evaluateLegalityGateV47>;
  structuralMetrics: {
    totalCards: number;
    libraryCards: number;
    landCount: number;
    nonlandCount: number;
    rampCount: number;
    cardAdvantageCount: number;
    interactionCount: number;
    protectionCount: number;
    recoveryCount: number;
    avgManaValue: number;
    commanderDependenceHigh: number;
    commanderDependenceMedium: number;
    commanderDependenceLow: number;
    packageCoverage: string[];
    roleCoverage: Record<string, number>;
    weaknesses: string[];
    structuralFlags: string[];
  };
  cards: FinalDeckDoctorDossierCardV48[];
  councilHistoryCompact: string;
  councilLogSummary: string;
  preReviewRepairs: string[];
};

const MIN_COMMANDER_LANDS = 33;
const WARN_COMMANDER_LANDS = 30;

function avgManaValue(cards: FinalDeckDoctorDossierCardV48[]): number {
  const nonlands = cards.filter((c) => c.category !== "land" && c.category !== "commander");
  if (nonlands.length === 0) return 0;
  const sum = nonlands.reduce((acc, c) => acc + (c.manaValue ?? 0), 0);
  return Math.round((sum / nonlands.length) * 10) / 10;
}

function buildStructuralFlags(args: {
  landCount: number;
  libraryCards: number;
  legalityPass: boolean;
  cardAdvantage: number;
  interaction: number;
  protection: number;
}): string[] {
  const flags: string[] = [];
  if (args.libraryCards !== COMMANDER_DECK_LIBRARY_SIZE_V47) {
    flags.push(`Library incomplete: ${args.libraryCards}/${COMMANDER_DECK_LIBRARY_SIZE_V47} cards`);
  }
  if (!args.legalityPass) flags.push("Legality gate FAIL — unresolved identities or singleton violations");
  if (args.landCount < MIN_COMMANDER_LANDS) {
    flags.push(
      `CRITICAL: Only ${args.landCount} lands in a ${COMMANDER_DECK_LIBRARY_SIZE_V47}-card library — far below Commander baseline (~${MIN_COMMANDER_LANDS}+ lands)`,
    );
  } else if (args.landCount < WARN_COMMANDER_LANDS) {
    flags.push(`WARNING: ${args.landCount} lands may be low for consistent mana in Commander`);
  }
  if (args.landCount > 45) flags.push(`WARNING: ${args.landCount} lands may be excessive for non-ramp-heavy builds`);
  if (args.cardAdvantage < 6) flags.push(`Card advantage coverage thin (${args.cardAdvantage} sources)`);
  if (args.interaction < 5) flags.push(`Interaction suite thin (${args.interaction} pieces)`);
  if (args.protection < 2) flags.push(`Protection/recovery thin (${args.protection} pieces)`);
  return flags;
}

export function summarizeCouncilLogForHeadProfessorV48(state: ProfessorCouncilStateV47): string {
  const lines: string[] = [];

  if (state.deckCharter) {
    const c = state.deckCharter;
    lines.push(
      `Charter: ${c.deckIdentity}. Primary: ${c.primaryStrategy}. Relationship: ${c.commanderRelationship}. Play style: ${c.playStyle}. Win paths: ${c.intendedWinPaths.slice(0, 3).join("; ")}. Avoid: ${c.avoidPatterns.slice(0, 3).join(", ")}.`,
    );
  }

  lines.push("Key council decisions:");
  for (const d of state.councilDecisions.slice(0, 10)) {
    lines.push(`- [${d.phase}] ${d.decision} — ${d.reasoning.slice(0, 140)}`);
  }

  const dialoguePhases = new Set(["PRE_BUILD", "STRATEGY", "SKELETON", "CHECKPOINT", "CUT_REVIEW", "MANA_BASE"]);
  lines.push("Council dialogue highlights:");
  for (const turn of state.conversation.filter((t) => dialoguePhases.has(t.phase)).slice(-18)) {
    lines.push(`- ${turn.speaker} (${turn.phase}): ${turn.message.slice(0, 150)}`);
  }

  lines.push("Recent card changes:");
  for (const d of state.cardDecisions.slice(-12)) {
    lines.push(
      `- ${d.action} ${d.cardName}${d.replacedCardName ? ` → ${d.replacedCardName}` : ""}: ${d.reason.slice(0, 100)}`,
    );
  }

  return lines.join("\n");
}

export function buildFinalDeckDoctorDossierV48(args: {
  commanderName: string;
  commanderOracleId: string | null;
  commanderColorIdentity: string[];
  bracket: CommanderBracket;
  userIntent: string[];
  relationshipLens: string | null;
  charter: DeckCharterV45 | null;
  theory: WorkingDeckTheoryV4 | null;
  councilState: ProfessorCouncilStateV47;
  catalog: DeckResolutionCatalog;
}): FinalDeckDoctorDossierV48 {
  const snapshot = computeDeckSnapshotV47({ state: args.councilState, catalog: args.catalog });
  const legalityGate = evaluateLegalityGateV47({
    state: args.councilState,
    commanderName: args.commanderName,
  });

  const commanderCard = args.commanderOracleId
    ? args.catalog.byOracleId.get(args.commanderOracleId)
    : null;

  const cards: FinalDeckDoctorDossierCardV48[] = args.councilState.selectedCards.map((c) => {
    const golden = c.oracleId ? args.catalog.byOracleId.get(c.oracleId) : null;
    const profile = c.oracleId ? args.councilState.functionalProfiles[c.oracleId] : null;
    const oracleText = (golden?.oracleText ?? "").trim();
    return {
      name: c.name,
      oracleId: c.oracleId,
      manaValue: golden?.manaValue ?? null,
      typeLine: golden?.typeLine ?? null,
      roles: profile?.roles ?? c.roles,
      packages: c.packages,
      commanderDependence: c.commanderDependence,
      category: c.category,
      oracleSummary: oracleText ? oracleText.slice(0, 280) : c.proposalReason ?? "",
    };
  });

  const roleCoverage = snapshot.roleCoverage ?? {};
  const landCount = snapshot.landCount;
  const structuralFlags = buildStructuralFlags({
    landCount,
    libraryCards: args.councilState.selectedCards.length,
    legalityPass: legalityGate.pass,
    cardAdvantage: snapshot.cardAdvantageCoverage ?? 0,
    interaction: snapshot.interactionCoverage ?? 0,
    protection: snapshot.protectionCoverage ?? 0,
  });

  const preReviewRepairs: string[] = [];
  if (args.councilState.selectedCards.length < COMMANDER_DECK_LIBRARY_SIZE_V47) {
    preReviewRepairs.push("Deck not at provisional 100 — mana base phase incomplete");
  }

  const decisions = args.councilState.councilDecisions.slice(-4);
  const mutations = args.councilState.cardDecisions.slice(-6);
  const councilHistoryCompact = [
    "## Council (recent)",
    ...decisions.map((d) => `- ${d.decision}: ${d.reasoning.slice(0, 100)}`),
    ...mutations.map((d) => `- ${d.action} ${d.cardName}${d.replacedCardName ? ` → ${d.replacedCardName}` : ""}`),
  ].join("\n");

  const councilLogSummary = summarizeCouncilLogForHeadProfessorV48(args.councilState);

  return {
    version: PROFESSOR_DECK_DOSSIER_V4_8_V1_VERSION,
    generatedAt: new Date().toISOString(),
    userIntent: args.userIntent,
    bracket: args.bracket,
    bracketLabel: bracketLabel(args.bracket),
    playStyle: args.charter?.playStyle ?? "Let professors decide",
    commanderRelationship: args.relationshipLens ?? args.charter?.commanderRelationship ?? "Harmony",
    commander: {
      name: args.commanderName,
      oracleId: args.commanderOracleId,
      colorIdentity: args.commanderColorIdentity,
      oracleText: (commanderCard?.oracleText ?? "").trim(),
    },
    charter: args.charter,
    theorySummary: args.theory?.thesis.summary ?? "",
    legalityGate,
    structuralMetrics: {
      totalCards: 1 + args.councilState.selectedCards.length,
      libraryCards: args.councilState.selectedCards.length,
      landCount,
      nonlandCount: snapshot.nonlandCount,
      rampCount: snapshot.rampCoverage ?? 0,
      cardAdvantageCount: snapshot.cardAdvantageCoverage ?? 0,
      interactionCount: snapshot.interactionCoverage ?? 0,
      protectionCount: snapshot.protectionCoverage ?? 0,
      recoveryCount: roleCoverage["recovery"] ?? roleCoverage["recursion"] ?? 0,
      avgManaValue: avgManaValue(cards),
      commanderDependenceHigh: snapshot.commanderDependenceDistribution?.high ?? 0,
      commanderDependenceMedium: snapshot.commanderDependenceDistribution?.medium ?? 0,
      commanderDependenceLow: snapshot.commanderDependenceDistribution?.low ?? 0,
      packageCoverage: args.theory?.packages.map((p) => p.name) ?? [],
      roleCoverage,
      weaknesses: snapshot.weaknesses ?? [],
      structuralFlags,
    },
    cards,
    councilHistoryCompact,
    councilLogSummary,
    preReviewRepairs,
  };
}

export function dossierToPromptText(dossier: FinalDeckDoctorDossierV48): string {
  const charter = dossier.charter;
  const cardListPlain = dossier.cards.map((c, i) => `${i + 1}. ${c.name}`).join("\n");

  return [
    "# BUILD BRIEF",
    `Commander: ${dossier.commander.name}`,
    `Color identity: ${dossier.commander.colorIdentity.join("") || "C"}`,
    `Bracket: ${dossier.bracketLabel} · Play style: ${dossier.playStyle}`,
    `Commander relationship: ${dossier.commanderRelationship}`,
    `Player intent: ${dossier.userIntent.join(" · ")}`,
    charter
      ? `Deck identity: ${charter.deckIdentity}\nPrimary strategy: ${charter.primaryStrategy}\nWin paths: ${charter.intendedWinPaths.join("; ")}\nAvoid: ${charter.avoidPatterns.slice(0, 4).join(", ")}`
      : "",
    dossier.theorySummary ? `Theory: ${dossier.theorySummary.slice(0, 500)}` : "",
    "",
    "# COMMANDER ORACLE (authoritative)",
    dossier.commander.oracleText || "(oracle text unavailable)",
    "",
    "# COUNCIL LOG SUMMARY",
    dossier.councilLogSummary,
    "",
    "# STRUCTURAL METRICS",
    `Library ${dossier.structuralMetrics.libraryCards}/99 · Lands ${dossier.structuralMetrics.landCount} · Ramp ${dossier.structuralMetrics.rampCount} · Draw ${dossier.structuralMetrics.cardAdvantageCount} · Interaction ${dossier.structuralMetrics.interactionCount}`,
    `Flags: ${dossier.structuralMetrics.structuralFlags.join(" | ") || "none"}`,
    `Legality: ${dossier.legalityGate.pass ? "PASS" : "FAIL — " + dossier.legalityGate.failures.join("; ")}`,
    "",
    "# FULL CARD LIST (99 library — recommend CUT→ADD swaps using exact names below)",
    cardListPlain,
    "",
    "# CARD DETAIL (category · roles · dependence)",
    ...dossier.cards.map(
      (c, i) =>
        `${i + 1}. ${c.name} [${c.category}] MV${c.manaValue ?? "?"} ${c.roles.slice(0, 3).join(",")} ${c.commanderDependence}`,
    ),
  ]
    .filter(Boolean)
    .join("\n");
}
