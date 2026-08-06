/** Resolve card names from recent clerk conversation for follow-up stock checks. */

const FOLLOW_UP_STOCK =
  /\b(those|them|these|the ones|both|either|any of (?:those|them)|do you have those|got those|have those|carry those|stock on those)\b/i;

/** Magic card names often appear bold in clerk replies. */
function namesFromBoldMarkdown(text: string): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(/\*\*([^*]+)\*\*/g)) {
    const name = match[1]?.trim();
    if (name && name.length >= 3) names.push(name);
  }
  return names;
}

/** e.g. K'ure, the Unyielding */
function namesFromTheTitlePattern(text: string): string[] {
  const names: string[] = [];
  const pattern =
    /\b([A-Z][A-Za-z'’\-]+,\s+the\s+[A-Z][A-Za-z'’\-]+(?:\s+[A-Z][A-Za-z'’\-]+)*)/g;
  for (const match of text.matchAll(pattern)) {
    const name = match[1]?.trim();
    if (name && name.length >= 5) names.push(name);
  }
  return names;
}

/** e.g. K'rrik, Son of Yawgmoth — Teysa, Envoy of Ghosts */
function namesFromLegendaryPatterns(text: string): string[] {
  const names: string[] = [];
  const pattern =
    /\b([A-Z][A-Za-z'’\-]*(?:,\s+(?:[A-Z][A-Za-z'’\-]+\s+)+(?:of\s+[A-Z][A-Za-z'’\-]+|[A-Z][A-Za-z'’\-]+))+)/g;
  for (const match of text.matchAll(pattern)) {
    const name = match[1]?.trim();
    if (name && name.length >= 5 && !/^(Customer|Clerk|Magic|The Game)\b/i.test(name)) {
      names.push(name);
    }
  }
  return names;
}

function namesFromNumberedList(text: string): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(/\d+\.\s+\*?\*?([^—$\n*]+?)\*?\*?\s*(?:—|-|\(|@|\$)/g)) {
    const name = match[1]?.trim();
    if (name && name.length >= 3) names.push(name);
  }
  return names;
}

function uniqNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.replace(/\s+/g, " ").trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/** Extract card names from any clerk/specialist reply text. */
export function extractCardNamesFromClerkText(text: string): string[] {
  if (!text.trim()) return [];
  return uniqNames([
    ...namesFromBoldMarkdown(text),
    ...namesFromTheTitlePattern(text),
    ...namesFromLegendaryPatterns(text),
    ...namesFromNumberedList(text),
  ]).slice(0, 8);
}

export function isConversationStockFollowUp(question: string): boolean {
  return FOLLOW_UP_STOCK.test(question);
}

/** Pull card names the clerk mentioned in recent assistant turns. */
export function extractCardNamesFromConversation(input: {
  question: string;
  conversationSummary: string;
}): string[] {
  if (!isConversationStockFollowUp(input.question)) return [];

  const assistantChunks = input.conversationSummary
    .split("\n")
    .filter((line) => line.startsWith("Clerk:"))
    .map((line) => line.replace(/^Clerk:\s*/, ""))
    .slice(-3);

  const blob = assistantChunks.join("\n");
  if (!blob.trim()) return [];

  return uniqNames([
    ...namesFromBoldMarkdown(blob),
    ...namesFromTheTitlePattern(blob),
    ...namesFromLegendaryPatterns(blob),
    ...namesFromNumberedList(blob),
  ]).slice(0, 6);
}