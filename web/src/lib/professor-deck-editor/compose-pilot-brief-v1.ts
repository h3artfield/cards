/**
 * Customer-facing hero copy: how the deck wins, how to pilot it, named lines.
 *
 * Head Professor `reasoningSummary` is a construction verdict. This composes a
 * brief from structured build data so existing decks read like a game plan
 * without waiting for a rebuild.
 */

export const DECK_PILOT_BRIEF_V1_VERSION = "professor-deck-editor-pilot-brief-v1";

export type DeckPilotBriefInputV1 = {
  commanderName: string;
  playstyleLabel?: string;
  playstyleDetail?: string;
  primaryWinPaths?: readonly string[];
  secondaryWinPaths?: readonly string[];
  earlyTips?: readonly string[];
  midTips?: readonly string[];
  comboNames?: readonly string[];
};

function clipSentence(text: string, max = 160): string {
  const trimmed = text.replace(/\s+/g, " ").trim().replace(/^[.]+/, "");
  if (!trimmed) return "";
  const withStop = /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
  return withStop.length > max ? `${withStop.slice(0, max - 1)}…` : withStop;
}

function firstSentence(text: string | undefined): string {
  if (!text?.trim()) return "";
  const sentence = text
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .find(Boolean);
  return sentence ? clipSentence(sentence) : "";
}

function uniqueNames(values: readonly string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values ?? []) {
    const name = value.replace(/\s+/g, " ").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

function joinList(items: readonly string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export function composeDeckPilotBriefV1(args: DeckPilotBriefInputV1): string {
  const sentences: string[] = [];
  const wins = uniqueNames([...(args.primaryWinPaths ?? []), ...(args.secondaryWinPaths ?? [])]);
  if (wins.length) {
    sentences.push(`Wins by ${joinList(wins.slice(0, 3))}.`);
  } else {
    const style = firstSentence(args.playstyleDetail);
    if (style) sentences.push(style);
    else if (args.playstyleLabel?.trim()) {
      sentences.push(
        `${args.commanderName} plays as a ${args.playstyleLabel.trim().toLowerCase()} list.`,
      );
    }
  }

  const early = firstSentence(args.earlyTips?.[0]);
  const mid = firstSentence(args.midTips?.[0]);
  if (early) sentences.push(early);
  if (mid && mid !== early) sentences.push(mid);

  const alreadyNamed = new Set(wins.map((name) => name.toLowerCase()));
  const combos = uniqueNames(args.comboNames).filter((name) => !alreadyNamed.has(name.toLowerCase()));
  if (combos.length) {
    sentences.push(`Key lines: ${joinList(combos.slice(0, 3))}.`);
  }

  return sentences.slice(0, 4).join(" ");
}
