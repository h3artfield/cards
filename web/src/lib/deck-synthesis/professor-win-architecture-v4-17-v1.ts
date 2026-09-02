/**
 * Professor v4.17 — win architecture type classification + researchability.
 */
import type { WinArchitectureTypeV417 } from "./professor-brew-blueprint-v4-17-v1";

export const PROFESSOR_WIN_ARCHITECTURE_V4_17_V1_VERSION = "professor-win-architecture-v4-17-v1";

export function classifyWinArchitectureTypeV417(plan: string): WinArchitectureTypeV417 {
  const lower = plan.toLowerCase();
  if (/commander damage|combat damage|connect repeatedly|voltron|21 damage|power\/damage threshold|attack.*commander/i.test(lower)) {
    return "COMBAT_CLOCK";
  }
  if (/drain|aristocrat|attrition|death trigger|sacrifice.*drain/i.test(lower)) {
    return "ATTRITION_ENGINE";
  }
  if (/convert.*resource|mana engine|draw engine|sacrifice.*draw|resource conversion/i.test(lower)) {
    return "RESOURCE_CONVERSION";
  }
  if (/library.depletion|thassa|laboratory|alternate win|empty library|milled/i.test(lower)) {
    return "ALTERNATE_WIN";
  }
  if (/finite burst|extra turn|one-shot|lethal this turn|win this turn/i.test(lower)) {
    return "FINITE_BURST";
  }
  if (/loop|combo|deterministic|assemble.*line|two-card|infinite/i.test(lower)) {
    return "DETERMINISTIC_LINE";
  }
  return "DETERMINISTIC_LINE";
}

export function isWinResearchableV417(plan: string): { researchable: boolean; vague: boolean; issues: string[]; type: WinArchitectureTypeV417 } {
  const type = classifyWinArchitectureTypeV417(plan);
  const lower = plan.toLowerCase();
  const issues: string[] = [];

  if (type === "COMBAT_CLOCK") {
    const hasThreshold = /21|commander damage|lethal|power|double strike|evasion|connect|protection|extra combat/i.test(lower);
    const researchable = lower.length >= 30 && hasThreshold;
    if (!researchable) issues.push("COMBAT_CLOCK_MISSING_MEASURABLE_CLOCK");
    return { researchable, vague: !researchable, issues, type };
  }

  if (/^[a-z\s]+loop$/i.test(plan.trim()) || /^recursive permanent loop$/i.test(plan.trim())) {
    return { researchable: false, vague: true, issues: ["WIN_HYPOTHESIS_VAGUE"], type };
  }

  if (lower.length < 40 && !/convert|assemble|sacrifice|cast|draw|token|drain|extra turn|commander damage|21/i.test(lower)) {
    return { researchable: false, vague: true, issues: ["WIN_HYPOTHESIS_VAGUE"], type };
  }

  if (/overwhelming board|win through combat$/i.test(lower) && !/convert|recur|sacrifice|cast|draw|token|drain|extra turn|resource|engine|payoff|commander damage|21/i.test(lower)) {
    return { researchable: false, vague: true, issues: ["WIN_HYPOTHESIS_VAGUE"], type };
  }

  const researchable = /convert|recur|sacrifice|cast|draw|token|drain|extra turn|resource|engine|payoff|zone|graveyard|exile|copy|counter|commander damage|21|deterministic|assemble|protection|evasion|double strike/i.test(lower);
  if (!researchable) issues.push("WIN_HYPOTHESIS_VAGUE");
  return { researchable, vague: !researchable, issues, type };
}
