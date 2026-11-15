#!/usr/bin/env npx tsx
/**
 * Blind-v5 holdout selection + v1.1 eligibility preflight + seal.
 * Runs AFTER Phase 5.6 / v1.6.0 freeze. No discovery output inspection during selection.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeOracleName } from "@/lib/deck-builder/golden-catalog/normalize-name";
import { loadProjectEnvLocal } from "./lib/script-env";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { ARCHETYPE_DISCOVERY_BENCHMARK_V1 } from "../src/lib/deck-synthesis/archetype-discovery-benchmark-v1";
import { ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1 } from "../src/lib/deck-synthesis/archetype-discovery-blind-holdout-v1";
import { ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V2 } from "../src/lib/deck-synthesis/archetype-discovery-blind-holdout-v2";
import { ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V3 } from "../src/lib/deck-synthesis/archetype-discovery-blind-holdout-v3";
import { ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V4 } from "../src/lib/deck-synthesis/archetype-discovery-blind-holdout-v4";
import { benchmarkCaseAccounting } from "../src/lib/deck-synthesis/benchmark-commander-eligibility-v1";
import { auditBenchmarkCaseLegalityV11, assessCommanderLegality } from "../src/lib/deck-synthesis/benchmark-commander-legality-v1.1";
import { benchmarkCommanderResolutionPreflight } from "../src/lib/deck-synthesis/benchmark-commander-resolver-v1";

loadProjectEnvLocal();

export type BlindV5Category =
  | "narrow_single_engine"
  | "multiple_legitimate_plans"
  | "broad_composite"
  | "triggered_engine"
  | "activated_engine"
  | "static_state_engine"
  | "static_restriction"
  | "state_dependency"
  | "resource_scaler"
  | "output_multiplier"
  | "cost_dependency"
  | "activated_cost"
  | "combat"
  | "spells_casting"
  | "protection_engine"
  | "attrition_engine"
  | "resource_conversion"
  | "unusual_zones"
  | "graveyard"
  | "artifacts"
  | "enchantments"
  | "tokens"
  | "counters"
  | "lands"
  | "typal"
  | "type_qualified_engine"
  | "tutor_toolbox"
  | "multi_stage_engine"
  | "unusual_mechanical"
  | "partner_pair"
  | "commander_with_background";

export type BlindV5CommandZoneConfiguration = "single_commander" | "partner_pair" | "commander_with_background";

export type BlindV5Case = {
  id: string;
  category: BlindV5Category;
  commandZoneConfiguration: BlindV5CommandZoneConfiguration;
  commanders: string[];
  bracket: 1 | 2 | 3 | 4 | 5;
};

type CatalogCard = {
  oracleId: string;
  canonicalName: string;
  oracleText: string;
  typeLine: string;
};

type SpentAppearance = {
  set: string;
  caseId: string;
  configuration: string;
  role: "single_commander" | "partner_member" | "commander_with_background" | "background";
};

const SELECTION_SEED = "archetype-discovery-blind-v5-seed-20260812";

const PARTNER_PAIR_QUOTA = 10;
const COMMANDER_BACKGROUND_QUOTA = 8;
const EXPECTED_CASE_COUNT = 60;

const SINGLE_STRATA: Array<{ category: BlindV5Category; quota: number }> = [
  { category: "narrow_single_engine", quota: 2 },
  { category: "multiple_legitimate_plans", quota: 1 },
  { category: "broad_composite", quota: 1 },
  { category: "triggered_engine", quota: 2 },
  { category: "activated_engine", quota: 2 },
  { category: "static_state_engine", quota: 2 },
  { category: "static_restriction", quota: 1 },
  { category: "state_dependency", quota: 2 },
  { category: "resource_scaler", quota: 2 },
  { category: "output_multiplier", quota: 1 },
  { category: "cost_dependency", quota: 2 },
  { category: "activated_cost", quota: 1 },
  { category: "combat", quota: 1 },
  { category: "spells_casting", quota: 1 },
  { category: "protection_engine", quota: 1 },
  { category: "attrition_engine", quota: 1 },
  { category: "resource_conversion", quota: 1 },
  { category: "unusual_zones", quota: 2 },
  { category: "graveyard", quota: 2 },
  { category: "artifacts", quota: 2 },
  { category: "enchantments", quota: 2 },
  { category: "tokens", quota: 2 },
  { category: "counters", quota: 2 },
  { category: "lands", quota: 1 },
  { category: "typal", quota: 2 },
  { category: "type_qualified_engine", quota: 1 },
  { category: "tutor_toolbox", quota: 1 },
  { category: "multi_stage_engine", quota: 1 },
  { category: "unusual_mechanical", quota: 0 },
];

function seededRank(seed: string, key: string): string {
  return createHash("sha256").update(`${seed}:${key}`).digest("hex");
}

function strategyCaseKey(configuration: string, commanders: string[]): string {
  return `${configuration}::${commanders.map((c) => normalizeOracleName(c)).sort().join("|")}`;
}

function buildExclusionSet(): Set<string> {
  const out = new Set<string>();
  for (const c of ARCHETYPE_DISCOVERY_BENCHMARK_V1) {
    for (const name of c.commanders) out.add(normalizeOracleName(name));
  }
  for (const c of ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1) {
    for (const name of c.commanders) out.add(normalizeOracleName(name));
  }
  for (const c of ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V2) {
    for (const name of c.commanders) out.add(normalizeOracleName(name));
  }
  for (const c of ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V3) {
    for (const name of c.commanders) out.add(normalizeOracleName(name));
  }
  for (const c of ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V4) {
    for (const name of c.commanders) out.add(normalizeOracleName(name));
  }
  return out;
}

function buildSpentStrategyCaseKeys(): Set<string> {
  const keys = new Set<string>();
  const add = (set: string, cases: Array<{ id: string; commanders: string[]; commandZoneConfiguration?: string }>) => {
    for (const c of cases) {
      const cfg =
        "commandZoneConfiguration" in c && c.commandZoneConfiguration
          ? c.commandZoneConfiguration
          : c.commanders.length > 1
            ? "partner_pair"
            : "single_commander";
      keys.add(strategyCaseKey(cfg, c.commanders));
    }
  };
  add("dev", ARCHETYPE_DISCOVERY_BENCHMARK_V1);
  add("blind_v1", ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1);
  add("blind_v2", ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V2);
  add("blind_v3", ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V3);
  add("blind_v4", ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V4);
  return keys;
}

function buildSpentCommanderIndex(): Map<string, SpentAppearance[]> {
  const index = new Map<string, SpentAppearance[]>();
  const push = (name: string, appearance: SpentAppearance) => {
    const key = normalizeOracleName(name);
    const list = index.get(key) ?? [];
    list.push(appearance);
    index.set(key, list);
  };

  const ingest = (
    set: string,
    cases: Array<{ id: string; commanders: string[]; commandZoneConfiguration?: string }>,
  ) => {
    for (const c of cases) {
      const cfg =
        "commandZoneConfiguration" in c && c.commandZoneConfiguration
          ? c.commandZoneConfiguration
          : c.commanders.length > 1
            ? "partner_pair"
            : "single_commander";
      if (cfg === "single_commander") {
        push(c.commanders[0]!, { set, caseId: c.id, configuration: cfg, role: "single_commander" });
      } else if (cfg === "partner_pair") {
        for (const name of c.commanders) {
          push(name, { set, caseId: c.id, configuration: cfg, role: "partner_member" });
        }
      } else {
        push(c.commanders[0]!, { set, caseId: c.id, configuration: cfg, role: "commander_with_background" });
        if (c.commanders[1]) {
          push(c.commanders[1], { set, caseId: c.id, configuration: cfg, role: "background" });
        }
      }
    }
  };

  ingest("dev", ARCHETYPE_DISCOVERY_BENCHMARK_V1);
  ingest("blind_v1", ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1);
  ingest("blind_v2", ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V2);
  ingest("blind_v3", ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V3);
  ingest("blind_v4", ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V4);
  return index;
}

function analyzeCommanderIdentityOverlap(cases: BlindV5Case[]): {
  exactStrategyCaseOverlap: string[];
  commanderIdentityOverlap: Array<{
    commander: string;
    normalizedName: string;
    priorAppearances: SpentAppearance[];
    blindV4CaseId: string;
    blindV4Configuration: string;
    overlapKind: "exact_same_role" | "different_configuration_member";
  }>;
} {
  const spentKeys = buildSpentStrategyCaseKeys();
  const spentIndex = buildSpentCommanderIndex();
  const exactStrategyCaseOverlap: string[] = [];
  const commanderIdentityOverlap: Array<{
    commander: string;
    normalizedName: string;
    priorAppearances: SpentAppearance[];
    blindV4CaseId: string;
    blindV4Configuration: string;
    overlapKind: "exact_same_role" | "different_configuration_member";
  }> = [];

  for (const c of cases) {
    const key = strategyCaseKey(c.commandZoneConfiguration, c.commanders);
    if (spentKeys.has(key)) exactStrategyCaseOverlap.push(c.id);

    for (const name of c.commanders) {
      const prior = spentIndex.get(normalizeOracleName(name));
      if (!prior?.length) continue;
      const sameRole = prior.some((p) => {
        if (c.commandZoneConfiguration === "single_commander") return p.role === "single_commander";
        if (c.commandZoneConfiguration === "partner_pair") return p.role === "partner_member";
        return p.role === "commander_with_background" || p.role === "background";
      });
      commanderIdentityOverlap.push({
        commander: name,
        normalizedName: normalizeOracleName(name),
        priorAppearances: prior,
        blindV4CaseId: c.id,
        blindV4Configuration: c.commandZoneConfiguration,
        overlapKind: sameRole ? "exact_same_role" : "different_configuration_member",
      });
    }
  }

  return { exactStrategyCaseOverlap, commanderIdentityOverlap };
}

function isLiveCommanderCandidate(
  catalog: Awaited<ReturnType<typeof loadDeckResolutionCatalog>>,
  card: CatalogCard,
): boolean {
  if (!isCommanderLegal(card)) return false;
  const full = catalog.byOracleId.get(card.oracleId);
  if (!full) return false;
  return assessCommanderLegality({ catalog, card: full }).liveCommanderLegal;
}

function isLiveBackgroundCandidate(
  catalog: Awaited<ReturnType<typeof loadDeckResolutionCatalog>>,
  card: CatalogCard,
): boolean {
  if (!isBackgroundCard(card)) return false;
  const full = catalog.byOracleId.get(card.oracleId);
  if (!full) return false;
  return assessCommanderLegality({ catalog, card: full }).liveCommanderLegal;
}

function buildValidSingleCommanderSet(
  catalog: Awaited<ReturnType<typeof loadDeckResolutionCatalog>>,
  candidates: CatalogCard[],
): Set<string> {
  const out = new Set<string>();
  for (const c of candidates) {
    if (
      casePassesV11(catalog, {
        id: "candidate",
        commandZoneConfiguration: "single_commander",
        commanders: [c.canonicalName],
      })
    ) {
      out.add(normalizeOracleName(c.canonicalName));
    }
  }
  return out;
}

function casePassesV11(
  catalog: Awaited<ReturnType<typeof loadDeckResolutionCatalog>>,
  probe: { id: string; commanders: string[]; commandZoneConfiguration: string },
): boolean {
  return auditBenchmarkCaseLegalityV11({
    catalog,
    caseId: probe.id,
    set: "blind_holdout_v5_candidate",
    commanders: probe.commanders,
    commandZoneConfiguration: probe.commandZoneConfiguration,
    benchmarkMode: "LIVE_COMMANDER",
  }).v11LiveCommanderValid;
}

function isCommanderLegal(card: CatalogCard): boolean {
  const tl = (card.typeLine ?? "").toLowerCase();
  const text = (card.oracleText ?? "").toLowerCase();
  if (!tl.includes("legendary")) return false;
  if (tl.includes("background")) return false;
  if (tl.includes("legendary") && (tl.includes("creature") || tl.includes("planeswalker"))) return true;
  if (text.includes("can be your commander")) return true;
  return false;
}

function isBackgroundCard(card: CatalogCard): boolean {
  return (card.typeLine ?? "").toLowerCase().includes("background");
}

function hasChooseBackground(card: CatalogCard): boolean {
  return /choose a background/.test((card.oracleText ?? "").toLowerCase());
}

function hasPartnerKeyword(card: CatalogCard): boolean {
  const text = (card.oracleText ?? "").toLowerCase();
  return /\bpartner\b|friends forever/.test(text) && !hasChooseBackground(card);
}

function partnerCompatible(a: CatalogCard, b: CatalogCard): boolean {
  const ta = (a.oracleText ?? "").toLowerCase();
  const tb = (b.oracleText ?? "").toLowerCase();
  if (/friends forever/.test(ta) || /friends forever/.test(tb)) {
    return /friends forever/.test(ta) && /friends forever/.test(tb);
  }
  const withA = ta.match(/partner with ([^.(\n]+)/);
  const withB = tb.match(/partner with ([^.(\n]+)/);
  if (withA) {
    const target = normalizeOracleName(withA[1].trim());
    return normalizeOracleName(b.canonicalName).includes(target) || target.includes(normalizeOracleName(b.canonicalName));
  }
  if (withB) {
    const target = normalizeOracleName(withB[1].trim());
    return normalizeOracleName(a.canonicalName).includes(target) || target.includes(normalizeOracleName(a.canonicalName));
  }
  return /\bpartner\b/.test(ta) && /\bpartner\b/.test(tb);
}

function stratumMatch(category: BlindV5Category, card: CatalogCard): boolean {
  const text = (card.oracleText ?? "").toLowerCase();
  const tl = (card.typeLine ?? "").toLowerCase();
  switch (category) {
    case "narrow_single_engine":
      return /whenever|at the beginning|when /.test(text) && !/partner|choose a background|friends forever/.test(text);
    case "multiple_legitimate_plans":
      return (
        ((text.match(/\{[wubrg]\}:/g) ?? []).length >= 2 && /whenever|when /.test(text)) ||
        ((text.match(/\{[wubrg]\}:/g) ?? []).length >= 1 && (text.match(/whenever|when /g) ?? []).length >= 2)
      );
    case "broad_composite":
      return /legendary|historic|each |whenever/.test(text) && (text.match(/whenever/g) ?? []).length >= 2;
    case "triggered_engine":
      return /whenever|at the beginning|when .* enters|when .* dies|when .* cast/.test(text);
    case "activated_engine":
      return /\{t\}:|\{[wubrg]\}:/.test(text) && !/partner|choose a background/.test(text);
    case "static_state_engine":
      return /creatures you control|other creatures|each opponent|as long as|have /.test(text) && !/whenever|when /.test(text.slice(0, 80));
    case "static_restriction":
      return /each opponent|can't cast|only any time they could cast|only during|as though they had flash/.test(text);
    case "state_dependency":
      return /as long as|if you control|where x is|equal to the number of|for each .* you control/.test(text);
    case "resource_scaler":
      return /for each|convert|add .* mana|create .* treasure|draw a card/.test(text);
    case "output_multiplier":
      return /double|twice|two times|additional time|copy.*trigger|triggers an additional/.test(text);
    case "cost_dependency":
      return /sacrifice|pay .* life|discard|tap .* creature|as an additional cost/.test(text);
    case "activated_cost":
      return /\{[^}]+\},?\s*\{t\}:|\{[^}]+\},?\s*sacrifice|\{[^}]+\},?\s*discard/.test(text);
    case "combat":
      return /attacks|combat damage|can't be blocked|must be blocked|double strike|trample/.test(text);
    case "spells_casting":
      return /instant|sorcery|cast a spell|noncreature spell|magecraft|storm/.test(text);
    case "protection_engine":
      return /hexproof|indestructible|protection from|can't be the target|prevent all damage/.test(text);
    case "attrition_engine":
      return /each opponent (loses|sacrifices|discards)|sacrifice .* permanent|lose .* life.*each|drain/.test(text);
    case "resource_conversion":
      return /convert|exchange|for each .* (draw|create|add|gain)|sacrifice .* (draw|create|add|gain)/.test(text);
    case "unusual_zones":
      return /exile|from exile|cast from exile|impulse|suspension|forecast/.test(text);
    case "graveyard":
      return /graveyard|from your graveyard|dies|mill|reanimate|unearth/.test(text);
    case "artifacts":
      return /artifact|treasure|clue|food|modular|affinity for artifacts/.test(text + tl);
    case "enchantments":
      return /enchantment|aura|constellation|enchantress/.test(text + tl);
    case "tokens":
      return /create .* token|token/.test(text);
    case "counters":
      return /\+1\/\+1 counter|proliferate|counter on/.test(text);
    case "lands":
      return /landfall|play an additional land|put .* land/.test(text);
    case "typal":
      return /elf|goblin|zombie|dragon|sliver|merfolk|vampire|wizard|soldier|tribal/.test(text + tl);
    case "type_qualified_engine":
      return /if it's a|if that .* is a|whenever .* (artifact|enchantment|creature|instant|sorcery|dragon|human|knight|shrine)/.test(text);
    case "tutor_toolbox":
      return /search your library|reveal .* from your library|wish/.test(text);
    case "multi_stage_engine":
      return (/whenever/.test(text) ? 1 : 0) + (/at the beginning/.test(text) ? 1 : 0) + (/\{[wubrg]\}:/.test(text) ? 1 : 0) >= 2;
    case "unusual_mechanical":
      return /transform|daybound|disturb|foretell|mutate|companion|cascade|miracle|dredge|delve|plot/.test(text + tl);
    default:
      return false;
  }
}

function loadCandidates(catalog: Awaited<ReturnType<typeof loadDeckResolutionCatalog>>, excluded: Set<string>): CatalogCard[] {
  const out: CatalogCard[] = [];
  for (const card of catalog.byOracleId.values()) {
    const meta = catalog.paperByOracleId.get(card.oracleId);
    if (meta && !meta.paperEligible) continue;
    const candidate: CatalogCard = {
      oracleId: card.oracleId,
      canonicalName: card.canonicalName,
      oracleText: card.oracleText ?? "",
      typeLine: card.typeLine ?? "",
    };
    if (!isLiveCommanderCandidate(catalog, candidate)) continue;
    if (excluded.has(normalizeOracleName(card.canonicalName))) continue;
    out.push(candidate);
  }
  return out;
}

function loadBackgroundCandidates(
  catalog: Awaited<ReturnType<typeof loadDeckResolutionCatalog>>,
  excluded: Set<string>,
): CatalogCard[] {
  const out: CatalogCard[] = [];
  for (const card of catalog.byOracleId.values()) {
    const meta = catalog.paperByOracleId.get(card.oracleId);
    if (meta && !meta.paperEligible) continue;
    if (!isBackgroundCard(card)) continue;
    const candidate: CatalogCard = {
      oracleId: card.oracleId,
      canonicalName: card.canonicalName,
      oracleText: card.oracleText ?? "",
      typeLine: card.typeLine ?? "",
    };
    if (!isLiveBackgroundCandidate(catalog, candidate)) continue;
    if (excluded.has(normalizeOracleName(card.canonicalName))) continue;
    out.push({
      oracleId: card.oracleId,
      canonicalName: card.canonicalName,
      oracleText: card.oracleText ?? "",
      typeLine: card.typeLine ?? "",
    });
  }
  return out.sort((a, b) =>
    seededRank(SELECTION_SEED, `background:${a.oracleId}`).localeCompare(seededRank(SELECTION_SEED, `background:${b.oracleId}`)),
  );
}

function selectPartnerPairs(
  catalog: Awaited<ReturnType<typeof loadDeckResolutionCatalog>>,
  candidates: CatalogCard[],
  usedNames: Set<string>,
  quota: number,
): BlindV5Case[] {
  const partners = candidates
    .filter((c) => hasPartnerKeyword(c) && !usedNames.has(normalizeOracleName(c.canonicalName)))
    .sort((a, b) =>
      seededRank(SELECTION_SEED, `partner:${a.oracleId}`).localeCompare(seededRank(SELECTION_SEED, `partner:${b.oracleId}`)),
    );

  const cases: BlindV5Case[] = [];
  const usedInPairs = new Set<string>();

  for (const a of partners) {
    if (cases.length >= quota) break;
    const na = normalizeOracleName(a.canonicalName);
    if (usedInPairs.has(na)) continue;
    const b = partners.find((candidate) => {
      const nb = normalizeOracleName(candidate.canonicalName);
      return nb !== na && !usedInPairs.has(nb) && partnerCompatible(a, candidate);
    });
    if (!b) continue;
    const probe = {
      id: `blindv5-${String(cases.length + 1).padStart(2, "0")}-partner-pair`,
      category: "partner_pair" as const,
      commandZoneConfiguration: "partner_pair" as const,
      commanders: [a.canonicalName, b.canonicalName],
      bracket: 3 as const,
    };
    if (!casePassesV11(catalog, probe)) continue;
    usedInPairs.add(na);
    usedInPairs.add(normalizeOracleName(b.canonicalName));
    usedNames.add(na);
    usedNames.add(normalizeOracleName(b.canonicalName));
    cases.push(probe);
  }

  if (cases.length < quota) {
    throw new Error(`Partner pair stratum could only fill ${cases.length}/${quota}`);
  }
  return cases;
}

function selectCommanderBackgroundPairs(
  catalog: Awaited<ReturnType<typeof loadDeckResolutionCatalog>>,
  candidates: CatalogCard[],
  backgrounds: CatalogCard[],
  usedNames: Set<string>,
  quota: number,
  startCaseNum: number,
): BlindV5Case[] {
  const cmdPool = candidates
    .filter((c) => hasChooseBackground(c) && !usedNames.has(normalizeOracleName(c.canonicalName)))
    .sort((a, b) =>
      seededRank(SELECTION_SEED, `cmdbg:${a.oracleId}`).localeCompare(seededRank(SELECTION_SEED, `cmdbg:${b.oracleId}`)),
    );

  const cases: BlindV5Case[] = [];
  let bgIdx = 0;

  for (const cmd of cmdPool) {
    if (cases.length >= quota) break;
    while (bgIdx < backgrounds.length && usedNames.has(normalizeOracleName(backgrounds[bgIdx].canonicalName))) {
      bgIdx += 1;
    }
    if (bgIdx >= backgrounds.length) break;
    const bg = backgrounds[bgIdx];
    bgIdx += 1;
    const probe = {
      id: `blindv5-${String(startCaseNum + cases.length).padStart(2, "0")}-commander-background`,
      category: "commander_with_background" as const,
      commandZoneConfiguration: "commander_with_background" as const,
      commanders: [cmd.canonicalName, bg.canonicalName],
      bracket: 3 as const,
    };
    if (!casePassesV11(catalog, probe)) continue;
    usedNames.add(normalizeOracleName(cmd.canonicalName));
    usedNames.add(normalizeOracleName(bg.canonicalName));
    cases.push(probe);
  }

  if (cases.length < quota) {
    throw new Error(`Commander+Background stratum could only fill ${cases.length}/${quota}`);
  }
  return cases;
}

function selectSingleCases(
  catalog: Awaited<ReturnType<typeof loadDeckResolutionCatalog>>,
  candidates: CatalogCard[],
  validSingles: Set<string>,
  usedNames: Set<string>,
  startCaseNum: number,
): BlindV5Case[] {
  const cases: BlindV5Case[] = [];
  let caseNum = startCaseNum;

  for (const stratum of SINGLE_STRATA) {
    const pool = candidates
      .filter((c) => !usedNames.has(normalizeOracleName(c.canonicalName)))
      .filter((c) => !hasPartnerKeyword(c) && !hasChooseBackground(c))
      .filter((c) => stratumMatch(stratum.category, c))
      .filter((c) => validSingles.has(normalizeOracleName(c.canonicalName)))
      .sort((a, b) =>
        seededRank(SELECTION_SEED, `${stratum.category}:${a.oracleId}`).localeCompare(
          seededRank(SELECTION_SEED, `${stratum.category}:${b.oracleId}`),
        ),
      );

    const picked = pool.slice(0, stratum.quota);
    if (picked.length < stratum.quota) {
      throw new Error(`Stratum ${stratum.category} could only fill ${picked.length}/${stratum.quota}`);
    }

    for (const card of picked) {
      caseNum += 1;
      usedNames.add(normalizeOracleName(card.canonicalName));
      cases.push({
        id: `blindv5-${String(caseNum).padStart(2, "0")}-${stratum.category.replace(/_/g, "-")}`,
        category: stratum.category,
        commandZoneConfiguration: "single_commander",
        commanders: [card.canonicalName],
        bracket: 3,
      });
    }
  }

  return cases;
}

function generateTsModule(cases: BlindV5Case[]): string {
  const lines = cases.map(
    (c) =>
      `  { id: "${c.id}", category: "${c.category}", commandZoneConfiguration: "${c.commandZoneConfiguration}", commanders: [${c.commanders.map((n) => `"${n.replace(/"/g, '\\"')}"`).join(", ")}], bracket: ${c.bracket} },`,
  );
  return `/**
 * Blind archetype-discovery holdout v5 — SEALED unbiased evaluation set.
 * Generated by select-and-seal-blind-v5-holdout.ts — do not hand-edit membership.
 */
import { createHash } from "node:crypto";

export type ArchetypeDiscoveryBlindV5Category =
${[...new Set(cases.map((c) => c.category))].map((c) => `  | "${c}"`).join("\n")};

export type ArchetypeDiscoveryBlindV5CommandZoneConfiguration =
  | "single_commander"
  | "partner_pair"
  | "commander_with_background";

export type ArchetypeDiscoveryBlindV5Case = {
  id: string;
  category: ArchetypeDiscoveryBlindV5Category;
  commandZoneConfiguration: ArchetypeDiscoveryBlindV5CommandZoneConfiguration;
  commanders: string[];
  bracket: 1 | 2 | 3 | 4 | 5;
  notes?: string;
};

export const ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5: ArchetypeDiscoveryBlindV5Case[] = [
${lines.join("\n")}
];

export const ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5_VERSION = "archetype-discovery-blind-holdout-v5";
export const ARCHETYPE_DISCOVERY_BLIND_V5_STATUS = "SEALED" as const;
export const ARCHETYPE_DISCOVERY_BLIND_V5_SELECTION_SEED = "${SELECTION_SEED}";

export function blindHoldoutV5SetHash(): string {
  return createHash("sha256").update(JSON.stringify(ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5)).digest("hex");
}

export function blindHoldoutV5CategoryComposition(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5) {
    out[c.category] = (out[c.category] ?? 0) + 1;
  }
  return out;
}

export function blindHoldoutV5CommandZoneComposition(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5) {
    out[c.commandZoneConfiguration] = (out[c.commandZoneConfiguration] ?? 0) + 1;
  }
  return out;
}
`;
}

function benchmarkEligibilityPreflightV11(
  catalog: Awaited<ReturnType<typeof loadDeckResolutionCatalog>>,
  cases: BlindV5Case[],
): {
  pass: boolean;
  validCases: number;
  invalidCases: number;
  invalidCaseIds: string[];
} {
  let validCases = 0;
  let invalidCases = 0;
  const invalidCaseIds: string[] = [];
  for (const c of cases) {
    const audit = auditBenchmarkCaseLegalityV11({
      catalog,
      caseId: c.id,
      set: "blind_holdout_v5",
      commanders: c.commanders,
      commandZoneConfiguration: c.commandZoneConfiguration,
      benchmarkMode: "LIVE_COMMANDER",
    });
    if (audit.v11LiveCommanderValid) validCases += 1;
    else {
      invalidCases += 1;
      invalidCaseIds.push(c.id);
    }
  }
  return { pass: invalidCases === 0, validCases, invalidCases, invalidCaseIds };
}

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const excluded = buildExclusionSet();
  const candidates = loadCandidates(catalog, excluded);
  const backgrounds = loadBackgroundCandidates(catalog, excluded);
  const usedNames = new Set<string>();

  const validSingles = buildValidSingleCommanderSet(catalog, candidates);
  const partnerCases = selectPartnerPairs(catalog, candidates, usedNames, PARTNER_PAIR_QUOTA);
  const backgroundCases = selectCommanderBackgroundPairs(
    catalog,
    candidates,
    backgrounds,
    usedNames,
    COMMANDER_BACKGROUND_QUOTA,
    partnerCases.length,
  );
  const singleCases = selectSingleCases(
    catalog,
    candidates,
    validSingles,
    usedNames,
    partnerCases.length + backgroundCases.length,
  );
  const cases = [...partnerCases, ...backgroundCases, ...singleCases];

  if (cases.length !== EXPECTED_CASE_COUNT) {
    throw new Error(`Expected ${EXPECTED_CASE_COUNT} blind-v5 cases, got ${cases.length}`);
  }

  const overlap = analyzeCommanderIdentityOverlap(cases);
  if (overlap.exactStrategyCaseOverlap.length > 0) {
    throw new Error(`Strategy-case overlap with spent sets: ${overlap.exactStrategyCaseOverlap.join(", ")}`);
  }

  const resolution = benchmarkCommanderResolutionPreflight({
    catalog,
    commanderNames: cases.flatMap((c) => c.commanders),
  });
  const eligibility = benchmarkEligibilityPreflightV11(catalog, cases);
  const preflight = { pass: resolution.pass && eligibility.pass, resolution, eligibility };

  const membershipHash = createHash("sha256").update(JSON.stringify(cases)).digest("hex");
  const outDir = resolve(process.cwd(), "data/milestones/deck-synthesis");
  mkdirSync(outDir, { recursive: true });

  const totalSpent =
    ARCHETYPE_DISCOVERY_BENCHMARK_V1.length +
    ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1.length +
    ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V2.length +
    ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V3.length +
    ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V4.length;

  const selectionArtifact = {
    version: "archetype-discovery-blind-v5-selection-v1",
    selectionSeed: SELECTION_SEED,
    generatedAt: new Date().toISOString(),
    freezePrerequisite: "archetype-discovery-v1.6.0-freeze-manifest.json",
    exclusionPolicy: {
      devBenchmarkCount: ARCHETYPE_DISCOVERY_BENCHMARK_V1.length,
      blindV1Count: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1.length,
      blindV2Count: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V2.length,
      blindV3Count: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V3.length,
      blindV4Count: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V4.length,
      totalSpentDevelopmentCases: totalSpent,
      excludedNormalizedNames: excluded.size,
      note: "Zero strategy-case overlap with all prior spent sets (228 cases)",
    },
    commandZoneRequirements: {
      partnerPairQuota: PARTNER_PAIR_QUOTA,
      commanderBackgroundQuota: COMMANDER_BACKGROUND_QUOTA,
      singleCommanderQuota: singleCases.length,
      partnerPairActual: partnerCases.length,
      commanderBackgroundActual: backgroundCases.length,
    },
    candidateUniverse: {
      paperEligibleCommanderLegalCount: candidates.length,
      paperEligibleBackgroundCount: backgrounds.length,
      selectionMethod: "seeded deterministic stratum quotas — no discovery output inspection",
    },
    singleStrata: SINGLE_STRATA,
    commanderIdentityOverlap: overlap,
    selectedCases: cases,
    membershipHash,
    resolverPreflight: preflight.resolution,
    eligibilityPreflight: {
      pass: preflight.eligibility.pass,
      validCases: preflight.eligibility.validCases,
      invalidCases: preflight.eligibility.invalidCases,
      invalidCaseIds: preflight.eligibility.invalidCaseIds,
    },
    categoryComposition: Object.fromEntries(
      [...new Set(cases.map((c) => c.category))].map((cat) => [cat, cases.filter((c) => c.category === cat).length]),
    ),
    commandZoneComposition: Object.fromEntries(
      [...new Set(cases.map((c) => c.commandZoneConfiguration))].map((cfg) => [
        cfg,
        cases.filter((c) => c.commandZoneConfiguration === cfg).length,
      ]),
    ),
    accounting: benchmarkCaseAccounting(cases),
    status: preflight.pass ? "SEALED" : eligibility.invalidCases > 0 ? "ELIGIBILITY_PREFLIGHT_FAILED" : "RESOLVER_PREFLIGHT_FAILED",
  };

  if (!preflight.pass) {
    writeFileSync(resolve(outDir, "archetype-discovery-blind-v5-selection-artifact.json"), JSON.stringify(selectionArtifact, null, 2));
    console.error(JSON.stringify({ error: "Benchmark preflight failed", preflight }, null, 2));
    process.exit(1);
  }

  const tsPath = resolve(process.cwd(), "src/lib/deck-synthesis/archetype-discovery-blind-holdout-v5.ts");
  writeFileSync(tsPath, generateTsModule(cases));

  const sealManifest = {
    version: "archetype-discovery-blind-v5-seal-manifest",
    sealedAt: new Date().toISOString(),
    status: "SEALED",
    blindV5Hash: membershipHash,
    selectionSeed: SELECTION_SEED,
    strategyCaseCount: cases.length,
    commanderNameCount: cases.reduce((n, c) => n + c.commanders.length, 0),
    commandZoneComposition: selectionArtifact.commandZoneComposition,
    categoryComposition: selectionArtifact.categoryComposition,
    commanderIdentityOverlap: overlap,
    selectionArtifactHash: createHash("sha256").update(JSON.stringify(selectionArtifact)).digest("hex"),
    resolverPreflight: {
      pass: preflight.resolution.pass,
      resolvedCount: preflight.resolution.resolvedCount,
      ambiguousCount: preflight.resolution.ambiguousHardFails.length,
      unresolvedCount: preflight.resolution.unresolved.length,
      strategyCasesResolvedPct: 1,
      commandZoneIdentitiesResolvedPct: 1,
      ambiguity: 0,
      silentFuzzySubstitutions: 0,
    },
    eligibilityPreflight: {
      pass: preflight.eligibility.pass,
      validCases: preflight.eligibility.validCases,
      invalidCases: preflight.eligibility.invalidCases,
      invalidCaseIds: preflight.eligibility.invalidCaseIds,
    },
    discoveryEngineVersion: "archetype-discovery-v1.6.0",
    causalInferenceVersion: "commander-causal-inference-v1.6",
    commandZoneCompositionVersion: "CommandZoneComposition-v1.6.0",
    benchmarkEligibilityModel: "benchmark-commander-legality-v1.1",
    freezeManifestReference: "archetype-discovery-v1.6.0-freeze-manifest.json",
    note: "Membership frozen before any blind-v5 discovery run. LIVE_COMMANDER only.",
  };

  writeFileSync(resolve(outDir, "archetype-discovery-blind-v5-selection-artifact.json"), JSON.stringify(selectionArtifact, null, 2));
  writeFileSync(resolve(outDir, "archetype-discovery-blind-v5-seal-manifest.json"), JSON.stringify(sealManifest, null, 2));

  console.log(
    JSON.stringify(
      {
        status: "SEALED",
        blindV5Hash: membershipHash,
        strategyCaseCount: cases.length,
        commandZoneComposition: selectionArtifact.commandZoneComposition,
        commanderIdentityOverlapCount: overlap.commanderIdentityOverlap.length,
        exactStrategyCaseOverlap: overlap.exactStrategyCaseOverlap.length,
        resolverPreflight: sealManifest.resolverPreflight,
        tsPath,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
