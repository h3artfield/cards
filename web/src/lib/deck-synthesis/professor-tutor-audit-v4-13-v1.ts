/**
 * Tutor audit v4.13 — verify iteration-1 tutor swaps serve this deck.
 */
import { combinedGoldenOracleText } from "../../../scripts/lib/load-golden-catalog-index";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";
import { classifyTutorCardV411 } from "./professor-tutor-discovery-v4-11-v1";
import { findCouncilCardByIdentity } from "./professor-canonical-card-identity-v4-15-1-v1";

export const PROFESSOR_TUTOR_AUDIT_V4_13_V1_VERSION = "professor-tutor-audit-v4-13-v1";

export type TutorAuditEntryV413 = {
  tutorName: string;
  oracleId: string | null;
  reliablyFinds: string[];
  enginePathImproved: string;
  targetSpaceSupported: boolean;
  cardDisadvantageRisk: "LOW" | "MEDIUM" | "HIGH";
  graveyardRequired: boolean;
  graveyardInfrastructurePresent: boolean;
  bracketContribution: "STRONG" | "ADEQUATE" | "WEAK" | "MISPLACED";
  auditVerdict: string;
  recommendReplacement: boolean;
  replacementReason?: string;
};

const ITERATION1_TUTORS = [
  "worldly tutor",
  "finale of devastation",
  "entomb",
  "vampiric tutor",
  "diabolic intent",
];

function deckHasGraveyardPayoff(selected: CouncilCardV46[], catalog: DeckResolutionCatalog): boolean {
  for (const card of selected) {
    const golden = card.oracleId ? catalog.byOracleId.get(card.oracleId) : null;
    if (!golden) continue;
    const text = combinedGoldenOracleText(golden).toLowerCase();
    if (/flashback|unearth|return.*graveyard|from your graveyard|reanimate|dredge/i.test(text)) return true;
  }
  return false;
}

function countSacrificeOutlets(selected: CouncilCardV46[]): number {
  return selected.filter((c) => c.roles.includes("sacrifice-outlet")).length;
}

function countFinishers(selected: CouncilCardV46[]): number {
  return selected.filter((c) => c.roles.includes("finisher") || c.roles.includes("token-generation")).length;
}

export function auditDeckTutorsV413(args: {
  selectedCards: CouncilCardV46[];
  catalog: DeckResolutionCatalog;
  tutorNames?: string[];
}): TutorAuditEntryV413[] {
  const names = args.tutorNames ?? ITERATION1_TUTORS;
  const graveyardInfra = deckHasGraveyardPayoff(args.selectedCards, args.catalog);
  const sacrificeOutlets = countSacrificeOutlets(args.selectedCards);
  const finishers = countFinishers(args.selectedCards);
  const audits: TutorAuditEntryV413[] = [];

  for (const tutorName of names) {
    const card = findCouncilCardByIdentity(args.selectedCards, tutorName, args.catalog);
    if (!card) continue;
    const golden = card.oracleId ? args.catalog.byOracleId.get(card.oracleId) : null;
    const text = golden ? combinedGoldenOracleText(golden).toLowerCase() : "";
    const classification = golden ? classifyTutorCardV411(golden) : null;

    let reliablyFinds: string[] = [];
    let enginePath = "General consistency";
    let targetSupported = true;
    let cardDisadvantage: TutorAuditEntryV413["cardDisadvantageRisk"] = "LOW";
    let graveyardRequired = false;
    let contribution: TutorAuditEntryV413["bracketContribution"] = "ADEQUATE";
    let recommendReplacement = false;
    let replacementReason: string | undefined;
    let verdict = "";

    const lower = tutorName.toLowerCase();

    if (lower === "worldly tutor") {
      reliablyFinds = ["creature engines", "sacrifice outlets", "token makers"];
      enginePath = "Finds Korvold-aligned creature engines and outlets";
      targetSupported = sacrificeOutlets >= 2 || finishers >= 3;
      contribution = targetSupported ? "STRONG" : "ADEQUATE";
      verdict = "Excellent for creature-heavy sacrifice engines";
    } else if (lower === "finale of devastation") {
      reliablyFinds = ["creatures by MV", "X=10 finisher"];
      enginePath = "Wide tutor + potential finisher at X=10";
      cardDisadvantage = "MEDIUM";
      contribution = finishers >= 2 ? "STRONG" : "ADEQUATE";
      verdict = "Strong creature toolbox; X=10 can close but costs 12+ mana";
    } else if (lower === "entomb") {
      reliablyFinds = ["any creature to graveyard"];
      graveyardRequired = true;
      enginePath = "Graveyard setup — needs reanimation or flashback payoffs";
      targetSupported = graveyardInfra;
      contribution = graveyardInfra ? "STRONG" : "WEAK";
      if (!graveyardInfra) {
        recommendReplacement = true;
        replacementReason = "Limited graveyard payoff — Entomb target space under-supported";
        verdict = "MISPLACED without graveyard recursion infrastructure";
      } else {
        verdict = "Strong with reanimation/flashback support";
      }
    } else if (lower === "vampiric tutor") {
      reliablyFinds = ["any card"];
      enginePath = "Universal access to best card in deck";
      contribution = "STRONG";
      verdict = "Premium unrestricted tutor — always B4-relevant if targets exist";
    } else if (lower === "diabolic intent") {
      reliablyFinds = ["any card with sacrifice"];
      graveyardRequired = false;
      enginePath = "Sacrifice-aligned tutor — excellent in Korvold";
      cardDisadvantage = sacrificeOutlets >= 2 ? "LOW" : "MEDIUM";
      contribution = sacrificeOutlets >= 2 ? "STRONG" : "ADEQUATE";
      verdict = "Charter-aligned — sacrifice cost is feature not bug";
    } else {
      reliablyFinds = classification ? [`${classification} targets`] : ["unknown"];
      verdict = "Generic tutor audit";
    }

    audits.push({
      tutorName: card.name,
      oracleId: card.oracleId,
      reliablyFinds,
      enginePathImproved: enginePath,
      targetSpaceSupported: targetSupported,
      cardDisadvantageRisk: cardDisadvantage,
      graveyardRequired,
      graveyardInfrastructurePresent: graveyardInfra,
      bracketContribution: contribution,
      auditVerdict: verdict,
      recommendReplacement,
      replacementReason,
    });
  }

  return audits;
}

export function tutorsNeedingReplacement(audits: TutorAuditEntryV413[]): TutorAuditEntryV413[] {
  return audits.filter((a) => a.recommendReplacement || a.bracketContribution === "MISPLACED" || a.bracketContribution === "WEAK");
}
