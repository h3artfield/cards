/**
 * DEV36 semantic fixture builder v6 — canonical catalog pins, no proxy role tags.
 */
import { createHash } from "node:crypto";
import type { Lens } from "./phase6a1-closure-design-v3-matrix";
import type { GoldenCatalogIndex } from "./load-golden-catalog-index";
import { canonicalFactsForCommanders } from "./phase6a1-closure-commander-canonical-facts-v6";
import {
  buildFixtureForDevScenarioCode,
  type CaseSemanticFixture,
  DEV36_SCENARIO_CODES,
} from "./phase6a1-semantic-fixture-templates-v4";

const ROLE_VOCAB =
  /\b(engine|enabler|fuel|fodder|payoff|conversion|protection|recovery|finisher|bridge|maint|attrition payoff|combat payoff|token production|resource conversion|engine protection|commander maintenance|harm-bridge|standalone payoff|standalone engine)\b/gi;

const PROXY_TAGS = new Set([
  "setup_enabler",
  "stabilization_pressure",
  "zone_recovery",
  "terminal_outcome",
  "cross_engine_link",
  "combat_pressure",
  "renewable_density",
  "zone_volatility",
  "partner_handoff",
]);

function opaquePackageId(caseId: string, lens: Lens, index: number): string {
  const h = createHash("sha256").update(`${caseId}:${lens}:${index}`).digest("hex").slice(0, 4);
  return `pkg-${h}`;
}

function neutralize(text: string): string {
  return text.replace(ROLE_VOCAB, "loop component").replace(/\s+/g, " ").trim();
}

function stripProxyTags(values: string[] | undefined): string[] {
  return (values ?? []).filter((v) => !PROXY_TAGS.has(v));
}

export function buildDev36FixtureV6(
  catalog: GoldenCatalogIndex,
  caseId: string,
  commanders: string[],
  commandZoneConfiguration: CaseSemanticFixture["commandZoneConfiguration"],
  scenarioCode: string,
): CaseSemanticFixture {
  const fixture = buildFixtureForDevScenarioCode(scenarioCode, caseId, commanders, commandZoneConfiguration);
  const canonical = canonicalFactsForCommanders(catalog, commanders);
  fixture.frozenFacts = { ...canonical, status: fixture.frozenFacts.status ?? "AVAILABLE" };

  for (const lens of Object.keys(fixture.lenses) as Lens[]) {
    const lensData = fixture.lenses[lens];
    let idx = 0;
    const idMap = new Map<string, string>();
    const remapId = (oldId: string) => {
      if (!idMap.has(oldId)) idMap.set(oldId, opaquePackageId(caseId, lens, idx++));
      return idMap.get(oldId)!;
    };

    const hypId = `${caseId}-${lens}-hyp`;
    const singleHypothesis = lensData.hypotheses.length === 1;
    for (const pkg of [...lensData.validatedPackages, ...lensData.rejectedPackages]) {
      const newId = remapId(pkg.packageRefId);
      pkg.packageRefId = newId;
      pkg.thesis = neutralize(pkg.thesis);
      pkg.semanticRequirements = stripProxyTags(pkg.semanticRequirements);
      pkg.payoffs = stripProxyTags(pkg.payoffs);
      pkg.resourceTransformations = (pkg.resourceTransformations ?? []).filter((t) => t !== "cross_engine_link");
      if (lens === "INDEPENDENT_SYNERGY") pkg.commanderDependencies = [];
    }
    for (const node of lensData.resourceGraph.nodes) {
      if (idMap.has(node.nodeId)) node.nodeId = idMap.get(node.nodeId)!;
    }
    for (const edge of lensData.resourceGraph.edges) {
      if (idMap.has(edge.fromNodeId)) edge.fromNodeId = idMap.get(edge.fromNodeId)!;
      if (idMap.has(edge.toNodeId)) edge.toNodeId = idMap.get(edge.toNodeId)!;
      edge.edgeId = `${edge.fromNodeId}->${edge.toNodeId}:${edge.relationship}`;
    }
    lensData.hypotheses = lensData.hypotheses.map((h, hi) => ({
      ...h,
      hypothesisId: singleHypothesis ? hypId : `${caseId}-${lens}-hyp-${hi}`,
      strategyStatement: neutralize(h.strategyStatement),
      commanderEvidenceRefs: canonical.commanderRelevantAbilities.slice(0, 3),
      commanderDependencies: lens === "INDEPENDENT_SYNERGY" ? [] : h.commanderDependencies,
    }));
  }
  return fixture;
}

export { DEV36_SCENARIO_CODES };
