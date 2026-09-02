import {
  COMMANDER_BRACKET_META_V1,
  type CommanderBracket,
} from "@/lib/bracket-policy/commander-bracket-snapshot-v1";

export type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";

export const PROFESSOR_BREW_BRACKET_V4_V1_VERSION = "professor-brew-bracket-v4-v1";

export const DEFAULT_PROFESSOR_BREW_BRACKET: CommanderBracket = 3;

export const PROFESSOR_BREW_BRACKET_OPTIONS: {
  value: CommanderBracket;
  label: string;
  shortLabel: string;
  philosophy: string;
}[] = ([1, 2, 3, 4, 5] as CommanderBracket[]).map((value) => ({
  value,
  label: `Bracket ${value} — ${COMMANDER_BRACKET_META_V1[value].name}`,
  shortLabel: `B${value} · ${COMMANDER_BRACKET_META_V1[value].name}`,
  philosophy: COMMANDER_BRACKET_META_V1[value].intentPhilosophy,
}));

export function parseProfessorBrewBracket(value: unknown): CommanderBracket {
  const n = typeof value === "number" ? value : typeof value === "string" ? parseInt(value, 10) : NaN;
  if (n >= 1 && n <= 5) return n as CommanderBracket;
  return DEFAULT_PROFESSOR_BREW_BRACKET;
}

export function bracketLabel(bracket: CommanderBracket): string {
  return PROFESSOR_BREW_BRACKET_OPTIONS.find((o) => o.value === bracket)?.shortLabel ?? `Bracket ${bracket}`;
}
