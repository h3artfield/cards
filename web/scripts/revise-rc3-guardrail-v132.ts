/**
 * Create guardrail pack v2 from frozen v130 — parser-blind policy corrections.
 * Run: cd web && npx tsx scripts/revise-rc3-guardrail-v132.ts
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

type GuardrailCase = OracleActionEvalCaseV2 & {
  forbiddenPrimitiveActions?: string[];
  coverageStratum?: string;
  caseScope?: string;
  scopeEvidenceContains?: string;
  targetClauseId?: string;
  scopeReason?: string;
  certifiedEmptyLayer2?: boolean;
};

type RevisionRecord = {
  caseId: string;
  oldForbiddenActions: string[];
  newForbiddenActions: string[];
  newExpectedActions?: Array<{ actionType: string; role?: string; optionalEffect?: boolean }>;
  oracleEvidence: string;
  policyReason: string;
  parserConsultedForCorrection: false;
  caseScope: string;
  scopeEvidenceContains?: string;
  targetClauseId?: string;
};

function sha256Json(obj: unknown): string {
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

function inferClauseScope(c: GuardrailCase): Partial<GuardrailCase> {
  const text = c.oracleText;
  const stratum = c.coverageStratum ?? "";

  if (c.id === "rc3-guard-0001") {
    const evidence = "You may cast Demilich from your graveyard by exiling four instant and/or sorcery cards from your graveyard in addition to paying its other costs.";
    return {
      caseScope: "clause",
      targetClauseId: "demilich-graveyard-cast-permission",
      scopeEvidenceContains: evidence,
      scopeReason:
        "Forbidden scoped to graveyard cast permission static ability; triggered copy→cast resolution branch is out of scope.",
      certifiedEmptyLayer2: true,
    };
  }

  if (c.id === "rc3-guard-0013") {
    const evidence = "(You may cast this card from your graveyard for its flashback cost. Then exile it.)";
    return {
      caseScope: "clause",
      targetClauseId: "acorn-harvest-flashback-reminder",
      scopeEvidenceContains: evidence,
      scopeReason: "Forbidden scoped to Flashback mechanic reminder; main spell create_token is out of scope.",
      certifiedEmptyLayer2: true,
    };
  }

  if (stratum === "reminder_mechanic_text") {
    const m = text.match(/\([^)]{15,}(?:Flashback|Discover|Cycling|Evoke|Treasure|Clue|Disturb)[^)]*\)/i);
    if (m) {
      return {
        caseScope: "clause",
        targetClauseId: `${c.id}-mechanic-reminder`,
        scopeEvidenceContains: m[0],
        scopeReason: "Forbidden scoped to mechanic reminder parenthetical only.",
        certifiedEmptyLayer2: true,
      };
    }
  }

  if (stratum === "persistent_cast_permission") {
    const disturb = text.match(/\([^)]*You may cast this card from your graveyard[^)]*\)/i);
    if (disturb) {
      return {
        caseScope: "clause",
        targetClauseId: `${c.id}-disturb-reminder`,
        scopeEvidenceContains: disturb[0],
        scopeReason: "Forbidden scoped to Disturb cast-permission reminder parenthetical.",
        certifiedEmptyLayer2: true,
      };
    }
    const perm = text.match(/You may cast [^\n.]*from (?:your )?graveyard[^\n.]*/i);
    if (perm) {
      return {
        caseScope: "clause",
        targetClauseId: `${c.id}-cast-permission`,
        scopeEvidenceContains: perm[0],
        scopeReason: "Forbidden scoped to persistent graveyard cast permission line.",
        certifiedEmptyLayer2: true,
      };
    }
    const cantCast = text.match(/[^\n.]*(?:can't|cannot) cast[^\n.]*/i);
    if (cantCast) {
      return {
        caseScope: "clause",
        targetClauseId: `${c.id}-cast-restriction`,
        scopeEvidenceContains: cantCast[0],
        scopeReason: "Forbidden scoped to static cast restriction line.",
        certifiedEmptyLayer2: true,
      };
    }
  }

  if (stratum === "trigger_event_cast_reference") {
    const m = text.match(/(?:Whenever|When|If) you cast[^\n,.]*/i);
    if (m) {
      return {
        caseScope: "clause",
        targetClauseId: `${c.id}-trigger-cast-header`,
        scopeEvidenceContains: m[0],
        scopeReason: "Forbidden scoped to trigger-event cast reference header only.",
        certifiedEmptyLayer2: true,
      };
    }
  }

  if (stratum === "static_cost_reduction") {
    const m = text.match(/[^\n.]*costs?[^\n.]*less to cast[^\n.]*/i);
    if (m) {
      return {
        caseScope: "clause",
        targetClauseId: `${c.id}-cost-reduction`,
        scopeEvidenceContains: m[0],
        scopeReason: "Forbidden scoped to static cost-reduction line.",
        certifiedEmptyLayer2: true,
      };
    }
  }

  if (stratum === "activated_cost_only") {
    const m = text.match(/^[^\n:]{1,80}:/m);
    if (m) {
      const colonIdx = text.indexOf(":");
      const costRegion = text.slice(0, colonIdx + 1);
      return {
        caseScope: "clause",
        targetClauseId: `${c.id}-activated-cost`,
        scopeEvidenceContains: costRegion,
        scopeReason: "Forbidden scoped to activated ability cost region (pre-colon).",
        certifiedEmptyLayer2: true,
      };
    }
  }

  if (stratum === "static_restriction") {
    const m = text.match(/[^\n.]*(?:can't|cannot|don't|do not)[^\n.]*/i);
    if (m && !/^(When|Whenever)/i.test(m[0].trim())) {
      return {
        caseScope: "clause",
        targetClauseId: `${c.id}-static-restriction`,
        scopeEvidenceContains: m[0],
        scopeReason: "Forbidden scoped to static restriction line.",
        certifiedEmptyLayer2: true,
      };
    }
  }

  return {
    caseScope: c.caseScope ?? "structure_only",
    scopeReason: c.scopeReason ?? "Unmigrated — structure_only retains zero in-scope Layer-2.",
    certifiedEmptyLayer2: true,
  };
}

function main() {
  const v1Path = resolve("data/oracle-action-eval-rc3-policy-guardrail-v130.json");
  const v1 = JSON.parse(readFileSync(v1Path, "utf8")) as {
    cases: GuardrailCase[];
    contentHash: string;
    evaluationSetVersion: string;
  };

  const revisions: RevisionRecord[] = [];
  const cases: GuardrailCase[] = v1.cases.map((c) => {
    const scopePatch = inferClauseScope(c);
    const revised = {
      ...c,
      ...scopePatch,
      evaluationSetVersion: "rc3-policy-guardrail-v132",
      goldReviewVersion: "rc3-guardrail-revision-v132",
      parserConsulted: false,
    };

    if (c.id === "rc3-guard-0001") {
      revisions.push({
        caseId: c.id,
        oldForbiddenActions: c.forbiddenPrimitiveActions ?? [],
        newForbiddenActions: c.forbiddenPrimitiveActions ?? [],
        newExpectedActions: undefined,
        oracleEvidence: "You may cast Demilich from your graveyard by exiling four instant and/or sorcery cards from your graveyard in addition to paying its other costs.",
        policyReason:
          "Whole-card forbidden cast incorrectly suppressed legitimate one-shot cast the copy. Scoped to persistent graveyard permission only; copy→cast is positive-training coverage.",
        parserConsultedForCorrection: false,
        caseScope: "clause",
        scopeEvidenceContains: scopePatch.scopeEvidenceContains,
        targetClauseId: scopePatch.targetClauseId,
      });
    }

    if (c.id === "rc3-guard-0013") {
      revisions.push({
        caseId: c.id,
        oldForbiddenActions: c.forbiddenPrimitiveActions ?? [],
        newForbiddenActions: c.forbiddenPrimitiveActions ?? [],
        oracleEvidence: "(You may cast this card from your graveyard for its flashback cost. Then exile it.)",
        policyReason: "Main spell create_token is card-native L2 outside reminder benchmark scope.",
        parserConsultedForCorrection: false,
        caseScope: "clause",
        scopeEvidenceContains: scopePatch.scopeEvidenceContains,
        targetClauseId: scopePatch.targetClauseId,
      });
    }

    return revised;
  });

  const outEnvelope = {
    setClassification: "rc3_policy_guardrail_v132",
    evaluationSetVersion: "rc3-policy-guardrail-v132",
    taxonomyVersion: "three-layer-v1.4",
    parentPackVersion: "rc3-policy-guardrail-v130",
    parentContentHash: v1.contentHash,
    revisedAt: new Date().toISOString(),
    revisionReviewer: "rc3-guardrail-revision-v132",
    parserConsulted: false,
    cases,
    contentHash: "",
  };
  outEnvelope.contentHash = sha256Json(outEnvelope.cases);

  const outDir = resolve("data/milestones/rc3-benchmark-selection");
  mkdirSync(outDir, { recursive: true });

  const guardPath = resolve("data/oracle-action-eval-rc3-policy-guardrail-v132.json");
  writeFileSync(guardPath, `${JSON.stringify(outEnvelope, null, 2)}\n`);

  const manifest = {
    specVersion: "rc3-guardrail-revision-v132",
    guardrailV1: { path: "data/oracle-action-eval-rc3-policy-guardrail-v130.json", hash: v1.contentHash },
    guardrailV2: { path: "data/oracle-action-eval-rc3-policy-guardrail-v132.json", hash: outEnvelope.contentHash },
    revisions,
    parserConsultedForCorrection: false,
  };
  manifest.guardrailV2.hash = outEnvelope.contentHash;

  const manifestPath = resolve(outDir, "rc3-guardrail-revision-manifest-v132.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(JSON.stringify({ guardPath, manifestPath, guardrailV2Hash: outEnvelope.contentHash, revisionCount: revisions.length }, null, 2));
}

main();
