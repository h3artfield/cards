/** WUBRG arrays for guild, wedge, shard, and slang color names. */
export const MTG_NAMED_COLOR_IDENTITIES: Record<string, string[]> = {
  // Tarkir wedges
  temur: ["G", "U", "R"],
  abzan: ["W", "B", "G"],
  jeskai: ["U", "R", "W"],
  mardu: ["R", "W", "B"],
  sultai: ["B", "G", "U"],
  bug: ["B", "G", "U"],
  // Alara shards
  bant: ["G", "W", "U"],
  esper: ["W", "U", "B"],
  grixis: ["U", "B", "R"],
  jund: ["B", "R", "G"],
  naya: ["R", "G", "W"],
  // Ravnica guilds
  azorius: ["W", "U"],
  dimir: ["U", "B"],
  rakdos: ["B", "R"],
  gruul: ["R", "G"],
  selesnya: ["G", "W"],
  orzhov: ["W", "B"],
  izzet: ["U", "R"],
  golgari: ["B", "G"],
  boros: ["R", "W"],
  simic: ["G", "U"],
  // Two-letter shorthand
  wu: ["W", "U"],
  ub: ["U", "B"],
  br: ["B", "R"],
  rg: ["R", "G"],
  gw: ["G", "W"],
  wb: ["W", "B"],
  ur: ["U", "R"],
  bg: ["B", "G"],
  rw: ["R", "W"],
  gu: ["G", "U"],
  // Five-color
  wubrg: ["W", "U", "B", "R", "G"],
  "five-color": ["W", "U", "B", "R", "G"],
  fivecolor: ["W", "U", "B", "R", "G"],
};

const COLOR_SPELLINGS: Record<string, string> = {
  W: "white",
  U: "blue",
  B: "black",
  R: "red",
  G: "green",
};

/** Longest names first so "five-color" wins over shorter partials. */
const NAMED_COLOR_ENTRIES = Object.entries(MTG_NAMED_COLOR_IDENTITIES).sort(
  (a, b) => b[0].length - a[0].length,
);

export function colorIdentityKey(colors: string[]): string {
  return [...colors].sort().join("");
}

export function parseNamedColorIdentityFromText(text: string): {
  colors: string[];
  label: string;
  matched: string;
} | null {
  const lower = text.toLowerCase();
  for (const [name, colors] of NAMED_COLOR_ENTRIES) {
    const pattern = new RegExp(
      `\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/-/g, "[-\\s]?")}\\b`,
      "i",
    );
    if (pattern.test(lower)) {
      const label = name
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join("-");
      return { colors, label, matched: name };
    }
  }
  return null;
}

export function formatColorIdentitySearchLabel(input: {
  colors: string[];
  name?: string;
}): string {
  const spelled = input.colors.map((c) => COLOR_SPELLINGS[c] ?? c).join("/");
  if (input.name) return `${input.name} (${spelled})`;
  return spelled;
}

export function stripNamedColorIdentityTokens(text: string): string {
  let out = text;
  for (const [name] of NAMED_COLOR_ENTRIES) {
    const pattern = new RegExp(
      `\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/-/g, "[-\\s]?")}\\b`,
      "gi",
    );
    out = out.replace(pattern, " ");
  }
  return out.replace(/\s+/g, " ").trim();
}
