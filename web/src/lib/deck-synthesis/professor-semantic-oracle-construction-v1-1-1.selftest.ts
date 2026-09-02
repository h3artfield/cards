/**
 * Deterministic Semantic Oracle construction helpers — no catalog / model required.
 */
import assert from "node:assert/strict";
import {
  inferRepeatabilityFromAbilityTypes,
  semanticOracleFactsFromMapPoint,
} from "./professor-semantic-oracle-facts-v1-1-1";
import { scoreRequirementSemanticFitV111 } from "./professor-requirement-semantic-profiles-v1-1-1";
import { auditSemanticRoleAssignmentsV111 } from "./professor-semantic-role-audit-v1-1-1";
import {
  scoreUserSemanticPreferencesV111,
  userSemanticPreferencesForPromptV111,
} from "./professor-user-semantic-preferences-v1-1-1";
import type { SemanticMapPoint } from "@/lib/semantic-visualization/types";
import type { CanonicalCardFactsV11, SolDirectedConstructedDeckV11 } from "./professor-sol-directed-types-v1-1";
import type { CommanderBlueprintV417 } from "./professor-brew-blueprint-v4-17-v1";

function fakePoint(overrides: Partial<SemanticMapPoint> & Pick<SemanticMapPoint, "oracleId" | "name">): SemanticMapPoint {
  return {
    x: 0,
    y: 0,
    z: 0,
    x2: 0,
    y2: 0,
    clusterId: 0,
    colorIdentity: ["B", "G"],
    manaValue: 3,
    typeLine: "Creature",
    types: ["Creature"],
    subtypes: [],
    commanderEligible: false,
    publishable: true,
    hasNeedsReview: false,
    structuralInvalid: false,
    qualityStatus: "publishable",
    topActions: [],
    abilityTypes: [],
    zones: [],
    semanticOwners: [],
    derivedRoles: [],
    normalizedName: overrides.name.toLowerCase(),
    ...overrides,
  };
}

function fakeFacts(oracleId: string, name: string, point: SemanticMapPoint): CanonicalCardFactsV11 {
  return {
    oracleId,
    name,
    manaValue: 3,
    typeLine: point.typeLine,
    colorIdentity: ["B", "G"],
    oracleText: "",
    semanticFunctions: [],
    semanticOracle: semanticOracleFactsFromMapPoint(point),
    commanderLegal: true,
    isLand: false,
  };
}

function main(): void {
  assert.equal(inferRepeatabilityFromAbilityTypes(["triggered"]), "repeatable");
  assert.equal(inferRepeatabilityFromAbilityTypes(["spell_effect"]), "one_shot");
  assert.equal(inferRepeatabilityFromAbilityTypes(["triggered", "spell_effect"]), "mixed");

  const engine = semanticOracleFactsFromMapPoint(
    fakePoint({
      oracleId: "engine",
      name: "Token Engine",
      topActions: ["create_token"],
      abilityTypes: ["triggered"],
      zones: ["battlefield"],
      derivedRoles: ["token_generation"],
    }),
  );
  assert.equal(engine.repeatability, "repeatable");
  assert.deepEqual(engine.resourceEffects, ["create_token"]);
  assert.ok(engine.conditions.includes("trigger"));

  const engineFit = scoreRequirementSemanticFitV111({
    facts: engine,
    requirementId: "repeatable_token_engine",
    primaryRole: "Repeatable token engine",
  });
  assert.equal(engineFit.functionalMatch, true);
  assert.ok(engineFit.score > 20);

  const oneShot = semanticOracleFactsFromMapPoint(
    fakePoint({
      oracleId: "oneshot",
      name: "One Token Spell",
      topActions: ["create_token"],
      abilityTypes: ["spell_effect"],
      zones: ["battlefield"],
      derivedRoles: ["token_generation"],
    }),
  );
  const oneShotFit = scoreRequirementSemanticFitV111({
    facts: oneShot,
    requirementId: "repeatable_token_engines",
    primaryRole: "Repeatable token engines",
  });
  assert.equal(oneShotFit.functionalMatch, false);

  const mention = semanticOracleFactsFromMapPoint(
    fakePoint({
      oracleId: "mention",
      name: "Mentions Graveyard",
      topActions: ["mill"],
      abilityTypes: ["spell_effect"],
      zones: ["graveyard"],
      derivedRoles: ["mill"],
    }),
  );
  const recursionFit = scoreRequirementSemanticFitV111({
    facts: mention,
    requirementId: "recursion",
    primaryRole: "Graveyard recovery",
  });
  assert.equal(recursionFit.functionalMatch, false);

  assert.equal(userSemanticPreferencesForPromptV111({ prefer: [], avoid: [] }), "none");
  const preferScore = scoreUserSemanticPreferencesV111({
    facts: engine,
    typeLine: "Enchantment",
    manaValue: 3,
    preferences: { prefer: ["create_tokens"], avoid: [] },
  });
  assert.ok(preferScore > 0);

  const dictionary = {
    engine: fakeFacts("engine", "Token Engine", fakePoint({
      oracleId: "engine",
      name: "Token Engine",
      topActions: ["create_token"],
      abilityTypes: ["triggered"],
      zones: ["battlefield"],
      derivedRoles: ["token_generation"],
    })),
    mention: fakeFacts("mention", "Mentions Graveyard", fakePoint({
      oracleId: "mention",
      name: "Mentions Graveyard",
      topActions: ["mill"],
      abilityTypes: ["spell_effect"],
      zones: ["graveyard"],
      derivedRoles: ["mill"],
    })),
  };

  const flags = auditSemanticRoleAssignmentsV111({
    candidateDictionary: dictionary,
    deck: {
      commander: { name: "Test", oracleId: "cmd" } as CommanderBlueprintV417,
      landCount: 36,
      lands: [],
      nonlands: [
        {
          oracleId: "engine",
          name: "Token Engine",
          primaryArchitectRequirement: "repeatable_token_engines",
          primaryRole: "Repeatable token engines",
          secondaryRoles: [],
          packageMembership: [],
          whyInThisDeck: "engine",
          structuralNecessity: "REQUIRED",
        },
        {
          oracleId: "mention",
          name: "Mentions Graveyard",
          primaryArchitectRequirement: "recursion",
          primaryRole: "Recursion",
          secondaryRoles: [],
          packageMembership: [],
          whyInThisDeck: "mentions gy",
          structuralNecessity: "FLEX",
        },
      ],
      primaryWinPaths: [],
      secondaryWinPaths: [],
      expectedPlayPattern: "",
      structuralNecessities: [],
      replaceableFlex: [],
    } as SolDirectedConstructedDeckV11,
  });
  assert.equal(flags.length, 1);
  assert.equal(flags[0]?.name, "Mentions Graveyard");

  console.log("ALL PASS — professor-semantic-oracle-construction-v1-1-1");
}

main();
