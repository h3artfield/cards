#!/usr/bin/env npx tsx
import { loadProjectEnvLocal } from "./lib/script-env";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { loadShadowSemanticIndex } from "../src/lib/commander-strategy/shadow-semantic-index";
import {
  resolveBenchmarkCommanderOracleIds,
  buildCommanderMechanicalProfile,
  extractMechanicalMotifs,
  extractDirectionAnchors,
  discoverArchetypes,
  buildGlobalCatalogSemanticIndex,
} from "../src/lib/deck-synthesis";

loadProjectEnvLocal();

const cases = [
  { cohort: "A", id: "blindv3-01", names: ["Silvar, Devourer of the Free", "Trynn, Champion of Freedom"] },
  { cohort: "A", id: "blindv3-03", names: ["Khorvath Brightflame", "Sylvia Brightspear"] },
  { cohort: "A", id: "blindv3-04", names: ["Alphinaud Leveilleur", "Alisaie Leveilleur"] },
  { cohort: "B", id: "blindv3-30", names: ["Teferi, Time Raveler"] },
  { cohort: "B", id: "blindv3-32", names: ["Rayami, First of the Fallen"] },
  { cohort: "B", id: "blindv3-37", names: ["Go-Shintai of Ancient Wars"] },
  { cohort: "B", id: "blindv3-48", names: ["Sivitri, Dragon Master"] },
];

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const shadowIndex = await loadShadowSemanticIndex();
  const globalCatalogIndex = buildGlobalCatalogSemanticIndex({ catalog, shadowIndex });

  for (const c of cases) {
    const res = resolveBenchmarkCommanderOracleIds(catalog, c.names);
    const report = discoverArchetypes(
      { commanderOracleIds: res.oracleIds, bracket: 3 },
      { catalog, shadowIndex, globalCatalogIndex },
    );
    const profile = buildCommanderMechanicalProfile({
      commanderOracleIds: res.oracleIds,
      catalogByOracleId: catalog.byOracleId,
      shadowIndex,
    })!;
    const motifs = extractMechanicalMotifs(profile);
    const anchors = extractDirectionAnchors({ profile, motifs });
    const oracle = res.oracleIds.map((id) => catalog.byOracleId.get(id)?.oracleText ?? "").join("\n//\n");
    const primary = report.buildDirections.find((d) => d.rank === 1);
    const causal = profile.causalRoles;

    console.log(
      JSON.stringify(
        {
          cohort: c.cohort,
          id: c.id,
          names: c.names,
          resolved: res.resolved,
          evaluationContextStatus: report.evaluationContextStatus,
          contextRequirements: report.contextRequirements,
          primary: primary?.mechanicalDescription ?? null,
          directionCount: report.buildDirections.length,
          anchors: anchors.map((a) => `${a.anchorKind}:${a.mechanism}:${a.subject}`),
          driverMotifs: motifs.filter((m) => m.causalPosition === "DRIVER").map((m) => m.motifId),
          causalTriggers: causal.engineTriggers,
          causalActions: causal.engineActions,
          causalPayoffs: causal.enginePayoffs,
          stateChangeTriggers: causal.stateChangeTriggers?.length ?? 0,
          tutorCheats: causal.tutorCheats?.length ?? 0,
          typeQualified: causal.typeQualifiedTriggers?.length ?? 0,
          oracleText: oracle.slice(0, 500),
        },
        null,
        2,
      ),
    );
  }
}

main().catch(console.error);
