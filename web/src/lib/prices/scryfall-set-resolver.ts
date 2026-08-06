import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { scryfallFetch } from "../processing/scryfall-client";

export type ScryfallSetEntry = {
  code: string;
  name: string;
  setType?: string;
  parentSetCode?: string;
};

export type ScryfallSetResolver = {
  resolveSetCode(input: {
    consoleName?: string;
    productName?: string;
    bracketSetName?: string;
  }): { setCode?: string; setName?: string; matchReason?: string };
  lookupByCode(code: string): ScryfallSetEntry | undefined;
};

function normalizeSetLabel(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^magic\s+/i, "")
    .replace(/^mtg\s+/i, "")
    .replace(/['']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function softNorm(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ORDINAL_TO_WORD: Record<string, string> = {
  "10th": "tenth",
  "9th": "ninth",
  "8th": "eighth",
  "7th": "seventh",
  "6th": "sixth",
  "5th": "fifth",
  "4th": "fourth",
  "3rd": "third",
};

function labelVariants(label: string): string[] {
  const out = new Set<string>([label, softNorm(label)]);
  for (const [ord, word] of Object.entries(ORDINAL_TO_WORD)) {
    if (label.includes(ord)) {
      out.add(label.replace(ord, word));
      out.add(softNorm(label.replace(ord, word)));
    }
  }
  return [...out];
}

function stripCommanderSuffix(label: string): string {
  return label.replace(/\s+commander$/i, "").trim();
}

/** Hardcoded overrides where PC console names diverge from Scryfall set names. */
const PC_CONSOLE_OVERRIDES: Array<{ pattern: RegExp; code: string; name?: string }> = [
  { pattern: /the list/i, code: "PLST", name: "The List" },
  {
    pattern: /jurassic world collection|\bmagic jurassic\b/i,
    code: "REX",
    name: "Jurassic World Collection",
  },
  {
    pattern: /marvel spider-man:\s*marvel universe|marvel's spider-man/i,
    code: "SPM",
    name: "Marvel's Spider-Man Eternal",
  },
  {
    pattern: /\bmarvel universe\b/i,
    code: "MAR",
    name: "Marvel Universe",
  },
  { pattern: /forgotten realms commander|\bafc\b/i, code: "AFC", name: "Forgotten Realms Commander" },
  { pattern: /mystery booster/i, code: "MB1", name: "Mystery Booster" },
  { pattern: /lord of the rings(?! commander)/i, code: "LTR", name: "The Lord of the Rings: Tales of Middle-earth" },
  { pattern: /unfinity/i, code: "UNF", name: "Unfinity" },
  { pattern: /secret lair/i, code: "SLD", name: "Secret Lair Drop" },
  { pattern: /final fantasy commander/i, code: "FIC", name: "Final Fantasy Commander" },
  { pattern: /final fantasy/i, code: "FIN", name: "Final Fantasy" },
  { pattern: /commander legends: battle for baldur's gate|\bclb\b/i, code: "CLB", name: "Commander Legends: Battle for Baldur's Gate" },
  { pattern: /commander legends/i, code: "CMR", name: "Commander Legends" },
  { pattern: /commander masters/i, code: "CMM", name: "Commander Masters" },
  { pattern: /modern horizons 3/i, code: "MH3", name: "Modern Horizons 3" },
  { pattern: /modern horizons 2/i, code: "MH2", name: "Modern Horizons 2" },
  { pattern: /doctor who/i, code: "WHO", name: "Doctor Who" },
  { pattern: /foundations/i, code: "FDN", name: "Foundations" },
  { pattern: /fallout/i, code: "PIP", name: "Fallout" },
  { pattern: /marvel super heroes commander/i, code: "MSC", name: "Marvel Super Heroes Commander" },
  { pattern: /marvel super heroes/i, code: "MSH", name: "Marvel Super Heroes" },
  { pattern: /avatar: the last airbender/i, code: "TLA", name: "Avatar: The Last Airbender" },
  { pattern: /bloomburrow/i, code: "BLB", name: "Bloomburrow" },
  { pattern: /aetherdrift/i, code: "DFT", name: "Aetherdrift" },
  { pattern: /duskmourn/i, code: "DSK", name: "Duskmourn: House of Horror" },
  { pattern: /strixhaven school of mages/i, code: "STX", name: "Strixhaven: School of Mages" },
  { pattern: /ikoria lair of behemoths/i, code: "IKO", name: "Ikoria: Lair of Behemoths" },
  { pattern: /10th edition/i, code: "10E", name: "Tenth Edition" },
  { pattern: /9th edition/i, code: "9ED", name: "Ninth Edition" },
  { pattern: /8th edition/i, code: "8ED", name: "Eighth Edition" },
  { pattern: /7th edition/i, code: "7ED", name: "Seventh Edition" },
];

let cachedSetIndex: Map<string, ScryfallSetEntry> | null = null;

function cacheFilePath(): string {
  return resolve(process.cwd(), "../data/scryfall/set-index-cache.json");
}

function loadSetIndexFromDisk(): Map<string, ScryfallSetEntry> | null {
  try {
    const p = cacheFilePath();
    if (!existsSync(p)) return null;
    const raw = JSON.parse(readFileSync(p, "utf8")) as Record<string, ScryfallSetEntry>;
    const map = new Map<string, ScryfallSetEntry>();
    for (const [k, v] of Object.entries(raw)) {
      map.set(k, v);
    }
    return map.size > 0 ? map : null;
  } catch {
    return null;
  }
}

function saveSetIndexToDisk(index: Map<string, ScryfallSetEntry>): void {
  try {
    const p = cacheFilePath();
    mkdirSync(resolve(p, ".."), { recursive: true });
    const obj: Record<string, ScryfallSetEntry> = {};
    for (const [k, v] of index.entries()) {
      obj[k] = v;
    }
    writeFileSync(p, JSON.stringify(obj));
  } catch {
    /* optional cache */
  }
}

export async function loadScryfallSetIndex(force = false): Promise<Map<string, ScryfallSetEntry>> {
  if (!force && cachedSetIndex && cachedSetIndex.size > 0) {
    return cachedSetIndex;
  }

  if (!force) {
    const disk = loadSetIndexFromDisk();
    if (disk && disk.size > 0) {
      cachedSetIndex = disk;
      return disk;
    }
  }

  const byNormName = new Map<string, ScryfallSetEntry>();

  await new Promise((r) => setTimeout(r, 300));
  let url: string | null = "https://api.scryfall.com/sets";
  while (url) {
    let res = await scryfallFetch(url);
    if (!res.ok) {
      await new Promise((r) => setTimeout(r, 1500));
      res = await scryfallFetch(url);
    }
    if (!res.ok) break;
    const body = (await res.json()) as {
      data?: Array<{ code: string; name: string; set_type?: string; parent_set_code?: string }>;
      next_page?: string;
    };
    for (const s of body.data ?? []) {
      const entry: ScryfallSetEntry = {
        code: s.code.toUpperCase(),
        name: s.name,
        setType: s.set_type,
        parentSetCode: s.parent_set_code?.toUpperCase(),
      };
      for (const variant of labelVariants(normalizeSetLabel(s.name))) {
        byNormName.set(variant, entry);
      }
      for (const variant of labelVariants(stripCommanderSuffix(normalizeSetLabel(s.name)))) {
        byNormName.set(variant, entry);
      }
      byNormName.set(softNorm(s.name), entry);
    }
    url = body.next_page ?? null;
    if (url) await new Promise((r) => setTimeout(r, 100));
  }

  if (byNormName.size > 0) {
    cachedSetIndex = byNormName;
    saveSetIndexToDisk(byNormName);
    return byNormName;
  }

  const disk = loadSetIndexFromDisk();
  if (disk && disk.size > 0) {
    cachedSetIndex = disk;
    return disk;
  }

  return byNormName;
}

export function createScryfallSetResolver(
  nameIndex: Map<string, ScryfallSetEntry>,
): ScryfallSetResolver {
  const codeIndex = new Map<string, ScryfallSetEntry>();
  for (const entry of nameIndex.values()) {
    codeIndex.set(entry.code, entry);
  }

  function resolveSetCode(input: {
    consoleName?: string;
    productName?: string;
    bracketSetName?: string;
  }): { setCode?: string; setName?: string; matchReason?: string } {
    const consoleName = input.consoleName?.trim() ?? "";
    const productName = input.productName?.trim() ?? "";
    const combined = `${consoleName} ${productName}`;

    for (const o of PC_CONSOLE_OVERRIDES) {
      if (o.pattern.test(consoleName) || o.pattern.test(productName)) {
        return { setCode: o.code, setName: o.name, matchReason: "pc_console_override" };
      }
    }

    const candidates = [
      ...labelVariants(normalizeSetLabel(consoleName)),
      ...labelVariants(stripCommanderSuffix(normalizeSetLabel(consoleName))),
      ...(input.bracketSetName ? labelVariants(normalizeSetLabel(input.bracketSetName)) : []),
    ].filter(Boolean);

    for (const c of candidates) {
      const hit = nameIndex.get(c) ?? nameIndex.get(softNorm(c));
      if (hit) {
        return { setCode: hit.code, setName: hit.name, matchReason: "scryfall_set_name" };
      }
    }

    // Longest soft-norm substring match
    const consoleSoft = softNorm(normalizeSetLabel(consoleName));
    let best: ScryfallSetEntry | undefined;
    let bestLen = 0;
    for (const [norm, entry] of nameIndex.entries()) {
      if (norm.length < 5) continue;
      const normSoft = softNorm(norm);
      if (consoleSoft.includes(normSoft) && normSoft.length > bestLen) {
        best = entry;
        bestLen = normSoft.length;
      }
    }
    if (best) {
      return { setCode: best.code, setName: best.name, matchReason: "scryfall_prefix" };
    }

    if (/spider-man/i.test(combined) && !/marvel universe/i.test(combined)) {
      const spm = codeIndex.get("SPM");
      if (spm) return { setCode: spm.code, setName: spm.name, matchReason: "spider_man_heuristic" };
    }

    return {};
  }

  return {
    resolveSetCode,
    lookupByCode(code: string) {
      return codeIndex.get(code.toUpperCase());
    },
  };
}

/** Empty resolver for tests / offline rejection analysis without Scryfall fetch. */
export function createEmptyScryfallSetResolver(): ScryfallSetResolver {
  return createScryfallSetResolver(new Map());
}
