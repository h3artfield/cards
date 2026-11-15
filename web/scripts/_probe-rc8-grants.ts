import { readFileSync } from "node:fs";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { detectGrantedRulesSpans } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-span-detector";
import { segmentCardFaces, segmentAbilities } from "../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";

const CASE_IDS = ["vh17-0002", "vh17-0005", "vh17-0006", "vh17-0007", "vh17-0009", "vh17-0015", "vh17-0020"];

const bench = JSON.parse(readFileSync("data/oracle-action-eval-validation-v17.json", "utf8")) as {
  cases: Array<{ id: string; oracleId: string; oracleText: string; expectedPrimitiveActions: Array<{ actionType: string; evidenceContains?: string }> }>;
};

for (const id of CASE_IDS) {
  const tc = bench.cases.find((c) => c.id === id)!;
  const parse = parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText });
  const faces = segmentCardFaces(tc.oracleText);
  const segs = faces.flatMap((f) => segmentAbilities(tc.oracleId, f.faceId, f.text, f.start));
  const grantSpans = segs.flatMap((s) =>
    detectGrantedRulesSpans(s.paragraphText, `${tc.oracleId}:${s.faceId}:ability-${s.abilityIndex}`).map((g) => ({
      seg: s.abilityIndex,
      cue: g.structuralCue,
      grantedTo: g.grantedTo,
      typography: g.typography,
      inner: g.innerText.slice(0, 80),
    })),
  );
  const grantedAbilities = parse.abilities.filter((a) => a.abilityOrigin === "granted" || a.abilityType === "granted");
  const grantedActions = parse.actions.filter(
    (a) => a.executionContext === "granted_ability" && a.reviewStatus === "accepted",
  );
  console.log(
    JSON.stringify(
      {
        caseId: id,
        grantSpansDetected: grantSpans.length,
        grantSpans,
        grantedAbilitiesInAst: parse.abilities.filter((a) => (a as { abilityOrigin?: string }).abilityOrigin === "granted").map((a) => ({
          id: a.abilityId,
          type: a.abilityType,
          span: [a.abilitySpan.cardStart, a.abilitySpan.cardEnd],
          textHead: a.abilitySpan.text.slice(0, 60),
        })),
        acceptedGrantedActions: grantedActions.map((a) => ({
          type: a.actionType,
          evidence: a.provenance.actionSpan.text.slice(0, 60),
          owner: a.semanticOwner,
        })),
        missingGold: tc.expectedPrimitiveActions
          .filter((g) => !g.evidenceContains?.includes("Search") && !g.evidenceContains?.includes("shuffle"))
          .filter(
            (g) =>
              !parse.actions.some(
                (a) =>
                  a.reviewStatus === "accepted" &&
                  a.actionType === g.actionType &&
                  a.provenance.actionSpan.text.toLowerCase().includes((g.evidenceContains ?? "").toLowerCase().slice(0, 20)),
              ),
          )
          .map((g) => ({ type: g.actionType, evidence: g.evidenceContains?.slice(0, 60) })),
      },
      null,
      0,
    ),
  );
}
