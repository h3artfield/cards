#!/usr/bin/env npx tsx
/**
 * Blind-v3 holdout selection + resolver preflight + seal.
 * Runs AFTER Phase 5.4.2 freeze. No discovery output inspection during selection.
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
import {
  benchmarkCaseAccounting,
  benchmarkCommandZonePreflight,
} from "../src/lib/deck-synthesis/benchmark-commander-eligibility-v1";

loadProjectEnvLocal();

export type BlindV3Category =
  | "narrow_single_engine"
  | "multiple_legitimate_plans"
  | "broad_composite"
  | "triggered_engine"
  | "activated_engine"
  | "static_state_engine"
  | "resource_scaler"
  | "cost_dependency"
  | "combat"
  | "spells_casting"
  | "unusual_zones"
  | "graveyard"
  | "artifacts"
  | "enchantments"
  | "tokens"
  | "counters"
  | "lands"
  | "typal"
  | "tutor_toolbox"
  | "multi_stage_engine"
  | "unusual_mechanical"
  | "partner_pair"
  | "commander_with_background";

export type BlindV3CommandZoneConfiguration = "single_commander" | "partner_pair" | "commander_with_background";

export type BlindV3Case = {
  id: string;
  category: BlindV3Category;
  commandZoneConfiguration: BlindV3CommandZoneConfiguration;
  commanders: string[];
  bracket: 1 | 2 | 3 | 4 | 5;
};

type CatalogCard = {
  oracleId: string;
  canonicalName: string;
  oracleText: string;
  typeLine: string;
};

const SELECTION_SEED = "archetype-discovery-blind-v3-seed-20260812";

const PARTNER_PAIR_QUOTA = 5;
const COMMANDER_BACKGROUND_QUOTA = 5;

const SINGLE_STRATA: Array<{ category: BlindV3Category; quota: number }> = [
  { category: "narrow_single_engine", quota: 2 },
  { category: "multiple_legitimate_plans", quota: 2 },
  { category: "broad_composite", quota: 1 },
  { category: "triggered_engine", quota: 2 },
  { category: "activated_engine", quota: 3 },
  { category: "static_state_engine", quota: 2 },
  { category: "resource_scaler", quota: 2 },
  { category: "cost_dependency", quota: 2 },
  { category: "combat", quota: 2 },
  { category: "spells_casting", quota: 2 },
  { category: "unusual_zones", quota: 2 },
  { category: "graveyard", quota: 2 },
  { category: "artifacts", quota: 2 },
  { category: "enchantments", quota: 2 },
  { category: "tokens", quota: 2 },
  { category: "counters", quota: 2 },
  { category: "lands", quota: 2 },
  { category: "typal", quota: 2 },
  { category: "tutor_toolbox", quota: 2 },
  { category: "multi_stage_engine", quota: 1 },
  { category: "unusual_mechanical", quota: 1 },
];

function seededRank(seed: string, key: string): string {
  return createHash("sha256").update(`${seed}:${key}`).digest("hex");
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
  return out;
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

function stratumMatch(category: BlindV3Category, card: CatalogCard): boolean {
  const text = (card.oracleText ?? "").toLowerCase();
  const tl = (card.typeLine ?? "").toLowerCase();
  switch (category) {
    case "narrow_single_engine":
      return /whenever|at the beginning|when /.test(text) && !/partner|choose a background|friends forever/.test(text);
    case "multiple_legitimate_plans":
      return (text.match(/\{[wubrg]\}:/g) ?? []).length >= 2 && /whenever|when /.test(text);
    case "broad_composite":
      return /legendary|historic|each |whenever/.test(text) && (text.match(/whenever/g) ?? []).length >= 2;
    case "triggered_engine":
      return /whenever|at the beginning|when .* enters|when .* dies|when .* cast/.test(text);
    case "activated_engine":
      return /\{t\}:|\{[wubrg]\}:/.test(text) && !/partner|choose a background/.test(text);
    case "static_state_engine":
      return /creatures you control|other creatures|each opponent|as long as|have /.test(text) && !/whenever|when /.test(text.slice(0, 80));
    case "resource_scaler":
      return /for each|convert|add .* mana|create .* treasure|draw a card/.test(text);
    case "cost_dependency":
      return /sacrifice|pay .* life|discard|tap .* creature|as an additional cost/.test(text);
    case "combat":
      return /attacks|combat damage|can't be blocked|must be blocked|double strike|trample/.test(text);
    case "spells_casting":
      return /instant|sorcery|cast a spell|noncreature spell|magecraft|storm/.test(text);
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
    if (!isCommanderLegal(card)) continue;
    if (excluded.has(normalizeOracleName(card.canonicalName))) continue;
    out.push({
      oracleId: card.oracleId,
      canonicalName: card.canonicalName,
      oracleText: card.oracleText ?? "",
      typeLine: card.typeLine ?? "",
    });
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

function selectPartnerPairs(candidates: CatalogCard[], usedNames: Set<string>, quota: number): BlindV3Case[] {
  const partners = candidates
    .filter((c) => hasPartnerKeyword(c) && !usedNames.has(normalizeOracleName(c.canonicalName)))
    .sort((a, b) =>
      seededRank(SELECTION_SEED, `partner:${a.oracleId}`).localeCompare(seededRank(SELECTION_SEED, `partner:${b.oracleId}`)),
    );

  const cases: BlindV3Case[] = [];
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
    usedInPairs.add(na);
    usedInPairs.add(normalizeOracleName(b.canonicalName));
    usedNames.add(na);
    usedNames.add(normalizeOracleName(b.canonicalName));
    cases.push({
      id: `blindv3-${String(cases.length + 1).padStart(2, "0")}-partner-pair`,
      category: "partner_pair",
      commandZoneConfiguration: "partner_pair",
      commanders: [a.canonicalName, b.canonicalName],
      bracket: 3,
    });
  }

  if (cases.length < quota) {
    throw new Error(`Partner pair stratum could only fill ${cases.length}/${quota}`);
  }
  return cases;
}

function selectCommanderBackgroundPairs(
  candidates: CatalogCard[],
  backgrounds: CatalogCard[],
  usedNames: Set<string>,
  quota: number,
  startCaseNum: number,
): BlindV3Case[] {
  const cmdPool = candidates
    .filter((c) => hasChooseBackground(c) && !usedNames.has(normalizeOracleName(c.canonicalName)))
    .sort((a, b) =>
      seededRank(SELECTION_SEED, `cmdbg:${a.oracleId}`).localeCompare(seededRank(SELECTION_SEED, `cmdbg:${b.oracleId}`)),
    );

  const cases: BlindV3Case[] = [];
  let bgIdx = 0;

  for (const cmd of cmdPool) {
    if (cases.length >= quota) break;
    while (bgIdx < backgrounds.length && usedNames.has(normalizeOracleName(backgrounds[bgIdx].canonicalName))) {
      bgIdx += 1;
    }
    if (bgIdx >= backgrounds.length) break;
    const bg = backgrounds[bgIdx];
    bgIdx += 1;
    usedNames.add(normalizeOracleName(cmd.canonicalName));
    usedNames.add(normalizeOracleName(bg.canonicalName));
    cases.push({
      id: `blindv3-${String(startCaseNum + cases.length).padStart(2, "0")}-commander-background`,
      category: "commander_with_background",
      commandZoneConfiguration: "commander_with_background",
      commanders: [cmd.canonicalName, bg.canonicalName],
      bracket: 3,
    });
  }

  if (cases.length < quota) {
    throw new Error(`Commander+Background stratum could only fill ${cases.length}/${quota}`);
  }
  return cases;
}

function selectSingleCases(candidates: CatalogCard[], usedNames: Set<string>, startCaseNum: number): BlindV3Case[] {
  const cases: BlindV3Case[] = [];
  let caseNum = startCaseNum;

  for (const stratum of SINGLE_STRATA) {
    const pool = candidates
      .filter((c) => !usedNames.has(normalizeOracleName(c.canonicalName)))
      .filter((c) => !hasPartnerKeyword(c) && !hasChooseBackground(c))
      .filter((c) => stratumMatch(stratum.category, c))
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
        id: `blindv3-${String(caseNum).padStart(2, "0")}-${stratum.category.replace(/_/g, "-")}`,
        category: stratum.category,
        commandZoneConfiguration: "single_commander",
        commanders: [card.canonicalName],
        bracket: 3,
      });
    }
  }

  return cases;
}

function generateTsModule(cases: BlindV3Case[]): string {
  const lines = cases.map(
    (c) =>
      `  { id: "${c.id}", category: "${c.category}", commandZoneConfiguration: "${c.commandZoneConfiguration}", commanders: [${c.commanders.map((n) => `"${n.replace(/"/g, '\\"')}"`).join(", ")}], bracket: ${c.bracket} },`,
  );
  return `/**
 * Blind archetype-discovery holdout v3 — SEALED unbiased evaluation set.
 * Generated by select-and-seal-blind-v3-holdout.ts — do not hand-edit membership.
 */
import { createHash } from "node:crypto";

export type ArchetypeDiscoveryBlindV3Category =
${[...new Set(cases.map((c) => c.category))].map((c) => `  | "${c}"`).join("\n")};

export type ArchetypeDiscoveryBlindV3CommandZoneConfiguration =
  | "single_commander"
  | "partner_pair"
  | "commander_with_background";

export type ArchetypeDiscoveryBlindV3Case = {
  id: string;
  category: ArchetypeDiscoveryBlindV3Category;
  commandZoneConfiguration: ArchetypeDiscoveryBlindV3CommandZoneConfiguration;
  commanders: string[];
  bracket: 1 | 2 | 3 | 4 | 5;
  notes?: string;
};

export const ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V3: ArchetypeDiscoveryBlindV3Case[] = [
${lines.join("\n")}
];

export const ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V3_VERSION = "archetype-discovery-blind-holdout-v3";
export const ARCHETYPE_DISCOVERY_BLIND_V3_STATUS = "SEALED" as const;
export const ARCHETYPE_DISCOVERY_BLIND_V3_SELECTION_SEED = "${SELECTION_SEED}";

export function blindHoldoutV3SetHash(): string {
  return createHash("sha256").update(JSON.stringify(ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V3)).digest("hex");
}

export function blindHoldoutV3CategoryComposition(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V3) {
    out[c.category] = (out[c.category] ?? 0) + 1;
  }
  return out;
}

export function blindHoldoutV3CommandZoneComposition(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V3) {
    out[c.commandZoneConfiguration] = (out[c.commandZoneConfiguration] ?? 0) + 1;
  }
  return out;
}
`;
}

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const excluded = buildExclusionSet();
  const candidates = loadCandidates(catalog, excluded);
  const backgrounds = loadBackgroundCandidates(catalog, excluded);
  const usedNames = new Set<string>();

  const partnerCases = selectPartnerPairs(candidates, usedNames, PARTNER_PAIR_QUOTA);
  const backgroundCases = selectCommanderBackgroundPairs(
    candidates,
    backgrounds,
    usedNames,
    COMMANDER_BACKGROUND_QUOTA,
    partnerCases.length,
  );
  const singleCases = selectSingleCases(candidates, usedNames, partnerCases.length + backgroundCases.length);
  const cases = [...partnerCases, ...backgroundCases, ...singleCases];

  if (cases.length !== 50) {
    throw new Error(`Expected 50 blind-v3 cases, got ${cases.length}`);
  }

  const preflight = benchmarkCommandZonePreflight({
    catalog,
    set: "blind_holdout_v3",
    cases,
  });

  const membershipHash = createHash("sha256").update(JSON.stringify(cases)).digest("hex");
  const outDir = resolve(process.cwd(), "data/milestones/deck-synthesis");
  mkdirSync(outDir, { recursive: true });

  const selectionArtifact = {
    version: "archetype-discovery-blind-v3-selection-v1",
    selectionSeed: SELECTION_SEED,
    generatedAt: new Date().toISOString(),
    freezePrerequisite: "archetype-discovery-v1.4.2-freeze-manifest.json",
    exclusionPolicy: {
      devBenchmarkCount: ARCHETYPE_DISCOVERY_BENCHMARK_V1.length,
      blindV1Count: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1.length,
      blindV2Count: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V2.length,
      excludedNormalizedNames: excluded.size,
      note: "Zero strategy-case overlap with all 118 spent development cases",
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
    status: preflight.pass ? "SEALED" : preflight.eligibility.invalidCases > 0 ? "ELIGIBILITY_PREFLIGHT_FAILED" : "RESOLVER_PREFLIGHT_FAILED",
  };

  if (!preflight.pass) {
    writeFileSync(resolve(outDir, "archetype-discovery-blind-v3-selection-artifact.json"), JSON.stringify(selectionArtifact, null, 2));
    console.error(JSON.stringify({ error: "Benchmark preflight failed", preflight }, null, 2));
    process.exit(1);
  }

  const tsPath = resolve(process.cwd(), "src/lib/deck-synthesis/archetype-discovery-blind-holdout-v3.ts");
  writeFileSync(tsPath, generateTsModule(cases));

  const sealManifest = {
    version: "archetype-discovery-blind-v3-seal-manifest",
    sealedAt: new Date().toISOString(),
    status: "SEALED",
    blindV3Hash: membershipHash,
    selectionSeed: SELECTION_SEED,
    strategyCaseCount: cases.length,
    commanderNameCount: cases.reduce((n, c) => n + c.commanders.length, 0),
    commandZoneComposition: selectionArtifact.commandZoneComposition,
    categoryComposition: selectionArtifact.categoryComposition,
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
    discoveryEngineVersion: "archetype-discovery-v1.4.2",
    freezeManifestReference: "archetype-discovery-v1.4.2-freeze-manifest.json",
    note: "Membership frozen before any blind-v3 discovery run.",
  };

  writeFileSync(resolve(outDir, "archetype-discovery-blind-v3-selection-artifact.json"), JSON.stringify(selectionArtifact, null, 2));
  writeFileSync(resolve(outDir, "archetype-discovery-blind-v3-seal-manifest.json"), JSON.stringify(sealManifest, null, 2));

  console.log(
    JSON.stringify(
      {
        status: "SEALED",
        blindV3Hash: membershipHash,
        strategyCaseCount: cases.length,
        commandZoneComposition: selectionArtifact.commandZoneComposition,
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
