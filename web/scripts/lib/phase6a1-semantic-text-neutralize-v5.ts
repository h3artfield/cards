/** Neutralize answer-bearing functional-role vocabulary in benchmark-visible text. */
const ROLE_VOCAB =
  /\b(engine|enabler|fuel|fodder|payoff|conversion|protection|recovery|finisher|bridge|maint|attrition|combat payoff|token production|resource conversion|engine protection|commander maintenance|harm-bridge|standalone payoff|standalone engine|storm finish|lethal|bridge)\b/gi;

export function neutralizeBenchmarkText(text: string): string {
  return text.replace(ROLE_VOCAB, "loop component").replace(/\s+/g, " ").trim();
}

export const ROLE_VOCAB_PATTERN =
  /\b(engine|enabler|fuel|fodder|payoff|conversion|protection|recovery|finisher|bridge|maint|harm-bridge)\b/i;
