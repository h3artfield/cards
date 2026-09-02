/**
 * Professor v4.16.5 — CORE package realization in selected deck.
 */
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";
import type { WorkingDeckTheoryV4 } from "./professor-working-deck-theory-v4";
import { normalizeCardNameForMatch } from "./professor-card-name-match-client-v4-15-1-v1";

export const PROFESSOR_THEORY_REALIZATION_V4_16_5_V1_VERSION = "professor-theory-realization-v4-16-5-v1";

export type TheoryRealizationStatusV4165 = "UNREALIZED" | "PARTIAL" | "REALIZED" | "ABANDONED";

export type TheoryRealizationV4165 = {
  version: typeof PROFESSOR_THEORY_REALIZATION_V4_16_5_V1_VERSION;
  packageId: string;
  intendedFunction: string;
  candidateCards: string[];
  selectedMembers: string[];
  requiredMinimumMembers: number;
  realizationStatus: TheoryRealizationStatusV4165;
};

function selectedNameKeys(cards: CouncilCardV46[]): Set<string> {
  return new Set(cards.map((c) => normalizeCardNameForMatch(c.name)));
}

export function assessTheoryRealizationV4165(args: {
  theory: WorkingDeckTheoryV4 | null;
  selectedCards: CouncilCardV46[];
}): TheoryRealizationV4165[] {
  const keys = selectedNameKeys(args.selectedCards);
  const results: TheoryRealizationV4165[] = [];
  for (const pkg of args.theory?.packages ?? []) {
    if (pkg.status !== "CORE") continue;
    const selectedMembers = pkg.candidateCards.filter((name) => keys.has(normalizeCardNameForMatch(name)));
    const requiredMinimumMembers = Math.max(1, Math.min(2, pkg.candidateCards.length));
    let realizationStatus: TheoryRealizationStatusV4165 = "UNREALIZED";
    if (pkg.status === "REJECTED") realizationStatus = "ABANDONED";
    else if (selectedMembers.length >= requiredMinimumMembers) realizationStatus = "REALIZED";
    else if (selectedMembers.length > 0) realizationStatus = "PARTIAL";
    results.push({
      version: PROFESSOR_THEORY_REALIZATION_V4_16_5_V1_VERSION,
      packageId: pkg.packageId,
      intendedFunction: pkg.purpose || pkg.name,
      candidateCards: [...pkg.candidateCards],
      selectedMembers,
      requiredMinimumMembers,
      realizationStatus,
    });
  }
  return results;
}

export function unrealizedCorePackages(realizations: TheoryRealizationV4165[]): TheoryRealizationV4165[] {
  return realizations.filter((r) => r.realizationStatus === "UNREALIZED" || r.realizationStatus === "PARTIAL");
}

export function committedPackageTargets(realizations: TheoryRealizationV4165[]): string[] {
  const names = new Set<string>();
  for (const r of realizations) {
    if (r.realizationStatus === "REALIZED") {
      for (const n of r.selectedMembers) names.add(n);
    } else if (r.realizationStatus === "PARTIAL" || r.realizationStatus === "UNREALIZED") {
      for (const n of r.candidateCards.slice(0, 4)) names.add(n);
    }
  }
  return [...names];
}
