/**
 * Derive package dependency/overlap edges from sealed semantic package content.
 */
import type { SemanticPackage } from "../../src/lib/deck-synthesis/professor-planning-contracts-v2";

export const PACKAGE_SYNERGY_GRAPH_V1_VERSION = "phase6a1-package-synergy-graph-v1";

const STOP = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "to",
  "for",
  "with",
  "from",
  "into",
  "that",
  "this",
  "when",
  "while",
  "through",
  "other",
  "more",
  "each",
  "both",
  "can",
  "may",
  "use",
  "uses",
  "using",
  "card",
  "cards",
  "permanent",
  "permanents",
  "package",
  "commander",
  "mana",
  "ability",
  "abilities",
]);

export type PackageSynergyGraph = {
  dependsOnPackageIds: Map<string, Set<string>>;
  overlapsWithPackageIds: Map<string, Set<string>>;
  resourceTokens: Map<string, Set<string>>;
  engineTokens: Map<string, Set<string>>;
};

function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    const t = raw.trim();
    if (t.length < 4 || STOP.has(t)) continue;
    tokens.add(t);
  }
  return tokens;
}

function packageCorpus(pkg: SemanticPackage): string {
  return [
    pkg.title,
    pkg.purpose,
    ...pkg.causalChain,
    ...pkg.requiredResources,
    ...pkg.producedResources,
    ...pkg.payoffs,
    pkg.commanderContribution,
    pkg.commanderIndependentFunction,
    ...pkg.semanticRequirements.map((s) => s.requirement),
  ].join("\n");
}

function engineTokensFor(pkg: SemanticPackage): Set<string> {
  const text = packageCorpus(pkg);
  const engines = new Set<string>();
  if (/\bland\b|\bgraveyard\b|\brecur/.test(text)) engines.add("land");
  if (/\bartifact\b|\btoken\b|\bsacrifice/.test(text)) engines.add("artifact");
  if (/\battack\b|\bcombat\b|\bdamage\b/.test(text)) engines.add("combat");
  if (/\bdraw\b|\bcard flow\b|\bselection\b/.test(text)) engines.add("draw");
  if (/\bcounter\b|\bgrowth\b|\bscale\b/.test(text)) engines.add("scale");
  if (/\bexile\b|\bcast\b|\bspell\b/.test(text)) engines.add("spells");
  if (/\bgraveyard\b|\brecur/.test(text)) engines.add("graveyard");
  if (/\bbridge\b|\bintegrat|\bconnect|\boverlap|\bboth mechanisms/.test(text)) engines.add("bridge");
  return engines;
}

function resourceTokensFor(pkg: SemanticPackage): Set<string> {
  const tokens = new Set<string>();
  for (const line of [...pkg.requiredResources, ...pkg.producedResources]) {
    for (const t of tokenize(line)) tokens.add(t);
  }
  return tokens;
}

export function buildPackageSynergyGraph(packages: SemanticPackage[]): PackageSynergyGraph {
  const dependsOnPackageIds = new Map<string, Set<string>>();
  const overlapsWithPackageIds = new Map<string, Set<string>>();
  const resourceTokens = new Map<string, Set<string>>();
  const engineTokens = new Map<string, Set<string>>();

  for (const pkg of packages) {
    dependsOnPackageIds.set(pkg.packageId, new Set(pkg.dependsOnPackageIds));
    overlapsWithPackageIds.set(pkg.packageId, new Set(pkg.overlapsWithPackageIds));
    resourceTokens.set(pkg.packageId, resourceTokensFor(pkg));
    engineTokens.set(pkg.packageId, engineTokensFor(pkg));
  }

  for (let i = 0; i < packages.length; i++) {
    for (let j = i + 1; j < packages.length; j++) {
      const a = packages[i];
      const b = packages[j];
      const aRes = resourceTokens.get(a.packageId)!;
      const bRes = resourceTokens.get(b.packageId)!;
      const aReq = tokenize(a.requiredResources.join(" "));
      const bProd = tokenize(b.producedResources.join(" "));
      const bReq = tokenize(b.requiredResources.join(" "));
      const aProd = tokenize(a.producedResources.join(" "));

      const aNeedsB = [...aReq].some((t) => bProd.has(t) || bRes.has(t));
      const bNeedsA = [...bReq].some((t) => aProd.has(t) || aRes.has(t));
      const corpusOverlap = [...tokenize(packageCorpus(a))].filter((t) => tokenize(packageCorpus(b)).has(t)).length;
      const engineOverlap = [...engineTokens.get(a.packageId)!].filter((t) => engineTokens.get(b.packageId)!.has(t)).length;

      if (aNeedsB) dependsOnPackageIds.get(a.packageId)!.add(b.packageId);
      if (bNeedsA) dependsOnPackageIds.get(b.packageId)!.add(a.packageId);
      if (corpusOverlap >= 2 || engineOverlap >= 2 || aNeedsB || bNeedsA) {
        overlapsWithPackageIds.get(a.packageId)!.add(b.packageId);
        overlapsWithPackageIds.get(b.packageId)!.add(a.packageId);
      }
    }
  }

  return { dependsOnPackageIds, overlapsWithPackageIds, resourceTokens, engineTokens };
}

export function enrichPackagesWithSynergyGraph(packages: SemanticPackage[]): SemanticPackage[] {
  const graph = buildPackageSynergyGraph(packages);
  return packages.map((pkg) => ({
    ...pkg,
    dependsOnPackageIds: [...(graph.dependsOnPackageIds.get(pkg.packageId) ?? [])].sort(),
    overlapsWithPackageIds: [...(graph.overlapsWithPackageIds.get(pkg.packageId) ?? [])].sort(),
  }));
}
