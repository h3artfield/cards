#!/usr/bin/env npx tsx
/**
 * Blind-v2 holdout selection + resolver preflight + seal.
 * Selection is independent of Phase 5.3.2 discovery outputs.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeOracleName } from "@/lib/deck-builder/golden-catalog/normalize-name";
import { loadProjectEnvLocal } from "./lib/script-env";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { ARCHETYPE_DISCOVERY_BENCHMARK_V1 } from "../src/lib/deck-synthesis/archetype-discovery-benchmark-v1";
import { ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1 } from "../src/lib/deck-synthesis/archetype-discovery-blind-holdout-v1";
import {
  benchmarkCaseAccounting,
  benchmarkCommanderResolutionPreflight,
} from "../src/lib/deck-synthesis/benchmark-commander-resolver-v1";

loadProjectEnvLocal();

export type BlindV2Category =
  | "narrow_single_engine"
  | "multiple_legitimate_plans"
  | "broad_open_ended"
  | "combat_attack"
  | "damage_life"
  | "spells_casting"
  | "exile_unusual_zones"
  | "graveyard"
  | "artifacts"
  | "enchantments"
  | "counters"
  | "tokens"
  | "lands"
  | "typal"
  | "activated_engine"
  | "triggered_engine"
  | "cost_driven_engine"
  | "resource_conversion"
  | "partner_background"
  | "unusual_mechanical";

export type BlindV2Case = {
  id: string;
  category: BlindV2Category;
  commanders: string[];
  bracket: 1 | 2 | 3 | 4 | 5;
};

type CatalogCard = {
  oracleId: string;
  canonicalName: string;
  oracleText: string;
  typeLine: string;
};

const SELECTION_SEED = "archetype-discovery-blind-v2-seed-20260812";

const STRATA: Array<{ category: BlindV2Category; quota: number }> = [
  { category: "narrow_single_engine", quota: 3 },
  { category: "multiple_legitimate_plans", quota: 3 },
  { category: "broad_open_ended", quota: 2 },
  { category: "combat_attack", quota: 3 },
  { category: "damage_life", quota: 2 },
  { category: "spells_casting", quota: 3 },
  { category: "exile_unusual_zones", quota: 2 },
  { category: "graveyard", quota: 3 },
  { category: "artifacts", quota: 3 },
  { category: "enchantments", quota: 2 },
  { category: "counters", quota: 2 },
  { category: "tokens", quota: 3 },
  { category: "lands", quota: 2 },
  { category: "typal", quota: 2 },
  { category: "activated_engine", quota: 3 },
  { category: "triggered_engine", quota: 3 },
  { category: "cost_driven_engine", quota: 2 },
  { category: "resource_conversion", quota: 2 },
  { category: "partner_background", quota: 3 },
  { category: "unusual_mechanical", quota: 2 },
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
  return out;
}

function isCommanderLegal(card: CatalogCard): boolean {
  const tl = (card.typeLine ?? "").toLowerCase();
  const text = (card.oracleText ?? "").toLowerCase();
  if (!tl.includes("legendary")) return false;
  if (tl.includes("background")) return true;
  if (tl.includes("legendary") && (tl.includes("creature") || tl.includes("planeswalker"))) return true;
  if (text.includes("can be your commander")) return true;
  return false;
}

function stratumMatch(category: BlindV2Category, card: CatalogCard): boolean {
  const text = (card.oracleText ?? "").toLowerCase();
  const tl = (card.typeLine ?? "").toLowerCase();
  switch (category) {
    case "narrow_single_engine":
      return /whenever|at the beginning|when /.test(text) && !/partner|choose a background|friends forever/.test(text);
    case "multiple_legitimate_plans":
      return (text.match(/\{[wubrg]\}:/g) ?? []).length >= 2 && /whenever|when /.test(text);
    case "broad_open_ended":
      return /legendary|historic|choose a|any number of|each /.test(text) && (text.match(/whenever/g) ?? []).length >= 2;
    case "combat_attack":
      return /attacks|combat damage|can't be blocked|must be blocked/.test(text);
    case "damage_life":
      return /deals .* damage|lose .* life|gain .* life|lifelink/.test(text);
    case "spells_casting":
      return /instant|sorcery|cast a spell|noncreature spell|magecraft|storm/.test(text);
    case "exile_unusual_zones":
      return /exile|from exile|cast from exile|impulse|suspension/.test(text);
    case "graveyard":
      return /graveyard|from your graveyard|dies|mill|reanimate|unearth/.test(text);
    case "artifacts":
      return /artifact|treasure|clue|food|modular|affinity for artifacts/.test(text + tl);
    case "enchantments":
      return /enchantment|aura|constellation|enchantress/.test(text + tl);
    case "counters":
      return /\+1\/\+1 counter|proliferate|counter on/.test(text);
    case "tokens":
      return /create .* token|token/.test(text);
    case "lands":
      return /landfall|play an additional land|put .* land|land/.test(text);
    case "typal":
      return /elf|goblin|zombie|dragon|sliver|merfolk|vampire|wizard|soldier|tribal/.test(text + tl);
    case "activated_engine":
      return /\{t\}:|\{[wubrg]\}:/.test(text) && !/partner/.test(text);
    case "triggered_engine":
      return /whenever|at the beginning|when .* enters|when .* dies|when .* cast/.test(text);
    case "cost_driven_engine":
      return /sacrifice|pay .* life|discard|tap .* creature|as an additional cost/.test(text);
    case "resource_conversion":
      return /convert|for each|add .* mana|draw a card|create .* treasure/.test(text);
    case "partner_background":
      return /partner|friends forever|choose a background|background/.test(text + tl);
    case "unusual_mechanical":
      return /transform|daybound|disturb|foretell|mutate|companion|cascade|miracle|dredge|delve/.test(text + tl);
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

function stratumMatchRelaxed(category: BlindV2Category, card: CatalogCard): boolean {
  const text = (card.oracleText ?? "").toLowerCase();
  const tl = (card.typeLine ?? "").toLowerCase();
  if (stratumMatch(category, card)) return true;
  switch (category) {
    case "multiple_legitimate_plans":
      return /whenever/.test(text) && (text.match(/\{[wubrg]\}:/g) ?? []).length >= 1;
    case "narrow_single_engine":
      return /whenever|at the beginning/.test(text);
    case "triggered_engine":
      return /when |whenever/.test(text);
    case "activated_engine":
      return /\{[wubrgctpq]\}:/.test(text);
    case "partner_background":
      return /partner|background/.test(text + tl);
    default:
      return false;
  }
}

function selectCases(candidates: CatalogCard[]): { cases: BlindV2Case[]; selectionLog: unknown[] } {
  const usedNames = new Set<string>();
  const cases: BlindV2Case[] = [];
  const selectionLog: unknown[] = [];
  let caseNum = 0;

  for (const stratum of STRATA) {
    const tryPick = (relaxed: boolean): CatalogCard[] => {
      const pool = candidates
        .filter((c) => !usedNames.has(normalizeOracleName(c.canonicalName)))
        .filter((c) => (relaxed ? stratumMatchRelaxed(stratum.category, c) : stratumMatch(stratum.category, c)))
        .sort((a, b) =>
          seededRank(SELECTION_SEED, `${stratum.category}:${a.oracleId}`).localeCompare(
            seededRank(SELECTION_SEED, `${stratum.category}:${b.oracleId}`),
          ),
        );
      return pool.slice(0, stratum.quota);
    };

    let picked = tryPick(false);
    if (picked.length < stratum.quota) {
      picked = tryPick(true);
    }
    if (picked.length < stratum.quota) {
      throw new Error(`Stratum ${stratum.category} could only fill ${picked.length}/${stratum.quota}`);
    }

    for (const card of picked) {
      caseNum += 1;
      usedNames.add(normalizeOracleName(card.canonicalName));
      const entry: BlindV2Case = {
        id: `blindv2-${String(caseNum).padStart(2, "0")}-${stratum.category.replace(/_/g, "-")}`,
        category: stratum.category,
        commanders: [card.canonicalName],
        bracket: 3,
      };
      cases.push(entry);
      selectionLog.push({
        caseId: entry.id,
        category: stratum.category,
        commander: card.canonicalName,
        oracleId: card.oracleId,
        seededRank: seededRank(SELECTION_SEED, `${stratum.category}:${card.oracleId}`),
      });
    }
  }

  return { cases, selectionLog };
}

function generateTsModule(cases: BlindV2Case[]): string {
  const lines = cases.map(
    (c) =>
      `  { id: "${c.id}", category: "${c.category}", commanders: [${c.commanders.map((n) => `"${n.replace(/"/g, '\\"')}"`).join(", ")}], bracket: ${c.bracket} },`,
  );
  return `/**
 * Blind archetype-discovery holdout v2 — SEALED unbiased evaluation set.
 * Generated by select-and-seal-blind-v2-holdout.ts — do not hand-edit membership.
 */
import { createHash } from "node:crypto";

export type ArchetypeDiscoveryBlindV2Category =
${STRATA.map((s) => `  | "${s.category}"`).join("\n")};

export type ArchetypeDiscoveryBlindV2Case = {
  id: string;
  category: ArchetypeDiscoveryBlindV2Category;
  commanders: string[];
  bracket: 1 | 2 | 3 | 4 | 5;
  notes?: string;
};

export const ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V2: ArchetypeDiscoveryBlindV2Case[] = [
${lines.join("\n")}
];

export const ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V2_VERSION = "archetype-discovery-blind-holdout-v2";
export const ARCHETYPE_DISCOVERY_BLIND_V2_STATUS = "SEALED" as const;

export function blindHoldoutV2SetHash(): string {
  return createHash("sha256").update(JSON.stringify(ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V2)).digest("hex");
}

export function blindHoldoutV2CategoryComposition(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V2) {
    out[c.category] = (out[c.category] ?? 0) + 1;
  }
  return out;
}
`;
}

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const excluded = buildExclusionSet();
  const candidates = loadCandidates(catalog, excluded);
  const { cases, selectionLog } = selectCases(candidates);

  const preflight = benchmarkCommanderResolutionPreflight({
    catalog,
    commanderNames: cases.flatMap((c) => c.commanders),
  });

  const membershipHash = createHash("sha256").update(JSON.stringify(cases)).digest("hex");
  const outDir = resolve(process.cwd(), "data/milestones/deck-synthesis");
  mkdirSync(outDir, { recursive: true });

  const selectionArtifact = {
    version: "archetype-discovery-blind-v2-selection-v1",
    selectionSeed: SELECTION_SEED,
    generatedAt: new Date().toISOString(),
    exclusionPolicy: {
      devBenchmarkCount: ARCHETYPE_DISCOVERY_BENCHMARK_V1.length,
      blindV1Count: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1.length,
      excludedNormalizedNames: excluded.size,
      note: "Zero overlap with DEV 28 + spent blind-v1 40",
    },
    candidateUniverse: {
      paperEligibleCommanderLegalCount: candidates.length,
      selectionMethod: "seeded deterministic stratum quotas — no discovery output inspection",
    },
    strata: STRATA,
    selectedCases: cases,
    selectionLog,
    membershipHash,
    resolverPreflight: preflight,
    categoryComposition: Object.fromEntries(
      STRATA.map((s) => [s.category, cases.filter((c) => c.category === s.category).length]),
    ),
    accounting: benchmarkCaseAccounting(cases),
    status: preflight.pass ? "SEALED" : "RESOLVER_PREFLIGHT_FAILED",
  };

  if (!preflight.pass) {
    writeFileSync(resolve(outDir, "archetype-discovery-blind-v2-selection-artifact.json"), JSON.stringify(selectionArtifact, null, 2));
    console.error(JSON.stringify({ error: "Resolver preflight failed", preflight }, null, 2));
    process.exit(1);
  }

  const tsPath = resolve(process.cwd(), "src/lib/deck-synthesis/archetype-discovery-blind-holdout-v2.ts");
  writeFileSync(tsPath, generateTsModule(cases));

  const sealManifest = {
    version: "archetype-discovery-blind-v2-seal-manifest",
    sealedAt: new Date().toISOString(),
    status: "SEALED",
    blindV2Hash: membershipHash,
    strategyCaseCount: cases.length,
    commanderNameCount: cases.reduce((n, c) => n + c.commanders.length, 0),
    categoryComposition: selectionArtifact.categoryComposition,
    selectionSeed: SELECTION_SEED,
    selectionArtifactHash: createHash("sha256").update(JSON.stringify(selectionArtifact)).digest("hex"),
    resolverPreflight: {
      pass: preflight.pass,
      resolvedCount: preflight.resolvedCount,
      ambiguousCount: preflight.ambiguousHardFails.length,
      unresolvedCount: preflight.unresolved.length,
    },
    discoveryEngineVersion: "archetype-discovery-v1.3.2",
    note: "Membership frozen before any Phase 5.3.2 discovery run on blind-v2.",
  };

  writeFileSync(resolve(outDir, "archetype-discovery-blind-v2-selection-artifact.json"), JSON.stringify(selectionArtifact, null, 2));
  writeFileSync(resolve(outDir, "archetype-discovery-blind-v2-seal-manifest.json"), JSON.stringify(sealManifest, null, 2));

  console.log(
    JSON.stringify(
      {
        status: "SEALED",
        blindV2Hash: membershipHash,
        strategyCaseCount: cases.length,
        commanderNameCount: sealManifest.commanderNameCount,
        resolverPreflight: sealManifest.resolverPreflight,
        categoryComposition: selectionArtifact.categoryComposition,
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
