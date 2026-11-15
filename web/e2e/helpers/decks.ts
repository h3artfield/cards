import fs from "node:fs";
import path from "node:path";

export type DeckFixture = {
  id: string;
  commander: string;
  file: string;
  listText: string;
};

const DIR = path.join(__dirname, "..", "fixtures", "commander-decks");

export function loadDeckFixtures(): DeckFixture[] {
  const files = fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".txt"))
    .sort();
  return files.map((file) => {
    const listText = fs.readFileSync(path.join(DIR, file), "utf8");
    const lines = listText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const commanderLine = lines.find((l) => /^commander:/i.test(l)) ?? lines[0] ?? "";
    const commander = commanderLine.replace(/^commander:\s*/i, "").replace(/^\d+\s*x?\s*/i, "");
    return {
      id: file.replace(/\.txt$/i, ""),
      commander,
      file,
      listText,
    };
  });
}

/** Mainboard lines without the Commander: header, for paste UIs that want a plain list. */
export function pasteBody(fixture: DeckFixture): string {
  return fixture.listText
    .split(/\r?\n/)
    .filter((l) => l.trim() && !/^commander:/i.test(l.trim()))
    .join("\n");
}
