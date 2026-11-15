/**
 * Whether two cards may share the command zone.
 *
 * Every pairing mechanic is printed on the cards, so the check reads oracle
 * text and type lines rather than keeping a list of known pairs that would go
 * stale with each set.
 */

export type CommanderPairCardV1 = {
  name: string;
  typeLine: string;
  oracleText: string;
};

function reminderless(text: string): string {
  return text.replace(/\([^)]*\)/g, "");
}

function partnerWithName(card: CommanderPairCardV1): string | null {
  const match = reminderless(card.oracleText).match(/^Partner with ([^\n]+?)\s*$/im);
  return match?.[1]?.trim() ?? null;
}

/** "Partner" on its own line, or a "Partner—Group" variant. Not "Partner with". */
function partnerGroup(card: CommanderPairCardV1): string | null {
  const text = reminderless(card.oracleText);
  const variant = text.match(/^Partner\s*[—-]\s*([^\n]+?)\s*$/im);
  if (variant) return variant[1]!.trim().toLowerCase();
  if (/^Partner\s*$/im.test(text)) return "";
  return null;
}

const hasLine = (card: CommanderPairCardV1, pattern: RegExp) => pattern.test(reminderless(card.oracleText));

function namesMatch(a: string, b: string): boolean {
  const norm = (s: string) => s.split(" // ")[0]!.trim().toLowerCase();
  return norm(a) === norm(b);
}

function pairsOneWay(a: CommanderPairCardV1, b: CommanderPairCardV1): boolean {
  const named = partnerWithName(a);
  if (named) return namesMatch(named, b.name) && partnerWithName(b) != null && namesMatch(partnerWithName(b)!, a.name);

  if (hasLine(a, /^Choose a Background\s*$/im)) return /\bBackground\b/.test(b.typeLine);
  if (hasLine(a, /^Doctor's companion\s*$/im)) return /\bTime Lord Doctor\b/.test(b.typeLine);
  return false;
}

/** Null when the pair is legal, otherwise a sentence saying why not. */
export function commanderPairProblemV1(a: CommanderPairCardV1, b: CommanderPairCardV1): string | null {
  if (namesMatch(a.name, b.name)) return `${a.name} is listed as both commanders`;

  const groupA = partnerGroup(a);
  const groupB = partnerGroup(b);
  if (groupA != null && groupB != null && groupA === groupB) return null;

  if (hasLine(a, /^Friends forever\s*$/im) && hasLine(b, /^Friends forever\s*$/im)) return null;
  if (pairsOneWay(a, b) || pairsOneWay(b, a)) return null;

  return `${a.name} and ${b.name} can't be commanders together — both need Partner, Friends forever, or a matching pairing ability`;
}
