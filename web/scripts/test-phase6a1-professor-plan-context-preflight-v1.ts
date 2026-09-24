#!/usr/bin/env npx tsx
/** Tests for Professor planning context preflight v1. */
import { auditProfessorPlanningContextPreflight } from "./lib/phase6a1-professor-plan-context-preflight-v1";
import { buildSpentPilotAuditPlanningContext } from "./lib/phase6a1-spent-pilot-audit-context-v1";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${msg}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${msg}`);
  }
}

function main() {
  console.log("phase6a1-professor-plan-context-preflight-v1 tests");

  const muldrotha = buildSpentPilotAuditPlanningContext("multi-muldrotha");
  assert(muldrotha !== null, "Muldrotha audit context loads");
  if (muldrotha) {
    const ok = auditProfessorPlanningContextPreflight(muldrotha);
    assert(ok.pass, "Repaired Muldrotha context is satisfiable");
    assert(muldrotha.semanticOpportunities.length >= 1, "Muldrotha has at least one opportunity");
  }

  if (muldrotha) {
    const emptyOpps = { ...muldrotha, semanticOpportunities: [] };
    const bad = auditProfessorPlanningContextPreflight(emptyOpps);
    assert(!bad.pass, "Empty opportunity universe fails preflight");
    assert(
      !bad.pass && bad.issues.some((i) => i.code === "EMPTY_SEMANTIC_OPPORTUNITY_UNIVERSE"),
      "Empty opportunity universe classified correctly",
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
