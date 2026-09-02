/**
 * P0 deterministic truth regressions — must pass before Sol-directed OpenAI calls.
 * Callable in-process (Cloud Run) and from the CLI selftest.
 */
import assert from "node:assert/strict";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import {
  P0_LAND_PARTITION_FIXTURE_NAMES_V1,
  resolveStructuralSlotKindV1,
} from "./professor-canonical-deck-partition-v1";
import {
  compareRankedCandidatesDeterministicV417,
  rankCandidatesForAssemblyV417,
} from "./professor-blueprint-candidate-ranking-v4-17-v1";
import {
  MAX_DETERMINISTIC_PACKAGE_MEMBERSHIPS_V417,
  buildPackageContributionsV417,
} from "./professor-brew-blueprint-secondary-credit-v4-17-v1";
import type { BrewBlueprintV417, BrewRequirementV417 } from "./professor-brew-blueprint-v4-17-v1";
import { mandatoryStructureSatisfiedV417 } from "./professor-brew-blueprint-functional-density-v4-17-v1";
import { accessPortfolioClosureSatisfiedV1 } from "./professor-sol-directed-access-contract-v1";
import type { RequirementCandidateEvaluationV417 } from "./professor-requirement-candidate-v4-17-v1";

export const PROFESSOR_SOL_DIRECTED_P0_TRUTH_V1_1_1_VERSION =
  "professor-sol-directed-p0-truth-v1-1-1";

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleDeterministic<T>(items: T[], seed: number): T[] {
  const rng = mulberry32(seed);
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function mockEvaluation(
  args: Partial<RequirementCandidateEvaluationV417> &
    Pick<RequirementCandidateEvaluationV417, "oracleId" | "cardName">,
): RequirementCandidateEvaluationV417 {
  return {
    requirementId: "req-test",
    oracleId: args.oracleId,
    cardName: args.cardName,
    requirementEligible: true,
    missionFit: args.missionFit ?? 80,
    bracketQuality: args.bracketQuality ?? 70,
    roleCompression: args.roleCompression ?? 60,
    commanderSynergy: args.commanderSynergy ?? 55,
    independentValue: args.independentValue ?? 50,
    finalRequirementScore: args.finalRequirementScore ?? 80,
    satisfiedFunctions: args.satisfiedFunctions ?? ["ENGINE_ENABLER"],
    semanticEvidence: args.semanticEvidence ?? [],
  };
}

function testLandPartitionFixtures(catalog: DeckResolutionCatalog): void {
  for (const name of P0_LAND_PARTITION_FIXTURE_NAMES_V1) {
    const slot = resolveStructuralSlotKindV1({ name, catalog });
    assert.equal(slot, "land", `${name} must partition as land`);
  }
}

function testRankingOrderIndependence(): void {
  const evaluations = [
    mockEvaluation({ oracleId: "bbb-id", cardName: "Beta", finalRequirementScore: 80, deckLevelScore: 70 } as never),
    mockEvaluation({ oracleId: "aaa-id", cardName: "Alpha", finalRequirementScore: 80, deckLevelScore: 70 } as never),
    mockEvaluation({ oracleId: "ccc-id", cardName: "Gamma", finalRequirementScore: 75, deckLevelScore: 70 } as never),
  ];

  const blueprint = {
    commander: { colorIdentity: ["B", "G"], name: "Commander" },
    selectedCards: [],
    openRequirements: [{ requirementId: "req-test", packageIds: ["pkg-a"], family: "ENGINE_ENABLER" }],
    packages: [{ packageId: "pkg-a", core: true, status: "OPEN" }],
    userIntent: { bracket: 3 },
  } as unknown as BrewBlueprintV417;

  const meta = new Map([
    ["aaa-id", { oracleText: "create token", typeLine: "Creature" }],
    ["bbb-id", { oracleText: "create token", typeLine: "Creature" }],
    ["ccc-id", { oracleText: "create token", typeLine: "Creature" }],
  ]);

  const rankOnce = (order: RequirementCandidateEvaluationV417[]) =>
    rankCandidatesForAssemblyV417({
      blueprint,
      evaluations: order,
      candidateOracleTextById: meta,
      minQualityScore: 0,
    }).map((c) => c.oracleId);

  const canonical = rankOnce(evaluations);
  const reversed = rankOnce([...evaluations].reverse());
  const shuffleA = rankOnce(shuffleDeterministic(evaluations, 0xabc123));
  const shuffleB = rankOnce(shuffleDeterministic(evaluations, 0xdeadbeef));

  assert.deepEqual(reversed, canonical);
  assert.deepEqual(shuffleA, canonical);
  assert.deepEqual(shuffleB, canonical);
  assert.deepEqual(canonical, ["aaa-id", "bbb-id", "ccc-id"]);
  assert.ok(
    compareRankedCandidatesDeterministicV417(
      {
        finalRequirementScore: 80,
        deckLevelScore: 70,
        coverageDeltaPerPhysicalSlot: 1,
        bracketQuality: 70,
        oracleId: "aaa-id",
        cardName: "Alpha",
      },
      {
        finalRequirementScore: 80,
        deckLevelScore: 70,
        coverageDeltaPerPhysicalSlot: 1,
        bracketQuality: 70,
        oracleId: "bbb-id",
        cardName: "Beta",
      },
    ) < 0,
  );
}

function testPackagePropagationCap(): void {
  const blueprint = {
    selectedCards: [],
    openRequirements: [],
    packages: [],
  } as unknown as BrewBlueprintV417;
  const primaryRequirement = {
    requirementId: "req-primary",
    packageIds: ["pkg-a", "pkg-b"],
  } as BrewRequirementV417;
  const evaluation = mockEvaluation({ oracleId: "card-1", cardName: "Card", finalRequirementScore: 90 });
  const verifiedSecondaries = Array.from({ length: 8 }, (_, i) => ({
    requirementId: `req-secondary-${i}`,
    packageIds: [`pkg-a`],
    evaluation: mockEvaluation({ oracleId: "card-1", cardName: "Card", finalRequirementScore: 70 - i }),
  }));
  const contributions = buildPackageContributionsV417({
    blueprint,
    primaryRequirementId: "req-primary",
    primaryRequirement,
    evaluation,
    verifiedSecondaries,
    candidateOracleId: "card-1",
  });
  assert.ok(contributions.length <= MAX_DETERMINISTIC_PACKAGE_MEMBERSHIPS_V417);
  assert.ok(contributions.every((c) => primaryRequirement.packageIds.includes(c.packageId)));
}

function testAccessContractTruth(catalog: DeckResolutionCatalog): void {
  const blueprint = {
    commander: { colorIdentity: ["U"], name: "Kess" },
    selectedCards: [],
    openRequirements: [{ requirementId: "infra-access-primary", status: "PARTIAL", packageIds: [] }],
    functionalBudgets: [{ category: "tutorsAndAccess", minimum: 6, maximum: 8, functionalCoverageSelected: 0 }],
    packages: [],
    winArchitecture: [],
    userIntent: { bracket: 4 },
  } as unknown as BrewBlueprintV417;

  const closure = accessPortfolioClosureSatisfiedV1({ blueprint, catalog });
  assert.equal(closure.obligation, "REQUIRED_MINIMUM");
  assert.equal(closure.satisfied, false);
  assert.equal(mandatoryStructureSatisfiedV417(blueprint, catalog), false);
}

/** Throws on failure — safe to call from API routes with an already-loaded catalog. */
export function assertProfessorSolDirectedP0Truth(catalog: DeckResolutionCatalog): void {
  testLandPartitionFixtures(catalog);
  testRankingOrderIndependence();
  testPackagePropagationCap();
  testAccessContractTruth(catalog);
}
