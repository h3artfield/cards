#!/usr/bin/env npx tsx
/** Professor v4 Creative + Research team architecture — offline fixture acceptance, 0 OpenAI. */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateCreativeProfessorPass1V4 } from "../src/lib/deck-synthesis/professor-creative-pass1-contracts-v4";
import { validateResearchProfessorOutputV4 } from "../src/lib/deck-synthesis/professor-research-contracts-v4";
import { MILESTONES } from "./lib/phase6a1-pinned-implementation-container-v1";
import {
  loadChatterfangCreativePass1FixtureV1,
  loadMerenCreativePass1FixtureFromDumbProfessorArmV1,
  MEREN_CREATIVE_PASS1_FIXTURE_PATH,
} from "./lib/phase6a1-professor-v4-creative-pass1-fixtures-v1";
import {
  buildChatterfangFrozenContextV1,
  loadMerenFrozenContextV1,
  PROFESSOR_V4_CREATIVE_RESEARCH_TEAM_DECISION_V1,
  runProfessorV4CreativeResearchOrchestrationOfflineV1,
} from "./lib/phase6a1-professor-v4-creative-research-orchestration-v1";

const OUT_MANIFEST = resolve(MILESTONES, "phase6a1-professor-v4-creative-research-team-manifest-v1.json");

type Check = { id: string; pass: boolean; detail: string };

function main() {
  const checks: Check[] = [];

  const merenPass1Raw = loadMerenCreativePass1FixtureFromDumbProfessorArmV1();
  writeFileSync(MEREN_CREATIVE_PASS1_FIXTURE_PATH, JSON.stringify(merenPass1Raw, null, 2));
  const merenPass1 = validateCreativeProfessorPass1V4(merenPass1Raw);
  checks.push({
    id: "meren-creative-pass1-validates",
    pass: merenPass1.ok,
    detail: merenPass1.ok ? "ok" : merenPass1.issues.map((i) => i.message).join("; "),
  });

  const chatterfangPass1Raw = loadChatterfangCreativePass1FixtureV1();
  const chatterfangPass1 = validateCreativeProfessorPass1V4(chatterfangPass1Raw);
  checks.push({
    id: "chatterfang-creative-pass1-validates",
    pass: chatterfangPass1.ok,
    detail: chatterfangPass1.ok ? "ok" : chatterfangPass1.issues.map((i) => i.message).join("; "),
  });

  const merenResult = runProfessorV4CreativeResearchOrchestrationOfflineV1({
    caseKey: "meren",
    mechanismTruthCaseId: "single-graveyard-meren",
    creativePass1: merenPass1Raw,
    frozenContext: loadMerenFrozenContextV1(),
  });
  checks.push({
    id: "meren-warrant-second-call-false",
    pass: merenResult.researchReport.warrantSecondCreativeCall === false,
    detail: `warrantSecondCreativeCall=${merenResult.researchReport.warrantSecondCreativeCall}`,
  });
  checks.push({
    id: "meren-no-research-packet",
    pass: merenResult.researchReport.researchPacket === null,
    detail: merenResult.researchReport.researchPacket ? "unexpected packet" : "null as expected",
  });
  checks.push({
    id: "meren-validator-did-not-terminate",
    pass: merenResult.orchestrationTerminatedByValidator === false,
    detail: "orchestrationTerminatedByValidator=false",
  });

  const chatterfangResult = runProfessorV4CreativeResearchOrchestrationOfflineV1({
    caseKey: "chatterfang",
    mechanismTruthCaseId: "multi-chatterfang",
    creativePass1: chatterfangPass1Raw,
    frozenContext: buildChatterfangFrozenContextV1(),
  });
  const crossResource = chatterfangResult.researchReport.semanticDiscoveries.find((d) =>
    d.mechanicalPattern.includes("TOKEN_CREATION_CROSS_RESOURCE"),
  );
  checks.push({
    id: "chatterfang-cross-resource-discovery",
    pass: Boolean(crossResource),
    detail: crossResource?.mechanicalPattern ?? "missing TOKEN_CREATION_CROSS_RESOURCE discovery",
  });
  checks.push({
    id: "chatterfang-warrant-second-call-true",
    pass: chatterfangResult.researchReport.warrantSecondCreativeCall === true,
    detail: `warrantSecondCreativeCall=${chatterfangResult.researchReport.warrantSecondCreativeCall}; reasons=${chatterfangResult.researchReport.secondCallReasons.join(" | ")}`,
  });
  checks.push({
    id: "chatterfang-compact-research-packet",
    pass: Boolean(chatterfangResult.researchReport.researchPacket?.genuinelyNewDiscoveries.length),
    detail: `discoveries=${chatterfangResult.researchReport.researchPacket?.genuinelyNewDiscoveries.length ?? 0}`,
  });

  const merenResearchValid = validateResearchProfessorOutputV4(merenResult.researchReport);
  const chatterfangResearchValid = validateResearchProfessorOutputV4(chatterfangResult.researchReport);
  checks.push({
    id: "research-contracts-validate",
    pass: merenResearchValid.ok && chatterfangResearchValid.ok,
    detail: [
      merenResearchValid.ok ? "meren ok" : merenResearchValid.issues.join("; "),
      chatterfangResearchValid.ok ? "chatterfang ok" : chatterfangResearchValid.issues.join("; "),
    ].join(" | "),
  });

  const pass = checks.every((c) => c.pass);
  const manifest = {
    version: "phase6a1-professor-v4-creative-research-team-manifest-v1",
    generatedAt: new Date().toISOString(),
    decision: PROFESSOR_V4_CREATIVE_RESEARCH_TEAM_DECISION_V1,
    openAiCalls: 0,
    pass,
    checks,
    artifacts: {
      merenCreativePass1Fixture: MEREN_CREATIVE_PASS1_FIXTURE_PATH,
      chatterfangCreativePass1Fixture: resolve(MILESTONES, "phase6a1-professor-v4-creative-pass1-chatterfang-fixture-v1.json"),
      merenResult: resolve(MILESTONES, "phase6a1-professor-v4-creative-research-meren-result-v1.json"),
      chatterfangResult: resolve(MILESTONES, "phase6a1-professor-v4-creative-research-chatterfang-result-v1.json"),
    },
  };
  writeFileSync(OUT_MANIFEST, JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest, null, 2));
  if (!pass) process.exit(1);
}

main();
