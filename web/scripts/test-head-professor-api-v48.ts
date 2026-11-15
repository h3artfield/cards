import { resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { buildFinalDeckDoctorDossierV48, dossierToPromptText } from "../src/lib/deck-synthesis/professor-deck-dossier-v4-8-v1";
import { loadHeadProfessorModelPinV48 } from "../src/lib/deck-synthesis/professor-head-professor-caller-v4-8-v1";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
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

loadEnvLocal();

async function testMinimal() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");

  const pin = loadHeadProfessorModelPinV48();
  console.log("Model pin:", pin.modelIdentifier, "timeout:", pin.inferenceParameters.requestTimeoutMs);

  const body = {
    model: pin.modelIdentifier,
    input: [
      { role: "developer", content: "Return JSON only." },
      { role: "user", content: 'Return {"hello":"world"}' },
    ],
    reasoning: { effort: pin.reasoningConfiguration.effort },
    max_output_tokens: 1000,
    text: { format: { type: "json_object" } },
  };

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    const text = await response.text();
    console.log("MINIMAL STATUS:", response.status);
    console.log(text.slice(0, 1500));
  } catch (err) {
    console.error("MINIMAL FETCH ERROR:", err);
    if (err instanceof Error && err.cause) console.error("CAUSE:", err.cause);
  }
}

async function testLargePrompt() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return;

  const pin = loadHeadProfessorModelPinV48();
  const sampleCards = Array.from({ length: 99 }, (_, i) => ({
    name: `Sample Card ${i + 1}`,
    oracleId: null,
    manaValue: 3,
    typeLine: "Creature",
    roles: ["ramp"],
    packages: ["Test"],
    commanderDependence: "MEDIUM",
    category: "creature",
    oracleSummary: "This is a sample oracle text for testing prompt size limits on the head professor call.",
  }));

  const dossier = buildFinalDeckDoctorDossierV48({
    commanderName: "Halana and Alena, Partners",
    commanderOracleId: null,
    commanderColorIdentity: ["R", "G", "W"],
    bracket: 4,
    userIntent: ["optimized"],
    relationshipLens: "Harmony",
    charter: null,
    theory: null,
    councilState: {
      version: "professor-council-assembly-v4-7-v1",
      phase: "COMPLETE",
      deckCharter: null,
      selectedCards: sampleCards.map((c, i) => ({
        cardId: `c-${i}`,
        oracleId: null,
        name: c.name,
        proposedBy: "RESEARCH",
        origin: "ORACLE_SEARCH",
        proposalReason: "test",
        functions: ["ramp"],
        roles: ["ramp"],
        packages: ["Test"],
        engines: [],
        commanderDependence: "MEDIUM",
        worksWithoutCommander: "MEDIUM",
        semanticConnections: [],
        oracleVerified: true,
        legalityVerified: true,
        colorIdentityVerified: true,
        criticStatus: "CHARTER_OK",
        status: "SELECTED",
        addedAtRevision: 1,
        lastReviewedRevision: 1,
        category: "creature",
      })),
      cardDecisions: [],
      councilDecisions: [],
      conversation: [],
      snapshots: [],
      functionalProfiles: {},
      assemblyRevision: 1,
      buildPhase: "PROVISIONAL_100",
      legalityGate: { pass: true, failures: [] },
      targetTotalCards: 100,
    } as never,
    catalog: { byOracleId: new Map(), byName: new Map() } as never,
  });

  const prompt = dossierToPromptText(dossier);
  console.log("LARGE PROMPT BYTES:", Buffer.byteLength(prompt, "utf8"));

  const body = {
    model: pin.modelIdentifier,
    input: [
      { role: "developer", content: "Return JSON with swaps array." },
      { role: "user", content: prompt.slice(0, 50000) },
    ],
    reasoning: { effort: pin.reasoningConfiguration.effort },
    max_output_tokens: 8000,
    text: { format: { type: "json_object" } },
  };

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    const text = await response.text();
    console.log("LARGE STATUS:", response.status);
    console.log(text.slice(0, 1500));
  } catch (err) {
    console.error("LARGE FETCH ERROR:", err);
    if (err instanceof Error && err.cause) console.error("CAUSE:", err.cause);
  }
}

async function testBackground() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return;

  const body = {
    model: "gpt-5.6-sol",
    background: true,
    input: [
      { role: "developer", content: "Return JSON only." },
      { role: "user", content: 'Return {"hello":"world"}' },
    ],
    reasoning: { effort: "xhigh" },
    max_output_tokens: 1000,
    text: { format: { type: "json_object" } },
  };

  const create = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const created = (await create.json()) as { id?: string; status?: string; error?: unknown };
  console.log("BACKGROUND CREATE:", create.status, created.status, created.id);
  if (!created.id) {
    console.log(JSON.stringify(created).slice(0, 1000));
    return;
  }

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const poll = await fetch(`https://api.openai.com/v1/responses/${created.id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const result = (await poll.json()) as { status?: string; output?: Array<{ content?: Array<{ text?: string }> }>; error?: unknown };
    console.log("BACKGROUND POLL", i, result.status);
    if (result.status === "completed") {
      console.log(result.output?.[0]?.content?.[0]?.text);
      return;
    }
    if (result.status === "failed") {
      console.log("FAILED:", JSON.stringify(result.error));
      return;
    }
  }
}

void (async () => {
  await testMinimal();
  await testBackground();
  await testLargePrompt();
})();
