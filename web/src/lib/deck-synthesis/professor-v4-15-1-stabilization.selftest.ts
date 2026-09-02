/**
 * PROFESSOR v4.15.1 stabilization acceptance — deterministic, no OpenAI.
 * Run: npx tsx src/lib/deck-synthesis/professor-v4-15-1-stabilization.selftest.ts
 */
import assert from "node:assert/strict";
import {
  assertFinalFingerprintBindingV4151,
  canonicalizeDisplayName,
  cardsShareCanonicalIdentity,
  deckListSha,
  deckListShaFromCards,
  findCouncilCardByIdentity,
  normalizeCardNameForMatch,
} from "./professor-canonical-card-identity-v4-15-1-v1";
import { auditDeckTutorsV413 } from "./professor-tutor-audit-v4-13-v1";
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";
import { parseHeadProfessorReviewPayloadV415 } from "./professor-head-professor-full-review-v4-15-v1";
import {
  createModelTelemetryCollector,
  extractChatCompletionUsage,
} from "./professor-model-telemetry-v4-15-1-v1";

function councilCard(name: string, oracleId: string | null = null): CouncilCardV46 {
  return {
    cardId: name,
    oracleId,
    name,
    proposedBy: "RESEARCH",
    origin: "ORACLE_SEARCH",
    proposalReason: "test",
    functions: [],
    roles: [],
    packages: [],
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
    category: "spell",
  };
}

// --- Canonical card identity ---
assert.equal(canonicalizeDisplayName("Vampiric Tutor // Vampiric Tutor"), "Vampiric Tutor");
assert.equal(normalizeCardNameForMatch("Vampiric Tutor"), normalizeCardNameForMatch("Vampiric Tutor // Vampiric Tutor"));
assert.equal(
  cardsShareCanonicalIdentity({ name: "Vampiric Tutor" }, { name: "Vampiric Tutor // Vampiric Tutor" }),
  true,
);

assert.equal(canonicalizeDisplayName("Assault // Battery"), "Assault // Battery");
assert.notEqual(
  normalizeCardNameForMatch("Assault // Battery"),
  normalizeCardNameForMatch("Assault"),
);

assert.equal(canonicalizeDisplayName("Adventurous Eater // Have a Bite"), "Adventurous Eater // Have a Bite");

const deckWithVampiric = [
  councilCard("Worldly Tutor", "oracle-worldly"),
  councilCard("Vampiric Tutor // Vampiric Tutor", "oracle-vampiric"),
];
const vampiricAudit = auditDeckTutorsV413({
  selectedCards: deckWithVampiric,
  catalog: { byOracleId: new Map() } as never,
  tutorNames: ["vampiric tutor"],
});
assert.equal(vampiricAudit.length, 1, "Vampiric Tutor audit normalization PASS");
assert.equal(vampiricAudit[0]!.tutorName, "Vampiric Tutor // Vampiric Tutor");

const found = findCouncilCardByIdentity(deckWithVampiric, "Vampiric Tutor");
assert.ok(found?.oracleId === "oracle-vampiric");

// --- Fingerprint binding ---
const canonicalFingerprint = deckListShaFromCards([
  councilCard("Sol Ring", "oid-sol-ring"),
  councilCard("Command Tower", "oid-command-tower"),
]);
assert.equal(
  deckListShaFromCards([
    councilCard("Sol Ring // Sol Ring", "oid-sol-ring"),
    councilCard("Command Tower", "oid-command-tower"),
  ]),
  canonicalFingerprint,
);

assert.doesNotThrow(() =>
  assertFinalFingerprintBindingV4151({
    finalCanonicalDeckFingerprint: canonicalFingerprint,
    gradeDeckFingerprint: canonicalFingerprint,
    headProfessorReviewedFingerprint: canonicalFingerprint,
    playReportDeckFingerprint: canonicalFingerprint,
  }),
);

assert.throws(() =>
  assertFinalFingerprintBindingV4151({
    finalCanonicalDeckFingerprint: canonicalFingerprint,
    gradeDeckFingerprint: canonicalFingerprint,
    headProfessorReviewedFingerprint: canonicalFingerprint,
    playReportDeckFingerprint: "deadbeefdeadbeef",
  }),
);

assert.notEqual(
  deckListSha(["Korvold", "Sol Ring", "Forest"]),
  deckListSha(["Sol Ring", "Forest"]),
  "play report must not independently hash commander+library as canonical library fingerprint",
);

// --- Head Professor structured parser fixture ---
const populatedPayload = {
  deckIdentityAssessment: "Sacrifice engine with token fodder.",
  commanderAssessment: "Korvold is the draw engine and primary threat.",
  strategyAssessment: "Value loops without compact closure.",
  preserveAtAllCosts: ["Skullclamp"],
  weakCards: [
    {
      canonicalName: "Harald, King of Skemfar",
      reason: "Off-plan elf tribal",
      replacementFunction: "token engine",
    },
  ],
  opportunityCostCards: ["Solemn Simulacrum"],
  weakPackages: [],
  currentWinArchitecture: {
    summary: "Diffuse value",
    primaryWinPlan: "Grow Korvold",
    threatWindow: "Turn 8-10",
    compactnessScore: 3,
    winLines: [
      {
        lineName: "Combat",
        lethalMechanism: "Large commander",
        expectedThreatWindow: "Turn 8+",
        outcomeType: "THREATENING_BOARD",
      },
    ],
  },
  targetWinArchitecture: {
    summary: "Compact drain loop",
    primaryWinPlan: "Chatterfang + Plunderer",
    threatWindow: "Turn 6-8",
    compactnessScore: 6,
    winLines: [],
  },
  specificCardSuggestions: [],
  researchRequests: [],
};

const parsed = parseHeadProfessorReviewPayloadV415({ raw: populatedPayload, dossierBracket: 4 });
assert.equal(parsed.commanderAssessment.includes("Korvold"), true);
assert.deepEqual(parsed.weakCards, ["Harald, King of Skemfar"]);
assert.equal(parsed.structuredFieldStatus?.weakCards, "populated");
assert.equal(parsed.structuredFieldStatus?.commanderAssessment, "populated");
assert.equal(parsed.structuredFieldStatus?.currentWinArchitecture, "populated");

const schemaOmittedPayload = {
  overallAssessment: "Only narrative returned.",
  swaps: [],
};
const omitted = parseHeadProfessorReviewPayloadV415({ raw: schemaOmittedPayload, dossierBracket: 4 });
assert.equal(omitted.structuredFieldStatus?.weakCards, "schema_omitted");
assert.equal(omitted.structuredFieldStatus?.commanderAssessment, "schema_omitted");

const emptyGenuinePayload = {
  ...populatedPayload,
  weakCards: [],
  preserveAtAllCosts: [],
};
const emptyGenuine = parseHeadProfessorReviewPayloadV415({ raw: emptyGenuinePayload, dossierBracket: 4 });
assert.equal(emptyGenuine.structuredFieldStatus?.weakCards, "empty_genuine");
assert.equal(emptyGenuine.structuredFieldStatus?.preserveAtAllCosts, "empty_genuine");

// --- Token usage plumbing ---
const { collector, aggregate } = createModelTelemetryCollector({ plannedCalls: 3 });
collector.record({
  model: "gpt-5.6-sol",
  purpose: "HEAD_PROFESSOR_REVIEW",
  usage: { inputTokens: 9000, outputTokens: 1200, totalTokens: 10200 },
  latencyMs: 120_000,
  planned: true,
});
collector.record({
  model: "gpt-4o",
  purpose: "PLAY_REPORT",
  usage: { inputTokens: 3000, outputTokens: 900, totalTokens: 3900 },
  latencyMs: 8_000,
  planned: true,
});
const usage = aggregate();
assert.equal(usage.totals.inputTokens, 12000);
assert.equal(usage.totals.outputTokens, 2100);
assert.equal(usage.budget.actualCalls, 2);
assert.equal(usage.byPurpose.HEAD_PROFESSOR_REVIEW.calls, 1);

const chatUsage = extractChatCompletionUsage({
  usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
});
assert.equal(chatUsage?.totalTokens, 150);

assert.doesNotThrow(() =>
  deckListShaFromCards([councilCard(undefined as unknown as string, "oid-x")]),
);

import { normalizeHeadProfessorSwaps, sanitizeHeadProfessorSwap } from "./professor-final-deck-doctor-v4-8-v1";
assert.equal(sanitizeHeadProfessorSwap({ cut: "  ", add: "Sol Ring" }), null);
assert.equal(sanitizeHeadProfessorSwap({ cut: "Bad River", add: undefined as unknown as string }), null);
assert.equal(
  normalizeHeadProfessorSwaps({
    swaps: [{ cut: "Cut Me", add: "Add Me" }, { cut: "", add: "Orphan Add" }],
    cuts: [{ card: "  ", priority: "HIGH", whyCut: "x" }],
  }).length,
  1,
);

console.log("professor-v4-15-1-stabilization: PASS");
console.log(
  JSON.stringify(
    {
      canonicalCardIdentity: "PASS",
      vampiricTutorNormalization: "PASS",
      playReportFingerprintBinding: "PASS",
      gradeFingerprintBinding: "PASS",
      headProfessorSchemaParserFixture: "PASS",
      headProfessorSwapSanitization: "PASS",
      tokenUsagePlumbing: "PASS",
    },
    null,
    2,
  ),
);
