/**
 * Customer-facing Commander list import — parse Moxfield / Archidekt / Arena / plaintext.
 * Catalog hydration lives in professor-imported-deck-hydrate-v1-1-1.
 */
export const PROFESSOR_IMPORTED_DECKLIST_V1_1_1_VERSION = "professor-imported-decklist-v1-1-1";

export type ProfessorImportedDeckCardV111 = {
  name: string;
  copies: number;
};

export type ProfessorParsedImportedDecklistV111 = {
  commanderNames: string[];
  mainboard: ProfessorImportedDeckCardV111[];
  rawLineCount: number;
};

export type ProfessorImportedResolvedCardV111 = {
  sourceName: string;
  copies: number;
  resolved: boolean;
  name: string;
  oracleId: string | null;
  typeLine: string;
  isLand: boolean;
  commanderLegal: boolean;
  colorIdentity: string[];
  offColor: boolean;
};

export type ProfessorImportedDeckPreviewV111 = {
  commanderName: string | null;
  commanderResolved: boolean;
  cards: ProfessorImportedResolvedCardV111[];
  recognized: number;
  total: number;
  unresolvedNames: string[];
  offColorNames: string[];
  libraryCount: number;
  landCount: number;
  nonlandCount: number;
  canOptimize: boolean;
  blockers: string[];
};

const SECTION_MARKERS: Array<{ key: "commanders" | "mainboard" | "sideboard"; patterns: RegExp[] }> = [
  { key: "commanders", patterns: [/^~~?commanders?~~?$/i, /^commanders?:?$/i] },
  { key: "mainboard", patterns: [/^~~?mainboard~~?$/i, /^main(?:board)?:?$/i, /^deck:?$/i] },
  { key: "sideboard", patterns: [/^~~?sideboard~~?$/i, /^side(?:board)?:?$/i, /^maybeboard:?$/i] },
];

function stripPrintingSuffix(name: string): string {
  return name
    .replace(/\s+\*F\*\s*$/i, "")
    .replace(/\s+\[[A-Z0-9]+\]\s*$/i, "")
    .replace(/\s+\([A-Z0-9:.\s-]+\)\s*\d+[a-z]?\s*$/i, "")
    .replace(/\s+\([A-Z0-9:.\s-]+\)\s*$/i, "")
    .replace(/\s+#\d+[a-z]?\s*$/i, "")
    .replace(/\s+\/\/\s*$/i, "")
    .trim();
}

function parseQtyName(line: string): { name: string; copies: number } | null {
  const trimmed = line
    .replace(/^SB:\s*/i, "")
    .replace(/^[-*•]\s*/, "")
    .trim();
  if (!trimmed) return null;

  const leading = trimmed.match(/^(\d+)\s*[xX]?\s+(.+)$/);
  if (leading) {
    const copies = Number.parseInt(leading[1]!, 10);
    const name = stripPrintingSuffix(leading[2] ?? "");
    if (!name || !Number.isFinite(copies) || copies <= 0) return null;
    return { name, copies };
  }

  const trailing = trimmed.match(/^(.+?)\s+[xX]\s*(\d+)$/);
  if (trailing) {
    const copies = Number.parseInt(trailing[2]!, 10);
    const name = stripPrintingSuffix(trailing[1] ?? "");
    if (!name || !Number.isFinite(copies) || copies <= 0) return null;
    return { name, copies };
  }

  const name = stripPrintingSuffix(trimmed);
  if (!name || /^https?:\/\//i.test(name)) return null;
  return { name, copies: 1 };
}

function mergeCopies(cards: ProfessorImportedDeckCardV111[]): ProfessorImportedDeckCardV111[] {
  const byName = new Map<string, number>();
  const order: string[] = [];
  for (const card of cards) {
    const key = card.name;
    if (!byName.has(key)) order.push(key);
    byName.set(key, (byName.get(key) ?? 0) + card.copies);
  }
  return order.map((name) => ({ name, copies: byName.get(name)! }));
}

export function parseProfessorImportedDecklistV111(decklist: string): ProfessorParsedImportedDecklistV111 {
  const commanders: ProfessorImportedDeckCardV111[] = [];
  const mainboard: ProfessorImportedDeckCardV111[] = [];
  let section: "commanders" | "mainboard" | "sideboard" | null = null;
  let rawLineCount = 0;

  for (const rawLine of decklist.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("//") || line.startsWith("#")) continue;

    const marker = SECTION_MARKERS.find((entry) => entry.patterns.some((pattern) => pattern.test(line)));
    if (marker) {
      section = marker.key;
      continue;
    }

    const parsed = parseQtyName(line);
    if (!parsed) continue;
    rawLineCount += 1;

    if (section === "sideboard") continue;
    if (section === "commanders") commanders.push(parsed);
    else mainboard.push(parsed);
  }

  return {
    commanderNames: mergeCopies(commanders).map((card) => card.name),
    mainboard: mergeCopies(mainboard),
    rawLineCount,
  };
}

export function flattenImportedMainboardCopies(
  cards: ProfessorImportedDeckCardV111[],
): ProfessorImportedDeckCardV111[] {
  return mergeCopies(cards.filter((card) => card.name.trim() && card.copies > 0));
}
