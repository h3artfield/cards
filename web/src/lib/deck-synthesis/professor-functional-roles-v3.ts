/**
 * Versioned functional role vocabulary for Professor v3 package classification.
 */
export const PROFESSOR_FUNCTIONAL_ROLES_V3_VERSION = "professor-functional-roles-v3";

export const FUNCTIONAL_ROLES_V3 = [
  "ENGINE",
  "ENABLER",
  "FUEL",
  "PAYOFF",
  "CONVERSION",
  "PROTECTION",
  "RECOVERY",
  "FINISHER",
  "COMMANDER_MAINTENANCE",
  "CROSS_ENGINE_BRIDGE",
] as const;

export type FunctionalRoleV3 = (typeof FUNCTIONAL_ROLES_V3)[number];

export function isFunctionalRoleV3(value: string): value is FunctionalRoleV3 {
  return (FUNCTIONAL_ROLES_V3 as readonly string[]).includes(value);
}

export function normalizeFunctionalRoleV3(value: string): FunctionalRoleV3 | null {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, "_");
  return isFunctionalRoleV3(normalized) ? normalized : null;
}
