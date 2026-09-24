/**
 * RC5 Pass 2 audit — structural diagnosis for vh14-0094 and vh14-0098.
 * Run: cd web && npx tsx scripts/diagnose-rc5-replacement-v150.ts
 */
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { segmentAbilities, segmentCardFaces } from "../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import {
  classifyTextRoleAt,
  compoundClauseSpansWithRoles,
  findReminderSpans,
} from "../src/lib/deck-builder/golden-catalog/oracle-span-role-classifier";
import { extractClauseNativeActions } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-clause-native";

const CASES = [
  {
    id: "vh14-0094",
    cardName: "Alchemax Slayer-Bots",
    oracleId: "cdc7356c-9621-4420-9fda-c8b91df0ec7c",
    oracleText:
      "When this creature enters, tap target creature an opponent controls and put a stun counter on it. (If a permanent with a stun counter would become untapped, remove one from it instead.)",
    expectedAction: "tap",
    expectedEvidence: "tap target creature an opponent controls and put a stun counter on it",
  },
  {
    id: "vh14-0098",
    cardName: "Ambling Stormshell",
    oracleId: "75070eaf-c931-46e5-9aa1-b849e33580c6",
    oracleText:
      "Ward {2}\nWhenever this creature attacks, put three stun counters on it and draw three cards. (If a permanent with a stun counter would become untapped, remove one from it instead.)\nWhenever you cast a Turtle spell, untap this creature.",
    expectedAction: "draw",
    expectedEvidence: "draw three cards",
  },
];

for (const c of CASES) {
  console.log("\n" + "=".repeat(72));
  console.log(c.id, c.cardName);
  console.log("=".repeat(72));
  console.log("FULL ORACLE:\n", c.oracleText);

  const faces = segmentCardFaces(c.oracleText);
  for (const face of faces) {
    for (const ability of segmentAbilities(c.oracleId, face.faceId, face.text, face.start)) {
      console.log("\n--- ability ---");
      console.log("type:", ability.abilityType);
      console.log("text:", ability.paragraphText);

      const parentId = `${c.oracleId}:${ability.cardFaceId}:${ability.abilityIndex}`;
      const clauses = compoundClauseSpansWithRoles(ability.paragraphText, parentId);
      console.log(
        "clause spans:",
        clauses.map((cl) => ({ role: cl.role, text: cl.text.slice(0, 80) })),
      );

      const reminders = findReminderSpans(ability.paragraphText);
      console.log(
        "reminder spans:",
        reminders.map((r) => ({ role: r.role, text: r.text.slice(0, 80) })),
      );

      for (const cl of clauses) {
        const idx = ability.paragraphText.indexOf(cl.text);
        if (idx < 0) continue;
        for (const needle of ["tap target", "draw three", "would become untapped", "remove one from it instead"]) {
          if (cl.text.toLowerCase().includes(needle)) {
            console.log(`role@${needle}:`, classifyTextRoleAt({
              paragraph: ability.paragraphText,
              localStart: idx,
              localEnd: idx + cl.text.length,
              abilityType: ability.abilityType,
            }));
          }
        }
      }
    }
  }

  const parse = parseOracleSemanticsRC3({ oracleId: c.oracleId, oracleText: c.oracleText });
  console.log("\nsemantic AST summary:");
  console.log("  replacementEffects:", parse.replacementEffects?.length ?? 0);
  if (parse.replacementEffects?.length) {
    for (const r of parse.replacementEffects) {
      console.log("   - event:", r.eventClause?.text?.slice(0, 60));
      console.log("     replacement:", r.replacementClause?.text?.slice(0, 60));
    }
  }
  console.log("  grantedAbilities:", parse.grantedAbilities?.length ?? 0);

  const native = extractClauseNativeActions({ oracleId: c.oracleId, oracleText: c.oracleText });
  console.log("\nclause-native actions:", native.actions.filter((a) => a.reviewStatus === "accepted").map((a) => ({
    type: a.actionType,
    ev: a.evidenceText.slice(0, 60),
    role: a.textRole,
    ctx: (a as { executionContext?: string }).executionContext,
  })));

  console.log("\nrc3 emitted actions:", parse.actions.filter((a) => a.reviewStatus === "accepted").map((a) => ({
    type: a.actionType,
    ev: a.provenance.actionSpan.text.slice(0, 60),
    role: a.clauseRole,
    ctx: a.executionContext,
    owner: a.semanticOwner,
  })));

  const hit = parse.actions.find(
    (a) =>
      a.reviewStatus === "accepted" &&
      a.actionType === c.expectedAction &&
      a.provenance.actionSpan.text.toLowerCase().includes(c.expectedEvidence.toLowerCase().slice(0, 16)),
  );
  console.log("\nexpected L2 recovered:", !!hit);
  if (!hit) {
    const tapOrDraw = parse.actions.filter((a) => a.actionType === c.expectedAction);
    console.log("same-type emissions:", tapOrDraw.map((a) => a.provenance.actionSpan.text));
  }
}
