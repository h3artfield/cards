/**
 * Parser-blind nested-grant Stage-C development pack — catalog-backed, not v136 holdout.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import {
  combinedGoldenOracleText,
  goldenOracleTextHash,
  loadGoldenCatalogIndex,
} from "./lib/load-golden-catalog-index";
import { buildCatalogResolverIndexes, resolveCatalogSeed } from "./lib/catalog-resolver";
import { spanFromRange, type MachineGroundedBenchmarkTarget } from "./lib/benchmark-identity";

loadEnvLocal();

import { NESTED_GRANT_V137_SEEDS } from "./granted-nested-v137-seeds";

type NestedGrantSeed = import("./granted-nested-v137-seeds").NestedGrantSeed;

function findGrantingVerb(
  oracleText: string,
  recipientEnd: number,
): { verb: string; verbStart: number; complementStart: number } | null {
  const tail = oracleText.slice(recipientEnd);
  const coordinated = tail.match(/^\s*gets\s+[^.]+?\s+and\s+(has|have)\s+/i);
  if (coordinated) {
    const verb = coordinated[1]!.toLowerCase();
    const prefix = tail.slice(0, coordinated.index! + coordinated[0].length);
    const verbStart = recipientEnd + prefix.lastIndexOf(verb);
    return { verb, verbStart, complementStart: recipientEnd + coordinated.index! + coordinated[0].length };
  }
  const hasIdx = oracleText.indexOf(" has ", recipientEnd);
  const haveIdx = oracleText.indexOf(" have ", recipientEnd);
  if (hasIdx < 0 && haveIdx < 0) return null;
  const useHas = hasIdx >= 0 && (haveIdx < 0 || hasIdx <= haveIdx);
  const verbIdx = useHas ? hasIdx : haveIdx;
  const verb = useHas ? "has" : "have";
  return { verb, verbStart: verbIdx + 1, complementStart: verbIdx + (useHas ? 5 : 6) };
}

function extractTarget(oracleText: string, seed: NestedGrantSeed): MachineGroundedBenchmarkTarget | null {
  const pattern = new RegExp(seed.recipientPattern.source, seed.recipientPattern.flags.includes("g") ? seed.recipientPattern.flags : `${seed.recipientPattern.flags}g`);
  const candidateStarts: number[] = [];
  for (const m of oracleText.matchAll(pattern)) {
    if (m.index !== undefined) candidateStarts.push(m.index);
  }
  if (candidateStarts.length === 0) return null;

  for (const recipientStart of candidateStarts.length > 1 ? [...candidateStarts].reverse() : candidateStarts) {
    const sliceMatch = oracleText.slice(recipientStart).match(seed.recipientPattern);
    if (!sliceMatch) continue;
    const label = sliceMatch[0].trim();
    const recipientEnd = recipientStart + label.length;
    const grant = findGrantingVerb(oracleText, recipientEnd);
    if (!grant) continue;

    let complementEnd = grant.complementStart;
    while (complementEnd < oracleText.length && oracleText[complementEnd] !== "." && oracleText[complementEnd] !== "\n") {
      complementEnd++;
    }

    const inner = oracleText.slice(grant.complementStart, complementEnd).trim();
    const looksLikeGrant =
      seed.grantKind === "static"
        ? !/^"/.test(inner) || STATIC_KEYWORD_LIKE.test(inner)
        : /^["\u201c]/.test(inner) || /^(When|Whenever|\{)/.test(inner.replace(/^["\u201c]/, ""));
    if (!looksLikeGrant && candidateStarts.length > 1) continue;

    return {
      grammarFamily: seed.grammarFamily,
      expectedContext: "genuine_granted",
      recipientSpan: spanFromRange(oracleText, recipientStart, recipientEnd),
      grantingVerbSpan: spanFromRange(oracleText, grant.verbStart, grant.verbStart + grant.verb.length),
      grantedComplementSpan: spanFromRange(oracleText, grant.complementStart, complementEnd),
      fullRegionSpan: spanFromRange(oracleText, recipientStart, complementEnd),
      oracleTextHash: goldenOracleTextHash(oracleText),
      adjudicationStatus: "parser_blind_adjudicated",
      semanticAdjudication: {
        context: "genuine_granted",
        recipient: label,
        grantingVerb: grant.verb,
        grantedComplement: inner,
        grammarFamily: seed.grammarFamily,
        grantedAbilityTypes: [seed.grantKind],
        duration: "continuous",
        semanticOwner: "granted_object",
        layer1Structure: {
          abilityType: seed.grantKind,
          grantingConstruction: seed.grammarFamily,
          ...(seed.costEvidence
            ? {
                costRegion: {
                  start: grant.complementStart,
                  end: grant.complementStart + seed.costEvidence.length,
                  text: seed.costEvidence,
                },
              }
            : {}),
        },
        layer2Gold: seed.certifiedEmptyLayer2 ? [] : (seed.layer2Gold ?? []),
        certifiedEmptyLayer2: seed.certifiedEmptyLayer2 ?? false,
      },
    };
  }
  return null;
}

const STATIC_KEYWORD_LIKE =
  /^(?:")?(?:flying|first strike|double strike|trample|lifelink|deathtouch|hexproof|indestructible|haste|reach|vigilance|menace|shroud|hexproof and can't be blocked)/i;

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const resolverIndexes = buildCatalogResolverIndexes(catalog);
  const excluded = new Set<string>();
  for (const rel of [
    "data/oracle-action-eval-granted-classifier-expansion-v136.json",
    "data/oracle-action-eval-granted-classifier-expansion-v135.json",
  ]) {
    if (!existsSync(resolve(rel))) continue;
    for (const c of (JSON.parse(readFileSync(resolve(rel), "utf8")) as { cases: Array<{ oracleId: string }> }).cases) {
      excluded.add(c.oracleId);
    }
  }

  const cases = [];
  for (const seed of NESTED_GRANT_V137_SEEDS) {
    const resolved = resolveCatalogSeed(catalog, resolverIndexes, { name: seed.cardName });
    if (!resolved?.card) {
      console.warn(`skip ${seed.id}: catalog miss ${seed.cardName}`);
      continue;
    }
    if (excluded.has(resolved.card.oracleId)) {
      console.warn(`skip ${seed.id}: overlaps v136/v135 ${seed.cardName}`);
      continue;
    }
    const oracleText = combinedGoldenOracleText(resolved.card);
    const target = extractTarget(oracleText, seed);
    if (!target) {
      console.warn(`skip ${seed.id}: could not extract grant target ${seed.cardName}`);
      continue;
    }
    cases.push({
      id: seed.id,
      category: seed.category,
      layout: resolved.card.layout ?? "normal",
      oracleId: resolved.card.oracleId,
      oracleText,
      cardName: resolved.card.canonicalName,
      expectedPrimitiveActions: [],
      expectedStructure: {},
      expectedRoles: [],
      coverageStratum: "granted_nested_stage_c_v137",
      expansionLabel: "positive_granted_region",
      grammarFamily: seed.grammarFamily,
      expectedContext: "genuine_granted",
      benchmarkTargets: [target],
      goldenCatalogVersion: catalog.catalogVersion,
      goldenOracleTextHash: goldenOracleTextHash(oracleText),
      evaluationLabelVersion: "granted-nested-stage-c-v137",
      taxonomyVersion: "benchmark-validation-split-v1.1-semantic-gold",
      reviewer: "granted-nested-v137-catalog-select",
      caseScope: "full_card",
      selectionRule: target.fullRegionSpan?.text ?? seed.cardName,
      adjudicationStatus: "parser_blind_adjudicated",
    });
  }

  const envelope = {
    generatedAt: new Date().toISOString(),
    setVersion: "granted-nested-stage-c-v137",
    parserExecutionCount: 0,
    note: "Stage-C nested-grant development expansion — parser-blind gold, not transfer holdout",
    caseCount: cases.length,
    contentHash: createHash("sha256").update(JSON.stringify(cases)).digest("hex"),
    cases,
  };

  mkdirSync(resolve("data/milestones/rc3-development"), { recursive: true });
  writeFileSync(resolve("data/oracle-action-eval-granted-nested-stage-c-v137.json"), `${JSON.stringify(envelope, null, 2)}\n`);
  writeFileSync(
    resolve("data/milestones/rc3-development/granted-nested-stage-c-v137-selection-manifest.json"),
    `${JSON.stringify({ generatedAt: envelope.generatedAt, caseCount: cases.length, caseIds: cases.map((c) => c.id) }, null, 2)}\n`,
  );
  console.log(JSON.stringify({ caseCount: cases.length, ids: cases.map((c) => c.id) }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
