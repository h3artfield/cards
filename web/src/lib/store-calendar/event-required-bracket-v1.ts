import type { StoreEvent } from "./types";

/** Commander bracket tournaments are numbered 1–5 in the official rubric. */
export type CommanderEventBracketV1 = 1 | 2 | 3 | 4 | 5;

function parseBracketFromText(text: string): CommanderEventBracketV1 | null {
  const haystack = text.toLowerCase();
  const match = haystack.match(/\bbracket\s*([1-5])\b/);
  if (!match) return null;
  return Number(match[1]) as CommanderEventBracketV1;
}

/**
 * Which bracket this event seats, if any.
 *
 * Stores may set `requiredBracket` explicitly, or name the event
 * "commander bracket 3" and expect the picker to enforce it.
 */
export function eventRequiredBracketV1(event: Pick<
  StoreEvent,
  "requiredBracket" | "title" | "description"
>): CommanderEventBracketV1 | null {
  const explicit = event.requiredBracket;
  if (
    explicit != null &&
    Number.isInteger(explicit) &&
    explicit >= 1 &&
    explicit <= 5
  ) {
    return explicit as CommanderEventBracketV1;
  }

  return parseBracketFromText(`${event.title ?? ""} ${event.description ?? ""}`);
}

export function deckMatchesEventBracketV1(args: {
  deckBracket: number;
  requiredBracket: CommanderEventBracketV1;
}): boolean {
  return args.deckBracket === args.requiredBracket;
}
