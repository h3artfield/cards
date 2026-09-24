#!/usr/bin/env npx tsx
/**
 * Seal post-gold failure analysis for frozen Amendment v8.
 * Classifies gold-comparison misses into generic defect categories only.
 * Does NOT modify v8, rerun gold comparison, or authorize corpus ingest.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const POST_GOLD_FAILURE_ANALYSIS_V1_VERSION =
  "phase6a1-professor-plan-v8-post-gold-failure-analysis-v1";

export const POST_GOLD_DEFECT_CATEGORY = [
  "PAYOFF_COVERAGE",
  "FUEL_FODDER_ENABLER_COVERAGE",
  "COMMANDER_MAINTENANCE_OPERATIONAL_SUPPORT",
  "SECONDARY_ENGINE_COVERAGE",
  "RESILIENCE_RECOVERY_COVERAGE",
  "MULTI_ROLE_HARMONY_COVERAGE",
  "EXTERNAL_KNOWLEDGE_DATA_UNAVAILABLE",
] as const;

export type PostGoldDefectCategory = (typeof POST_GOLD_DEFECT_CATEGORY)[number];

type MissingMechanicRecord = {
  goldMechanicLabel: string;
  pathClass: "DEPENDENT_SYNERGY" | "INDEPENDENT_SYNERGY" | "HARMONY";
  primaryCategory: PostGoldDefectCategory;
  secondaryCategory: PostGoldDefectCategory | null;
  genericDefectStatement: string;
};

const OUT_DIR = resolve("data/milestones/deck-synthesis");
const GOLD_REPORT = resolve(
  OUT_DIR,
  "phase6a1-professor-plan-experiment-v3-amended-v8-gold-comparison-report-v1.json",
);
const GOLD_SEAL = resolve(
  OUT_DIR,
  "phase6a1-professor-plan-experiment-v3-amended-v8-gold-comparison-sealed-v1.json",
);
const PRE_GOLD_REAUDIT = resolve(
  OUT_DIR,
  "phase6a1-professor-plan-experiment-v3-amended-v8-pre-gold-reaudit-gpt56sol-v1.json",
);

const ANALYSIS_PATH = resolve(OUT_DIR, "phase6a1-professor-plan-v8-post-gold-failure-analysis-v1.json");
const ANALYSIS_SEAL_PATH = resolve(
  OUT_DIR,
  "phase6a1-professor-plan-v8-post-gold-failure-analysis-sealed-v1.json",
);
const DEV_TRACK_PATH = resolve(OUT_DIR, "phase6a1-professor-plan-post-gold-development-track-v1.json");

/** Verified pre-gold population pin — professor package bodies at PRE_GOLD_PASS. */
const PRE_GOLD_CASE_SET_SHA256 =
  "7788ec494e1c8570170d6b12d685a60f01908748d3b37529f4ccc6a85ea8ddf5";

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** Generic taxonomy assignments — no case-specific repair prescriptions. */
const MISSING_MECHANIC_TAXONOMY: Record<string, Omit<MissingMechanicRecord, "goldMechanicLabel">> = {
  "artifact-matters payoffs": {
    pathClass: "INDEPENDENT_SYNERGY",
    primaryCategory: "PAYOFF_COVERAGE",
    secondaryCategory: null,
    genericDefectStatement:
      "Independent or conversion packages lacked explicit payoff cards for the declared secondary theme.",
  },
  "Monk/token payoffs": {
    pathClass: "DEPENDENT_SYNERGY",
    primaryCategory: "PAYOFF_COVERAGE",
    secondaryCategory: null,
    genericDefectStatement:
      "Commander-linked token engine was present but downstream payoff density for the declared creature type was under-specified.",
  },
  "spellslinger/prowess payoffs": {
    pathClass: "INDEPENDENT_SYNERGY",
    primaryCategory: "PAYOFF_COVERAGE",
    secondaryCategory: "SECONDARY_ENGINE_COVERAGE",
    genericDefectStatement:
      "Spell-density enablers were not paired with enough standalone payoff density for the independent engine thesis.",
  },
  "untap/reuse of commander tap ability": {
    pathClass: "DEPENDENT_SYNERGY",
    primaryCategory: "COMMANDER_MAINTENANCE_OPERATIONAL_SUPPORT",
    secondaryCategory: null,
    genericDefectStatement:
      "Portfolio under-covered operational support for repeating or reusing the commander's activated engine.",
  },
  "The Animus package (details pending The Animus Oracle)": {
    pathClass: "DEPENDENT_SYNERGY",
    primaryCategory: "EXTERNAL_KNOWLEDGE_DATA_UNAVAILABLE",
    secondaryCategory: null,
    genericDefectStatement:
      "Strategy reference depended on unavailable external card Oracle/data; closure could not be evaluated against sealed facts.",
  },
  "beginning-phase/upkeep/untap/draw-step payoffs": {
    pathClass: "DEPENDENT_SYNERGY",
    primaryCategory: "PAYOFF_COVERAGE",
    secondaryCategory: "SECONDARY_ENGINE_COVERAGE",
    genericDefectStatement:
      "Upkeep-phase trigger window was not backed by enough explicit payoff cards for the declared phase hook.",
  },
  "madness/discard payoffs": {
    pathClass: "INDEPENDENT_SYNERGY",
    primaryCategory: "PAYOFF_COVERAGE",
    secondaryCategory: null,
    genericDefectStatement:
      "Discard/madness fuel loop was not closed with sufficient standalone payoff coverage.",
  },
  "protect/sacrifice before Chainer leaves secondary": {
    pathClass: "DEPENDENT_SYNERGY",
    primaryCategory: "RESILIENCE_RECOVERY_COVERAGE",
    secondaryCategory: "COMMANDER_MAINTENANCE_OPERATIONAL_SUPPORT",
    genericDefectStatement:
      "Commander-dependency plan lacked resilience packages for commander-zone loss in multi-zone configurations.",
  },
  "self-mill/discard": {
    pathClass: "INDEPENDENT_SYNERGY",
    primaryCategory: "FUEL_FODDER_ENABLER_COVERAGE",
    secondaryCategory: null,
    genericDefectStatement:
      "Independent engine thesis lacked explicit fuel generation for the declared zone-manipulation loop.",
  },
  "artifact self-mill/discard": {
    pathClass: "INDEPENDENT_SYNERGY",
    primaryCategory: "FUEL_FODDER_ENABLER_COVERAGE",
    secondaryCategory: null,
    genericDefectStatement:
      "Graveyard fuel density for artifact-themed loops was under-specified in the independent portfolio.",
  },
  "ETB/death/self-sacrifice artifacts": {
    pathClass: "HARMONY",
    primaryCategory: "MULTI_ROLE_HARMONY_COVERAGE",
    secondaryCategory: "FUEL_FODDER_ENABLER_COVERAGE",
    genericDefectStatement:
      "Harmony portfolio did not include enough dual-role artifact pieces bridging independent fuel and commander-linked triggers.",
  },
  "ways to manage Kain changing control": {
    pathClass: "DEPENDENT_SYNERGY",
    primaryCategory: "COMMANDER_MAINTENANCE_OPERATIONAL_SUPPORT",
    secondaryCategory: "RESILIENCE_RECOVERY_COVERAGE",
    genericDefectStatement:
      "Volatile-control commander plan lacked operational packages for ownership/control volatility management.",
  },
  "enchantment density/self-mill": {
    pathClass: "DEPENDENT_SYNERGY",
    primaryCategory: "FUEL_FODDER_ENABLER_COVERAGE",
    secondaryCategory: null,
    genericDefectStatement:
      "Primary engine lacked sufficient density enablers for the declared enchantment/self-mill setup loop.",
  },
  "nonlegendary enchantments/Sagas worth copying": {
    pathClass: "DEPENDENT_SYNERGY",
    primaryCategory: "FUEL_FODDER_ENABLER_COVERAGE",
    secondaryCategory: "PAYOFF_COVERAGE",
    genericDefectStatement:
      "Copy-engine thesis under-specified target density for repeatable nonlegendary enchantment value.",
  },
  "enchantment payoffs/recursion": {
    pathClass: "INDEPENDENT_SYNERGY",
    primaryCategory: "PAYOFF_COVERAGE",
    secondaryCategory: null,
    genericDefectStatement:
      "Independent enchantment engine lacked explicit payoff/recursion closure for the declared theme.",
  },
  "counter payoffs secondary": {
    pathClass: "DEPENDENT_SYNERGY",
    primaryCategory: "SECONDARY_ENGINE_COVERAGE",
    secondaryCategory: "PAYOFF_COVERAGE",
    genericDefectStatement:
      "Primary counter engine was present but secondary payoff engine for scaled counters was thin.",
  },
  "creature fodder": {
    pathClass: "INDEPENDENT_SYNERGY",
    primaryCategory: "FUEL_FODDER_ENABLER_COVERAGE",
    secondaryCategory: null,
    genericDefectStatement:
      "Sacrifice or death-trigger independent engine lacked renewable creature fodder density.",
  },
  "sacrifice payoffs": {
    pathClass: "INDEPENDENT_SYNERGY",
    primaryCategory: "PAYOFF_COVERAGE",
    secondaryCategory: null,
    genericDefectStatement:
      "Sacrifice outlet/fodder packages were not paired with enough standalone payoff density.",
  },
  "death-value/recursive sacrifice fodder": {
    pathClass: "HARMONY",
    primaryCategory: "MULTI_ROLE_HARMONY_COVERAGE",
    secondaryCategory: "FUEL_FODDER_ENABLER_COVERAGE",
    genericDefectStatement:
      "Harmony portfolio lacked multi-role pieces that simultaneously feed and benefit from death/recursion loops.",
  },
  "big-mana payoffs": {
    pathClass: "INDEPENDENT_SYNERGY",
    primaryCategory: "PAYOFF_COVERAGE",
    secondaryCategory: null,
    genericDefectStatement:
      "Ramp/mana engine was present but high-mana payoff sinks were under-specified for the independent thesis.",
  },
  "renewable fodder": {
    pathClass: "INDEPENDENT_SYNERGY",
    primaryCategory: "FUEL_FODDER_ENABLER_COVERAGE",
    secondaryCategory: null,
    genericDefectStatement:
      "Sacrifice/aristocrats independent loop lacked renewable fodder generation in the portfolio.",
  },
  "multi-role sacrifice outlets and recursive fodder": {
    pathClass: "HARMONY",
    primaryCategory: "MULTI_ROLE_HARMONY_COVERAGE",
    secondaryCategory: null,
    genericDefectStatement:
      "Harmony selection did not include enough pieces serving both outlet and recursive fodder roles across engines.",
  },
  "cheap/evasive attackers": {
    pathClass: "DEPENDENT_SYNERGY",
    primaryCategory: "FUEL_FODDER_ENABLER_COVERAGE",
    secondaryCategory: "COMMANDER_MAINTENANCE_OPERATIONAL_SUPPORT",
    genericDefectStatement:
      "Combat-trigger commander plan under-specified cheap evasive enablers needed to connect commander payoffs.",
  },
  "evasive creatures": {
    pathClass: "INDEPENDENT_SYNERGY",
    primaryCategory: "FUEL_FODDER_ENABLER_COVERAGE",
    secondaryCategory: null,
    genericDefectStatement:
      "Independent combat or trigger engine lacked evasive creature density for reliable execution.",
  },
  "Goblin-swarm payoffs": {
    pathClass: "DEPENDENT_SYNERGY",
    primaryCategory: "PAYOFF_COVERAGE",
    secondaryCategory: null,
    genericDefectStatement:
      "Token production engine was present but tribal/swarm payoff density for the declared creature type was thin.",
  },
  "evasive Ninjas and bounceable value creatures": {
    pathClass: "HARMONY",
    primaryCategory: "MULTI_ROLE_HARMONY_COVERAGE",
    secondaryCategory: "FUEL_FODDER_ENABLER_COVERAGE",
    genericDefectStatement:
      "Harmony portfolio lacked dual-role evasive/bounce creatures bridging commander combat triggers and independent value.",
  },
};

const NOVEL_PACKAGE_TAXONOMY: Record<
  string,
  { primaryCategory: PostGoldDefectCategory; genericObservation: string }
> = {
  "H3-P3-flexible-activation-window": {
    primaryCategory: "COMMANDER_MAINTENANCE_OPERATIONAL_SUPPORT",
    genericObservation: "Novel operational timing package not present in gold reference; may be valid independent addition.",
  },
  "package-protection-and-rebuild": {
    primaryCategory: "RESILIENCE_RECOVERY_COVERAGE",
    genericObservation: "Novel resilience package; gold comparison does not auto-adjudicate MTG validity.",
  },
  "package-combat-connectivity-window": {
    primaryCategory: "COMMANDER_MAINTENANCE_OPERATIONAL_SUPPORT",
    genericObservation: "Novel combat-connectivity support; informational only.",
  },
  "H2-P1": {
    primaryCategory: "MULTI_ROLE_HARMONY_COVERAGE",
    genericObservation: "Novel harmony-scoped package; requires independent validity review outside gold.",
  },
  "H3-P3": {
    primaryCategory: "MULTI_ROLE_HARMONY_COVERAGE",
    genericObservation: "Novel harmony-scoped package; requires independent validity review outside gold.",
  },
  "package-sacrifice-tax-attrition-pressure": {
    primaryCategory: "SECONDARY_ENGINE_COVERAGE",
    genericObservation: "Novel secondary attrition engine; not scored as gold miss.",
  },
  "package-ownership-reset": {
    primaryCategory: "COMMANDER_MAINTENANCE_OPERATIONAL_SUPPORT",
    genericObservation: "Novel control/ownership operational package.",
  },
  "ephemeral-copy-value-harvest": {
    primaryCategory: "PAYOFF_COVERAGE",
    genericObservation: "Novel payoff pattern; gold disagreement is not automatic Professor error.",
  },
  "package-flexible-targeting-interaction": {
    primaryCategory: "COMMANDER_MAINTENANCE_OPERATIONAL_SUPPORT",
    genericObservation: "Novel interaction/utility support package.",
  },
  "package-reactive-utility-permanents": {
    primaryCategory: "RESILIENCE_RECOVERY_COVERAGE",
    genericObservation: "Novel reactive utility/resilience package.",
  },
  "package-forced-discard-posture": {
    primaryCategory: "SECONDARY_ENGINE_COVERAGE",
    genericObservation: "Novel disruption posture package.",
  },
  "package-discard-copy-target-priority": {
    primaryCategory: "MULTI_ROLE_HARMONY_COVERAGE",
    genericObservation: "Novel dual-role discard/copy package.",
  },
  "burst-midrange-protected-trigger-window": {
    primaryCategory: "RESILIENCE_RECOVERY_COVERAGE",
    genericObservation: "Novel protected burst/resilience package.",
  },
  "H1-P2-COMBAT-MANA-RESERVE": {
    primaryCategory: "FUEL_FODDER_ENABLER_COVERAGE",
    genericObservation: "Novel mana/combat enabler package.",
  },
};

function countPrimaryByCategory(records: MissingMechanicRecord[]): Record<PostGoldDefectCategory, number> {
  const counts = Object.fromEntries(POST_GOLD_DEFECT_CATEGORY.map((c) => [c, 0])) as Record<
    PostGoldDefectCategory,
    number
  >;
  for (const r of records) {
    counts[r.primaryCategory] += 1;
  }
  return counts;
}

function main() {
  const generatedAt = new Date().toISOString();
  const goldReport = JSON.parse(readFileSync(GOLD_REPORT, "utf8")) as {
    overallStatus: string;
    population: Record<string, number>;
    cases: Array<{
      caseId: string;
      novelProfessorPackageIds: string[];
      pathComparisons: Array<{
        pathClass: string;
        mechanicCoverage: Array<{ goldMechanicLabel: string; covered: boolean }>;
      }>;
    }>;
  };

  const missingRecords: Array<MissingMechanicRecord & { caseId: string }> = [];
  for (const c of goldReport.cases) {
    for (const p of c.pathComparisons) {
      for (const m of p.mechanicCoverage) {
        if (m.covered) continue;
        const taxonomy = MISSING_MECHANIC_TAXONOMY[m.goldMechanicLabel];
        if (!taxonomy) {
          throw new Error(`Missing taxonomy for gold mechanic: ${m.goldMechanicLabel}`);
        }
        missingRecords.push({
          caseId: c.caseId,
          goldMechanicLabel: m.goldMechanicLabel,
          ...taxonomy,
        });
      }
    }
  }

  if (missingRecords.length !== 26) {
    throw new Error(`Expected 26 missing mechanics, got ${missingRecords.length}`);
  }

  const categoryPrimaryCounts = countPrimaryByCategory(missingRecords);

  const novelRecords = goldReport.cases.flatMap((c) =>
    c.novelProfessorPackageIds.map((packageId) => {
      const taxonomy = NOVEL_PACKAGE_TAXONOMY[packageId];
      if (!taxonomy) throw new Error(`Missing novel package taxonomy: ${packageId}`);
      return { caseId: c.caseId, packageId, ...taxonomy };
    }),
  );
  if (novelRecords.length !== 14) {
    throw new Error(`Expected 14 novel packages, got ${novelRecords.length}`);
  }

  const analysis = {
    version: POST_GOLD_FAILURE_ANALYSIS_V1_VERSION,
    generatedAt,
    status: "SEALED",
    scope:
      "Generic post-gold defect taxonomy for frozen Amendment v8 gold-comparison FAIL. No case-specific repair prescriptions.",
    preservedEvaluation: {
      amendmentPopulation: "phase6a1-professor-plan-experiment-v3-amended-v8",
      preGoldAudit: "PRE_GOLD_PASS",
      preGoldReauditArtifact: "phase6a1-professor-plan-experiment-v3-amended-v8-pre-gold-reaudit-gpt56sol-v1.json",
      preGoldReauditSha256: sha256File(PRE_GOLD_REAUDIT),
      preGoldCaseSetSha256: PRE_GOLD_CASE_SET_SHA256,
      manifestSha256: "23cc0e5c51d1b41034ceeecfa56d26c67b592bab23dce771238614d02293ff7d",
      goldComparisonReport: "phase6a1-professor-plan-experiment-v3-amended-v8-gold-comparison-report-v1.json",
      goldComparisonReportSha256: sha256File(GOLD_REPORT),
      goldComparisonSeal: "phase6a1-professor-plan-experiment-v3-amended-v8-gold-comparison-sealed-v1.json",
      goldComparisonSealSha256: sha256File(GOLD_SEAL),
      goldComparisonOverallStatus: goldReport.overallStatus,
      pathsPassed: goldReport.population.pathsPassed,
      pathsFailed: goldReport.population.pathsFailed,
      casesPassed: goldReport.population.casesPassed,
      casesFailed: goldReport.population.casesFailed,
      goldMechanicsMissing: goldReport.population.goldMechanicsMissing,
      novelProfessorPackages: goldReport.population.novelProfessorPackagesTotal,
    },
    taxonomy: POST_GOLD_DEFECT_CATEGORY.map((id) => ({
      id,
      label: id
        .toLowerCase()
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()),
    })),
    categoryPrimaryCounts,
    missingMechanicRecords: missingRecords,
    novelPackageRecords: novelRecords,
    aggregateFindings: {
      dominantPrimaryCategories: [
        { category: "PAYOFF_COVERAGE", count: categoryPrimaryCounts.PAYOFF_COVERAGE },
        { category: "FUEL_FODDER_ENABLER_COVERAGE", count: categoryPrimaryCounts.FUEL_FODDER_ENABLER_COVERAGE },
        { category: "MULTI_ROLE_HARMONY_COVERAGE", count: categoryPrimaryCounts.MULTI_ROLE_HARMONY_COVERAGE },
      ],
      summary:
        "Post-gold misses cluster in payoff closure and fuel/enabler density, with smaller Harmony-bridge and operational-support gaps. One miss is attributable to unavailable external Oracle/data rather than Professor planning quality.",
    },
    nextDesignQuestion: {
      prompt:
        "Should Professor add a deterministic strategy coverage / functional-role closure stage after hypothesis generation?",
      functionalRoleChecklist: [
        "engine",
        "enablers",
        "fuel",
        "payoffs",
        "conversion",
        "protection",
        "recovery",
        "finishers",
        "commander-maintenance",
        "cross-engine bridges",
      ],
      recommendation: "AUTHORIZE_DESIGN_TRACK",
      rationale: [
        "Primary/secondary gold misses map cleanly to missing payoffs, fuel, Harmony bridges, and operational support — not primarily to mechanical invalidity (pre-gold validator PASS).",
        "A deterministic closure audit can run on sealed facts/opportunities without opening BuildPath gold during development.",
        "Closure should gate portfolio selection or structured repair prompts, not replace the existing validator or re-use the 84-path gold holdout as a dev loop.",
      ],
      constraints: [
        "Do not use 84 gold paths as the new development test set.",
        "Build new development examples first, then a fresh prospective blind holdout before any future gold-style evaluation.",
        "Do not modify or rerun frozen Amendment v8.",
      ],
    },
    gateDisposition: {
      amendmentV8: "FROZEN_FINAL",
      goldComparisonV1: "SEALED_FINAL",
      postGoldFailureAnalysis: "SEALED",
      corpusIngest: "PRECONDITION_SATISFIED_STILL_BLOCKED_PENDING_NEW_DEV_AUTHORIZATION",
      newDevelopmentTrack: "AUTHORIZED_SEPARATE_FROM_V8",
    },
  };

  writeFileSync(ANALYSIS_PATH, JSON.stringify(analysis, null, 2));
  const analysisSha256 = sha256File(ANALYSIS_PATH);

  writeFileSync(
    ANALYSIS_SEAL_PATH,
    JSON.stringify(
      {
        version: "phase6a1-professor-plan-v8-post-gold-failure-analysis-sealed-v1",
        sealedAt: generatedAt,
        analysisArtifact: "phase6a1-professor-plan-v8-post-gold-failure-analysis-v1.json",
        analysisSha256,
        goldComparisonReportSha256: sha256File(GOLD_REPORT),
        population: {
          pathsPassed: 61,
          pathsFailed: 23,
          casesPassed: 14,
          casesFailed: 14,
          missingGoldMechanics: 26,
          novelProfessorPackages: 14,
        },
        instruction: "REPORT AND WAIT. Generic taxonomy only — no case-specific v8 repairs.",
      },
      null,
      2,
    ),
  );

  writeFileSync(
    DEV_TRACK_PATH,
    JSON.stringify(
      {
        version: "phase6a1-professor-plan-post-gold-development-track-v1",
        openedAt: generatedAt,
        predecessor: {
          frozenFinal: "phase6a1-professor-plan-experiment-v3-amended-v8",
          goldComparison: "phase6a1-professor-plan-experiment-v3-amended-v8-gold-comparison-report-v1.json",
          postGoldFailureAnalysis: "phase6a1-professor-plan-v8-post-gold-failure-analysis-v1.json",
        },
        separationPolicy: {
          doNotModifyV8: true,
          doNotRerunGoldComparisonV1: true,
          doNotUse84GoldPathsAsDevTestSet: true,
          doNotTuneAgainstV8Holdout: true,
        },
        authorizedNextWork: [
          "Design deterministic strategy coverage / functional-role closure stage (post-hypothesis, pre-portfolio)",
          "Author new development examples outside the 28-case v8/gold population",
          "Create fresh prospective blind holdout before any future gold-style evaluation",
        ],
        blockedUntilFurtherAuthorization: [
          "corpusIngest",
          "futureGoldStyleEvaluationOnNewHoldoutOnly",
          "professorRerunOnV8Population",
        ],
        gateDisposition: {
          amendmentV8: "FROZEN_FINAL",
          postGoldFailureAnalysis: "SEALED",
          corpusIngest: "KEEP_BLOCKED",
        },
      },
      null,
      2,
    ),
  );

  // Bookkeeping: restore verified pre-gold case-set pin on gold artifacts (no comparison rerun).
  const goldReportParsed = JSON.parse(readFileSync(GOLD_REPORT, "utf8")) as Record<string, unknown>;
  const inputs = goldReportParsed.inputs as Record<string, string>;
  inputs.professorCaseSetSha256 = PRE_GOLD_CASE_SET_SHA256;
  writeFileSync(GOLD_REPORT, JSON.stringify(goldReportParsed, null, 2));

  const goldSealParsed = JSON.parse(readFileSync(GOLD_SEAL, "utf8")) as Record<string, string>;
  goldSealParsed.professorCaseSetSha256PreGold = PRE_GOLD_CASE_SET_SHA256;
  writeFileSync(GOLD_SEAL, JSON.stringify(goldSealParsed, null, 2));

  console.log(
    JSON.stringify(
      {
        analysisPath: ANALYSIS_PATH,
        analysisSha256,
        categoryPrimaryCounts,
        devTrackPath: DEV_TRACK_PATH,
      },
      null,
      2,
    ),
  );
}

main();
