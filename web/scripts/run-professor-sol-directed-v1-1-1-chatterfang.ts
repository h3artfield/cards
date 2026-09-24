/**
 * PROFESSOR_SOL_DIRECTED_V1_1_1 — Rehydrate archived Constructor output, validate, Head Professor adjudication.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { resolveCommanderBlueprintFromCatalogV417 } from "../src/lib/deck-synthesis/professor-commander-catalog-v4-17-v1";
import { hydrateSolDirectedConstructedDeckV111 } from "../src/lib/deck-synthesis/professor-sol-directed-candidate-hydration-v1-1-1";
import {
  evaluatePreHeadProfessorGateV111,
  validateSolDirectedDeckV111,
} from "../src/lib/deck-synthesis/professor-sol-directed-pre-head-professor-gate-v1-1-1";
import {
  interpretTwoCallConstructionProofV111,
  runSolDirectedHeadProfessorWholeDeckV111,
} from "../src/lib/deck-synthesis/professor-sol-directed-head-professor-v1-1-1";
import type {
  CanonicalCardFactsV11,
  LandPoolV11,
  RequirementPoolV11,
} from "../src/lib/deck-synthesis/professor-sol-directed-types-v1-1";

function loadEnvLocal() {
  for (const rel of [".env.local", "web/.env.local"]) {
    const path = resolve(process.cwd(), rel);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

function runScript(script: string): boolean {
  const result = spawnSync("npx", ["--yes", "tsx", script], {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: true,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status === 0;
}

function v11Artifact(name: string): string {
  return resolve(process.cwd(), `data/milestones/deck-synthesis/sol-directed-chatterfang-v1-1/${name}`);
}

async function main() {
  loadEnvLocal();
  process.env.PROFESSOR_SOL_DIRECTED_LIVE = process.env.PROFESSOR_SOL_DIRECTED_LIVE ?? "1";

  const playablePass = runScript("src/lib/deck-synthesis/professor-playable-oracle-resolution-v1-1-1.selftest.ts");
  const hydrationPass = runScript("src/lib/deck-synthesis/professor-sol-directed-candidate-hydration-v1-1-1.selftest.ts");

  const outDir = resolve(process.cwd(), "data/milestones/deck-synthesis/sol-directed-chatterfang-v1-1-1");
  mkdirSync(outDir, { recursive: true });

  const catalog = await loadDeckResolutionCatalog();
  const commander = resolveCommanderBlueprintFromCatalogV417({
    catalog,
    commanderName: "Chatterfang, Squirrel General",
  });

  const rawConstructor = JSON.parse(readFileSync(v11Artifact("call-1-constructor-response.json"), "utf8"));
  const candidateDictionary = JSON.parse(
    readFileSync(v11Artifact("candidate-dictionary.json"), "utf8"),
  ) as Record<string, CanonicalCardFactsV11>;
  const requirementPools = JSON.parse(
    readFileSync(v11Artifact("requirement-pools.json"), "utf8"),
  ) as RequirementPoolV11[];
  const landPool = JSON.parse(readFileSync(v11Artifact("land-pool.json"), "utf8")) as LandPoolV11;
  const retrievalContract = JSON.parse(readFileSync(v11Artifact("retrieval-contract.json"), "utf8"));
  const architectRawPlan = JSON.parse(readFileSync(v11Artifact("architect-raw-plan-fixture.json"), "utf8"));

  const { deck, ledger, errors } = hydrateSolDirectedConstructedDeckV111({
    raw: rawConstructor,
    commander,
    context: { candidateDictionary, requirementPools, landPool },
  });

  writeFileSync(resolve(outDir, "constructed-deck-canonicalized-v1-1-1.json"), JSON.stringify(deck, null, 2));
  writeFileSync(resolve(outDir, "identity-resolution-ledger-v1-1-1.json"), JSON.stringify(ledger, null, 2));

  const validation = validateSolDirectedDeckV111({
    deck,
    catalog,
    contract: retrievalContract,
    candidateDictionary,
    landPool,
    identityLedger: ledger,
    prohibitedOracleIds: [],
  });
  writeFileSync(resolve(outDir, "validation-v1-1-1.json"), JSON.stringify(validation, null, 2));

  const gate = evaluatePreHeadProfessorGateV111(validation);
  const liveEnabled = process.env.PROFESSOR_SOL_DIRECTED_LIVE === "1" && Boolean(process.env.OPENAI_API_KEY?.trim());

  let headProfessorResult: Awaited<ReturnType<typeof runSolDirectedHeadProfessorWholeDeckV111>> | null = null;
  let twoCallProof: "PASS" | "FAIL" | "NOT_RUN" = "NOT_RUN";

  if (playablePass && hydrationPass && gate.pass && liveEnabled) {
    headProfessorResult = await runSolDirectedHeadProfessorWholeDeckV111({
      deck,
      architectRawPlan,
      retrievalContract,
      validation,
      commander,
      bracket: 3,
      playstyle: "tokens/sacrifice",
      catalog,
    });
    writeFileSync(
      resolve(outDir, "call-1-head-professor-response.json"),
      JSON.stringify(headProfessorResult.verdict, null, 2),
    );
    writeFileSync(
      resolve(outDir, "call-1-head-professor-prompt.txt"),
      `${headProfessorResult.record.systemPrompt}\n\n---\n\n${headProfessorResult.record.userPrompt}`,
    );
    twoCallProof = interpretTwoCallConstructionProofV111(headProfessorResult.verdict);
    writeFileSync(
      resolve(outDir, "two-call-construction-proof.json"),
      JSON.stringify(
        {
          result: twoCallProof,
          classification: headProfessorResult.verdict.classification,
          grade: headProfessorResult.verdict.grade,
        },
        null,
        2,
      ),
    );
  }

  writeFileSync(
    resolve(outDir, "REPORT.md"),
    [
      "# PROFESSOR_SOL_DIRECTED_V1_1_1 — Chatterfang Rehydration + Head Professor Report",
      "",
      "**Decision:** PROFESSOR_SOL_DIRECTED_V1_1_1 — REPORT AND WAIT",
      "",
      "## Deterministic fixes applied",
      "",
      "- P0: Candidate-scoped hydration (no global catalog fallback for Constructor selections)",
      "- P1: Playable exact-name resolution (excludes art_series/token/emblem/non-playable duplicates)",
      "- P2: Canonical display-name composition (`A // A` → `A`; real MDFC names preserved)",
      "",
      "## Regression / gate",
      "",
      `- Playable exact resolution selftest: ${playablePass ? "PASS" : "FAIL"}`,
      `- Candidate hydration selftest: ${hydrationPass ? "PASS" : "FAIL"}`,
      `- Hydration errors: ${errors.length === 0 ? "none" : errors.join("; ")}`,
      `- Pre-Head-Professor gate: ${gate.pass ? "PASS" : "FAIL"}`,
      gate.pass
        ? ""
        : `- Gate violations: ${gate.reasons.join("; ")}`,
      `- Architect requirement realization: ${validation.architectRequirementRealization.pass ? "PASS" : "FAIL"} (${JSON.stringify(validation.architectRequirementRealization.counts)})`,
      `- Legacy heuristic audit: labeled ${validation.legacyHeuristicAudit.label} (ramp=${validation.legacyHeuristicAudit.ramp}, protection=${validation.legacyHeuristicAudit.protection}, tutorsAccess=${validation.legacyHeuristicAudit.tutorsAccess})`,
      "",
      "## Bastion identity correction",
      "",
      `- Raw Constructor: \"Bastion of Remembrance\" (no invented Oracle ID)`,
      `- Corrected hydration: c7f33cea-2ec8-4081-9208-a5b1d86721b3`,
      `- Previous bad hydration 547673ac-787a-4270-aadf-d7fe9dada959: **not applied** (Repair response remains archived only)`,
      "",
      "## Head Professor",
      "",
      headProfessorResult
        ? `- Classification: **${headProfessorResult.verdict.classification}**`
        : `- Head Professor: ${gate.pass && liveEnabled ? "SKIPPED" : gate.pass ? "SKIPPED — set PROFESSOR_SOL_DIRECTED_LIVE=1 and OPENAI_API_KEY" : "NOT AUTHORIZED — gate failed"}`,
      headProfessorResult ? `- Grade: ${headProfessorResult.verdict.grade}` : "",
      headProfessorResult
        ? `- SOL_DIRECTED_TWO_CALL_CONSTRUCTION_PROOF: **${twoCallProof}**`
        : "",
      headProfessorResult
        ? `- Reasoning: ${headProfessorResult.verdict.reasoningSummary}`
        : "",
      "",
      "**Commander #10 NOT authorized. Production rewire NOT authorized.**",
    ]
      .filter(Boolean)
      .join("\n"),
  );

  console.log(
    JSON.stringify(
      {
        playablePass,
        hydrationPass,
        hydrationErrors: errors,
        gatePass: gate.pass,
        gateReasons: gate.reasons,
        headProfessorClassification: headProfessorResult?.verdict.classification ?? null,
        twoCallProof,
        outDir,
      },
      null,
      2,
    ),
  );

  if (!playablePass || !hydrationPass || !gate.pass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
