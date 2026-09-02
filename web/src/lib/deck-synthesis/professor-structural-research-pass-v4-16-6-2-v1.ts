/**
 * Professor v4.16.6.2 — mission compilation for structural dispatch.
 */
import {
  compileStructuralSearchV4166,
  type StructuralSearchExecutionV4166,
} from "./professor-structural-search-execution-v4-16-6-v1";
import type { AggregatedStructuralMissionV4166 } from "./professor-structural-search-planner-v4-16-6-v1";
import { verifyCorePackageV41662 } from "./professor-strategic-progress-v4-16-6-2-v1";
import { assessTheoryRealizationV4165 } from "./professor-theory-realization-v4-16-5-v1";

export const PROFESSOR_STRUCTURAL_RESEARCH_PASS_V4_16_6_2_V1_VERSION = "professor-structural-research-pass-v4-16-6-2-v1";

export function compileMissionForDispatchV41662(args: {
  mission: AggregatedStructuralMissionV4166;
  theoryRealizations: ReturnType<typeof assessTheoryRealizationV4165>;
  commanderColorIdentity: string[];
}): AggregatedStructuralMissionV4166 {
  let mission = args.mission;
  if (mission.searchQueries.length === 0 || mission.searchDomains.length === 0) {
    if (mission.deficitFunction === "core-package-realization") {
      const packageId = mission.targetPackages[0] ?? mission.need.replace("realize-package:", "");
      const realization = args.theoryRealizations.find((r) => r.packageId === packageId);
      const verification = realization
        ? verifyCorePackageV41662({ realization, commanderColorIdentity: args.commanderColorIdentity })
        : null;
      if (verification?.decision === "ABANDON_AND_REPLACE") {
        throw new Error(`STRUCTURAL_QUERY_COMPILATION_FAILED: package ${packageId} abandoned`);
      }
      const members = realization?.candidateCards.slice(0, 6).join("|") ?? packageId;
      mission = {
        ...mission,
        searchQueries: [`function=core-package-realization;package=${packageId};members=${members}`],
        searchDomains: ["semantic_oracle", "package_rag", "golden_catalog"],
      };
    } else {
      mission = {
        ...mission,
        searchQueries: [`function=${mission.deficitFunction};need=${mission.need}`],
        searchDomains: mission.searchDomains.length > 0 ? mission.searchDomains : ["golden_catalog", "semantic_oracle"],
      };
    }
  }
  const compiled = compileStructuralSearchV4166({ mission });
  if (!compiled.compiledQuery?.trim()) {
    throw new Error("STRUCTURAL_QUERY_COMPILATION_FAILED");
  }
  return mission;
}

export type { StructuralSearchExecutionV4166 };
