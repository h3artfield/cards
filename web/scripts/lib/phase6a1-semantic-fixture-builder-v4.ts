/**
 * DEV36 semantic fixture builder v4 — opaque package IDs, source-faithful oracle, neutral theses.
 */
import { createHash } from "node:crypto";
import type { Lens } from "./phase6a1-closure-design-v3-matrix";
import { oracleFactsForCommanders } from "./phase6a1-closure-commander-oracle-facts-v4";
import {
  buildFixtureForDevScenarioCode,
  type CaseSemanticFixture,
  DEV36_SCENARIO_CODES,
} from "./phase6a1-semantic-fixture-templates-v4";

const ROLE_VOCAB =
  /\b(engine|enabler|fuel|fodder|payoff|conversion|protection|recovery|finisher|bridge|maint|attrition payoff|combat payoff|token production|resource conversion|engine protection|commander maintenance|harm-bridge|standalone payoff|standalone engine)\b/gi;

function opaquePackageId(caseId: string, lens: Lens, index: number): string {
  const h = createHash("sha256").update(`${caseId}:${lens}:${index}`).digest("hex").slice(0, 4);
  return `pkg-${h}`;
}

function neutralize(text: string): string {
  return text.replace(ROLE_VOCAB, "loop component").replace(/\s+/g, " ").trim();
}

export function buildDev36FixtureV4(
  caseId: string,
  commanders: string[],
  commandZoneConfiguration: CaseSemanticFixture["commandZoneConfiguration"],
  scenarioCode: string,
): CaseSemanticFixture {
  const fixture = buildFixtureForDevScenarioCode(scenarioCode, caseId, commanders, commandZoneConfiguration);
  fixture.frozenFacts = { ...oracleFactsForCommanders(commanders), status: fixture.frozenFacts.status ?? "AVAILABLE" };

  for (const lens of Object.keys(fixture.lenses) as Lens[]) {
    const lensData = fixture.lenses[lens];
    let idx = 0;
    const idMap = new Map<string, string>();
    const remapId = (oldId: string) => {
      if (!idMap.has(oldId)) idMap.set(oldId, opaquePackageId(caseId, lens, idx++));
      return idMap.get(oldId)!;
    };

    for (const pkg of [...lensData.validatedPackages, ...lensData.rejectedPackages]) {
      const newId = remapId(pkg.packageRefId);
      pkg.packageRefId = newId;
      pkg.thesis = neutralize(pkg.thesis);
    }
    for (const node of lensData.resourceGraph.nodes) {
      if (idMap.has(node.nodeId)) node.nodeId = idMap.get(node.nodeId)!;
    }
    for (const edge of lensData.resourceGraph.edges) {
      if (idMap.has(edge.fromNodeId)) edge.fromNodeId = idMap.get(edge.fromNodeId)!;
      if (idMap.has(edge.toNodeId)) edge.toNodeId = idMap.get(edge.toNodeId)!;
      edge.edgeId = `${edge.fromNodeId}->${edge.toNodeId}:${edge.relationship}`;
    }
    lensData.hypotheses = lensData.hypotheses.map((h) => ({
      ...h,
      strategyStatement: neutralize(h.strategyStatement),
    }));
  }
  return fixture;
}

export { DEV36_SCENARIO_CODES };
