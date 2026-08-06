import { normalizeCardNameForMatch } from "./clerk-tools/magic-commander-inventory";
import type { CommanderSelectionPolicy } from "./resolved-clerk-request";
import { commanderNamesMatch } from "./resolved-clerk-request";

function extractBoldCardNames(text: string): string[] {
  const names: string[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const name = match[1]?.trim();
    if (name && name.length >= 2 && name.length <= 80) {
      names.push(name);
    }
  }
  return names;
}

function normalizeName(name: string): string {
  return normalizeCardNameForMatch(name);
}

export interface FormatterGuardInput {
  reply: string;
  allowedCardNames: string[];
  lockedCommanderName?: string;
  commanderSelectionPolicy?: CommanderSelectionPolicy;
}

export interface FormatterGuardResult {
  valid: boolean;
  violations: string[];
  sanitizedReply?: string;
}

/**
 * Deterministic post-formatter guard — blocks new card names, commander changes,
 * and unapproved inventory claims introduced by the LLM formatter.
 */
export function validateFormatterOutput(
  input: FormatterGuardInput,
): FormatterGuardResult {
  const violations: string[] = [];
  const allowed = new Set(
    input.allowedCardNames.map((n) => normalizeName(n)).filter(Boolean),
  );

  if (input.lockedCommanderName) {
    allowed.add(normalizeName(input.lockedCommanderName));
  }

  const boldNames = extractBoldCardNames(input.reply);
  for (const name of boldNames) {
    const key = normalizeName(name);
    if (!key) continue;
    const allowedName = [...allowed].some(
      (a) => a === key || a.includes(key) || key.includes(a),
    );
    if (!allowedName) {
      violations.push(`Formatter introduced unapproved card name: ${name}`);
    }
    if (
      input.commanderSelectionPolicy === "exact_commander_required" &&
      input.lockedCommanderName &&
      !commanderNamesMatch(name, input.lockedCommanderName) &&
      /\bcommander\b/i.test(input.reply)
    ) {
      violations.push(
        `Formatter changed commander from ${input.lockedCommanderName} to ${name}.`,
      );
    }
  }

  const priceClaims = input.reply.match(/\$\d+(?:\.\d{2})?/g) ?? [];
  if (priceClaims.length > 8) {
    violations.push("Formatter introduced excessive price claims.");
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}
