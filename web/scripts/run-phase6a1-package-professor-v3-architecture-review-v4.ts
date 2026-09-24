#!/usr/bin/env npx tsx
/** Package Professor v3 architecture review bundle v4. */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { MILESTONES, REPO, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

const WEB = resolve(REPO, "web");
const OUT_ZIP = resolve(MILESTONES, "phase6a1-professor-v3-architecture-review-v4.zip");
const OUT_MANIFEST = resolve(MILESTONES, "phase6a1-professor-v3-architecture-review-v4-manifest.json");

const BUNDLE_FILES: Array<{ bundlePath: string; sourcePath: string }> = [
  { bundlePath: "src/lib/deck-synthesis/professor-planning-contracts-v3.ts", sourcePath: resolve(WEB, "src/lib/deck-synthesis/professor-planning-contracts-v3.ts") },
  { bundlePath: "src/lib/deck-synthesis/professor-planning-evidence-v3.ts", sourcePath: resolve(WEB, "src/lib/deck-synthesis/professor-planning-evidence-v3.ts") },
  { bundlePath: "src/lib/deck-synthesis/professor-planning-evidence-resolver-v3.ts", sourcePath: resolve(WEB, "src/lib/deck-synthesis/professor-planning-evidence-resolver-v3.ts") },
  { bundlePath: "src/lib/deck-synthesis/professor-v3-evidence-ledger-v1.ts", sourcePath: resolve(WEB, "src/lib/deck-synthesis/professor-v3-evidence-ledger-v1.ts") },
  { bundlePath: "src/lib/deck-synthesis/strategic-assertion-vocabulary-v3.ts", sourcePath: resolve(WEB, "src/lib/deck-synthesis/strategic-assertion-vocabulary-v3.ts") },
  { bundlePath: "src/lib/deck-synthesis/typed-assertion-grounding-v3.ts", sourcePath: resolve(WEB, "src/lib/deck-synthesis/typed-assertion-grounding-v3.ts") },
  { bundlePath: "src/lib/deck-synthesis/mechanism-claim-grounding-v3.ts", sourcePath: resolve(WEB, "src/lib/deck-synthesis/mechanism-claim-grounding-v3.ts") },
  { bundlePath: "src/lib/deck-synthesis/strategy-package-validator-v3.ts", sourcePath: resolve(WEB, "src/lib/deck-synthesis/strategy-package-validator-v3.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-prompt-payload-v1.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-prompt-payload-v1.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-plan-prompt-v3.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-plan-prompt-v3.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-plan-normalizer-v3.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-plan-normalizer-v3.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-plan-agent-v3.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-plan-agent-v3.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-plan-context-builder-v3.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-plan-context-builder-v3.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-plan-context-preflight-v3.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-plan-context-preflight-v3.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-fixture-assertions-v1.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-fixture-assertions-v1.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-grounding-fixtures-v1.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-grounding-fixtures-v1.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-grounding-fixtures-v2.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-grounding-fixtures-v2.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-grounding-fixtures-v3.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-grounding-fixtures-v3.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-grounding-fixtures-v4.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-grounding-fixtures-v4.ts") },
  { bundlePath: "scripts/run-phase6a1-test-professor-v3-grounding-fixtures-v4.ts", sourcePath: resolve(WEB, "scripts/run-phase6a1-test-professor-v3-grounding-fixtures-v4.ts") },
  { bundlePath: "scripts/run-phase6a1-test-professor-v3-prompt-payload-snapshot-v1.ts", sourcePath: resolve(WEB, "scripts/run-phase6a1-test-professor-v3-prompt-payload-snapshot-v1.ts") },
  { bundlePath: "milestones/deck-synthesis/phase6a1-professor-v3-grounding-fixtures-audit-v4.json", sourcePath: resolve(MILESTONES, "phase6a1-professor-v3-grounding-fixtures-audit-v4.json") },
  { bundlePath: "milestones/deck-synthesis/phase6a1-professor-v3-prompt-payload-snapshot-muldrotha-v1.json", sourcePath: resolve(MILESTONES, "phase6a1-professor-v3-prompt-payload-snapshot-muldrotha-v1.json") },
  { bundlePath: "milestones/deck-synthesis/phase6a1-professor-v3-architecture-review-report-v4.json", sourcePath: resolve(MILESTONES, "phase6a1-professor-v3-architecture-review-report-v4.json") },
  { bundlePath: "milestones/deck-synthesis/phase6a1-professor-v3-architecture-review-report-v3.json", sourcePath: resolve(MILESTONES, "phase6a1-professor-v3-architecture-review-report-v3.json") },
  { bundlePath: "milestones/deck-synthesis/phase6a1-professor-plan-serialization-pilot-gate-v4-supersession-v1.json", sourcePath: resolve(MILESTONES, "phase6a1-professor-plan-serialization-pilot-gate-v4-supersession-v1.json") },
  { bundlePath: "scripts/run-phase6a1-report-professor-v3-architecture-v4.ts", sourcePath: resolve(WEB, "scripts/run-phase6a1-report-professor-v3-architecture-v4.ts") },
  { bundlePath: "scripts/run-phase6a1-package-professor-v3-architecture-review-v4.ts", sourcePath: resolve(WEB, "scripts/run-phase6a1-package-professor-v3-architecture-review-v4.ts") },
];

function sha256Bytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function main() {
  for (const file of BUNDLE_FILES) {
    if (!existsSync(file.sourcePath)) throw new Error(`Missing bundle source: ${file.sourcePath}`);
  }

  const staging = resolve(MILESTONES, ".review-bundle-professor-v3-architecture-v4-staging");
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });

  const files = BUNDLE_FILES.map((file) => {
    const dest = join(staging, file.bundlePath);
    mkdirSync(join(dest, ".."), { recursive: true });
    cpSync(file.sourcePath, dest);
    return { path: file.bundlePath, sha256: sha256File(dest), byteSize: statSync(dest).size };
  });

  rmSync(OUT_ZIP, { force: true });
  const zipResult = spawnSync(
    "powershell",
    ["-NoProfile", "-Command", `Compress-Archive -Path '${staging.replace(/'/g, "''")}\\*' -DestinationPath '${OUT_ZIP.replace(/'/g, "''")}' -Force`],
    { encoding: "utf8" },
  );
  if (zipResult.status !== 0) throw new Error(`Compress-Archive failed: ${zipResult.stderr || zipResult.stdout}`);

  const zipBytes = readFileSync(OUT_ZIP);
  const manifest = {
    version: "phase6a1-professor-v3-architecture-review-v4-manifest",
    generatedAt: new Date().toISOString(),
    decision: "PROFESSOR_V3_ARCHITECTURE_CORE_PASS_MODEL_EXECUTION_BLOCK_V3_PROMPT_AGENT_LEDGER_AND_STATE_ENTAILMENT_REQUIRED",
    priorDecision: "PROFESSOR_V3_ARCHITECTURE_CORE_PASS_MODEL_EXECUTION_BLOCK_V2_TYPED_GROUNDING_AND_AGENT_WIRING_REQUIRED",
    purpose: "Independent architecture review v4 — model-visible prompt payload, orchestration skeleton, append-only ledger, state entailment. No model execution.",
    gateV4Status: "PREPARED_NOT_EXECUTED_SUPERSEDED",
    fixtureAudit: { artifact: "phase6a1-professor-v3-grounding-fixtures-audit-v4.json", totalFixtures: 44 },
    fileCount: files.length,
    files,
    zip: { artifact: basename(OUT_ZIP), sha256: sha256Bytes(zipBytes), byteSize: zipBytes.length },
  };

  writeFileSync(OUT_MANIFEST, JSON.stringify(manifest, null, 2));
  rmSync(staging, { recursive: true, force: true });
  console.log(JSON.stringify(manifest, null, 2));
}

main();
