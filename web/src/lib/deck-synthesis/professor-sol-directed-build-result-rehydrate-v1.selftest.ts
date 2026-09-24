/**
 * Covers the recovery path for builds whose result was lost with the instance
 * that produced it. Modelled on build be6b1974, which reported COMPLETE with
 * grade B+ and returned zero cards after two deploys.
 */
import assert from "node:assert/strict";
import {
  jobShouldHaveResultV1,
  rehydrateSolDirectedBuildResultV1,
} from "./professor-sol-directed-build-result-rehydrate-v1";
import type { ArtifactReaderV1 } from "./professor-sol-directed-build-result-rehydrate-v1";
import type { SolDirectedBuildJobRecordV111 } from "./professor-sol-directed-build-types-v1-1-1";

let n = 0;
async function check(label: string, fn: () => void | Promise<void>): Promise<void> {
  await fn();
  n += 1;
  console.log(`  ok  ${label}`);
}

const JOB = {
  buildId: "be6b1974-c01e-42fe-9d42-efcf3953e2a1",
  userId: "cust-1",
  storeId: "the-game-lodge",
  storeSlug: "the-game-lodge",
  status: "COMPLETE",
  statusLabel: "Deck complete",
  commanderOracleId: "c0b1fba1-4338-4671-934b-098689ad2085",
  commanderName: "Fynn, the Fangbearer",
  bracket: 4,
  playstyle: "balanced",
  userInputs: { bracket: 4, playstyle: "balanced", commanderStyle: "unique" },
  activityLog: [],
  createdAt: "2026-09-04T19:52:00.000Z",
  updatedAt: "2026-09-04T20:02:07.000Z",
  completedAt: "2026-09-04T20:02:07.000Z",
  failureCode: null,
  failureMessage: null,
  validationPass: true,
  finalClassification: "OPTIONAL_REFINEMENT",
  finalGrade: "B+",
  artifactStoragePrefix: "deck-build-runs/be6b1974-c01e-42fe-9d42-efcf3953e2a1",
  proofChain: { sealed: true },
  telemetry: { totalCalls: 6 },
} as unknown as SolDirectedBuildJobRecordV111;

const DECK = {
  commander: {
    oracleId: "c0b1fba1-4338-4671-934b-098689ad2085",
    name: "Fynn, the Fangbearer",
    colorIdentity: ["G"],
    manaValue: 2,
  },
  landCount: 35,
  lands: [{ name: "Forest", copies: 25 }],
  nonlands: Array.from({ length: 64 }, (_, i) => ({
    oracleId: `o-${i}`,
    name: `Card ${i}`,
    primaryRole: "One-mana deathtouch attacker",
    structuralNecessity: "REQUIRED",
  })),
  primaryWinPaths: ["poison"],
  secondaryWinPaths: [],
  expectedPlayPattern: "attack",
  structuralNecessities: [],
  replaceableFlex: [],
};

const ARTIFACTS: Record<string, unknown> = {
  "canonicalized-deck.json": DECK,
  "validation.json": { pass: true, violations: [], architectRequirementRealization: { pass: true } },
  "head-professor-response.json": { grade: "B+", classification: "OPTIONAL_REFINEMENT" },
  "critic-response.json": { summary: "fine", appliedSwaps: [] },
  "architect-response.json": { strategicThesis: "poison" },
  "retrieval-contract.json": { strategicThesis: "poison", cardRequirements: [] },
};

function readerFor(map: Record<string, unknown>): { read: ArtifactReaderV1; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    read: async (name) => {
      calls.push(name);
      return map[name] ?? null;
    },
  };
}

async function main(): Promise<void> {
  console.log("guard");

  await check("a completed build with artifacts is a recovery candidate", () => {
    assert.equal(jobShouldHaveResultV1(JOB), true);
  });

  await check("in-progress and failed builds are not", () => {
    for (const status of ["CREATED", "ARCHITECTING", "HEAD_PROFESSOR_REVIEW", "FAILED"] as const) {
      assert.equal(
        jobShouldHaveResultV1({ ...JOB, status } as SolDirectedBuildJobRecordV111),
        false,
        `${status} should not trigger a Storage read`,
      );
    }
  });

  await check("a completed build without artifacts is not", () => {
    assert.equal(
      jobShouldHaveResultV1({ ...JOB, artifactStoragePrefix: null } as SolDirectedBuildJobRecordV111),
      false,
    );
  });

  console.log("\nrecovery");

  await check("the lost Fynn deck is fully recovered", async () => {
    const { read } = readerFor(ARTIFACTS);
    const out = await rehydrateSolDirectedBuildResultV1({ job: JOB, readArtifact: read });
    assert.ok(out, "the deck should be recoverable");
    assert.equal(out!.result.constructedDeck?.nonlands.length, 64);
    assert.equal(out!.result.constructedDeck?.lands.length, 1);
    assert.equal(out!.result.headProfessor?.grade, "B+");
    assert.equal(out!.result.validation?.pass, true);
    assert.equal(out!.result.status, "COMPLETE");
    assert.equal(out!.result.buildId, JOB.buildId);
  });

  await check("the commander comes from the deck, with its color identity", async () => {
    const { read } = readerFor(ARTIFACTS);
    const out = await rehydrateSolDirectedBuildResultV1({ job: JOB, readArtifact: read });
    assert.equal(out!.result.commander.name, "Fynn, the Fangbearer");
    assert.deepEqual(out!.result.commander.colorIdentity, ["G"]);
  });

  await check("job-level fields are carried across", async () => {
    const { read } = readerFor(ARTIFACTS);
    const out = await rehydrateSolDirectedBuildResultV1({ job: JOB, readArtifact: read });
    assert.deepEqual(out!.result.userInputs, JOB.userInputs);
    assert.deepEqual(out!.result.proofChain, JOB.proofChain);
    assert.deepEqual(out!.result.telemetry, JOB.telemetry);
  });

  await check("every artifact found is reported", async () => {
    const { read } = readerFor(ARTIFACTS);
    const out = await rehydrateSolDirectedBuildResultV1({ job: JOB, readArtifact: read });
    assert.equal(out!.recovered.length, 6);
    assert.ok(out!.recovered.includes("canonicalized-deck.json"));
  });

  console.log("\npartial and missing artifacts");

  await check("a deck still loads when the review is missing", async () => {
    const { read } = readerFor({ "canonicalized-deck.json": DECK });
    const out = await rehydrateSolDirectedBuildResultV1({ job: JOB, readArtifact: read });
    assert.ok(out, "the deck alone is worth serving");
    assert.equal(out!.result.headProfessor, null);
    assert.equal(out!.result.validation, null);
    assert.equal(out!.result.constructedDeck?.nonlands.length, 64);
    assert.deepEqual(out!.recovered, ["canonicalized-deck.json"]);
  });

  await check("no deck means no recovery, and nothing else is read", async () => {
    const { read, calls } = readerFor({ "validation.json": { pass: true } });
    const out = await rehydrateSolDirectedBuildResultV1({ job: JOB, readArtifact: read });
    assert.equal(out, null, "a result without a deck must not be served");
    assert.deepEqual(calls, ["canonicalized-deck.json"], "the other reads should be skipped");
  });

  await check("a malformed or empty deck is treated as absent", async () => {
    for (const bad of [
      null,
      {},
      "not a deck",
      [],
      { commander: { name: "Fynn" }, nonlands: [], lands: [] },
      { commander: {}, nonlands: [{ name: "x" }] },
      { commander: { name: "   " }, nonlands: [{ name: "x" }] },
    ]) {
      const { read } = readerFor({ "canonicalized-deck.json": bad });
      const out = await rehydrateSolDirectedBuildResultV1({ job: JOB, readArtifact: read });
      assert.equal(out, null, `${JSON.stringify(bad)} should not be served as a deck`);
    }
  });

  await check("a deck with only lands is still a deck", async () => {
    const { read } = readerFor({
      "canonicalized-deck.json": {
        commander: { name: "Fynn, the Fangbearer", colorIdentity: ["G"] },
        nonlands: [],
        lands: [{ name: "Forest", copies: 35 }],
      },
    });
    const out = await rehydrateSolDirectedBuildResultV1({ job: JOB, readArtifact: read });
    assert.ok(out);
  });

  console.log(`\n${n} checks passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
