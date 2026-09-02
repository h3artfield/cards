/**
 * Professor v4 pass-3 gate — decide whether a second expensive Creative call is warranted.
 */
import type {
  ResearchChallengeMenuItemV4,
  ResearchPacketV4,
  ResearchProblemV4,
  ResearchProfessorOutputV4,
  ResearchSemanticDiscoveryV4,
} from "./professor-research-contracts-v4";
import type { CreativeProfessorPass1V4 } from "./professor-creative-pass1-contracts-v4";

export const PROFESSOR_V4_PASS3_GATE_V1_VERSION = "professor-v4-pass3-gate-v1";

export type Pass3GateDecisionV4 = {
  warrantSecondCreativeCall: boolean;
  secondCallReasons: string[];
  researchPacket: ResearchPacketV4 | null;
};

const MATERIAL_DISCOVERY_NOVELTY = new Set<ResearchSemanticDiscoveryV4["noveltyEstimate"]>(["HIGH", "MODERATE"]);

export function evaluatePass3GateV4(args: {
  pass1: CreativeProfessorPass1V4;
  semanticDiscoveries: ResearchSemanticDiscoveryV4[];
  problems: ResearchProblemV4[];
  challengeMenu: ResearchChallengeMenuItemV4[];
}): Pass3GateDecisionV4 {
  const materialDiscoveries = args.semanticDiscoveries.filter((d) => MATERIAL_DISCOVERY_NOVELTY.has(d.noveltyEstimate));
  const highProblems = args.problems.filter((p) => p.severity === "HIGH" && p.type === "MECHANICAL_INVALIDITY");
  const secondCallReasons: string[] = [];

  for (const discovery of materialDiscoveries) {
    if (discovery.noveltyEstimate === "HIGH") {
      secondCallReasons.push(`Novel mechanical branch: ${discovery.mechanicalPattern}`);
    }
  }
  for (const problem of highProblems) {
    secondCallReasons.push(`Material problem: ${problem.description}`);
  }

  const hasCrossResourceDiscovery = args.semanticDiscoveries.some(
    (d) => d.mechanicalPattern.includes("TOKEN_CREATION") || d.mechanicalPattern.includes("MODIFY_TOKEN_CREATION"),
  );
  if (hasCrossResourceDiscovery && materialDiscoveries.length > 0) {
    secondCallReasons.push("Cross-resource token creation intersects sacrifice/value engines in a novel way.");
  }

  const warrantSecondCreativeCall = secondCallReasons.length > 0;

  if (!warrantSecondCreativeCall) {
    return {
      warrantSecondCreativeCall: false,
      secondCallReasons: [],
      researchPacket: null,
    };
  }

  const researchPacket: ResearchPacketV4 = {
    originalThesisSummary: args.pass1.strategicThesis,
    verifiedStrengths: args.pass1.packages.map((p) => `${p.concept}: ${p.purpose}`).slice(0, 4),
    materialProblems: args.problems.filter((p) => p.severity !== "LOW").map((p) => p.description),
    genuinelyNewDiscoveries: materialDiscoveries.map((d) => `${d.mechanicalPattern} — ${d.whyItMatters}`),
    recommendedStrategicChanges: args.challengeMenu.map((c) => c.direction),
    keyOracleMechanismEvidence: materialDiscoveries.flatMap((d) =>
      d.evidenceRefs
        .filter((r) => r.kind === "MECHANISM_FACT")
        .flatMap((r) => (r.kind === "MECHANISM_FACT" ? r.factIds : [])),
    ),
  };

  return { warrantSecondCreativeCall: true, secondCallReasons, researchPacket };
}

export function applyPass3GateToResearchOutputV4(
  partial: Omit<ResearchProfessorOutputV4, "warrantSecondCreativeCall" | "secondCallReasons" | "researchPacket"> & {
    pass1: CreativeProfessorPass1V4;
  },
): ResearchProfessorOutputV4 {
  const gate = evaluatePass3GateV4({
    pass1: partial.pass1,
    semanticDiscoveries: partial.semanticDiscoveries,
    problems: partial.problems,
    challengeMenu: partial.challengeMenu,
  });
  const { pass1: _ignored, ...rest } = partial;
  return {
    ...rest,
    warrantSecondCreativeCall: gate.warrantSecondCreativeCall,
    secondCallReasons: gate.secondCallReasons,
    researchPacket: gate.researchPacket,
  };
}
