import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { verifySemanticParseIntegrity } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-integrity";
import { segmentCardFaces, segmentAbilities } from "../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import { buildModalOptions } from "../src/lib/deck-builder/golden-catalog/oracle-action-structural-blocks";

const oracleText =
  "Whenever you attack, you may sacrifice another creature. When you do, choose two —\n• Create two 1/1 red and white Soldier creature tokens with haste that are tapped and attacking.\n• You draw a card and you lose 1 life.\n• Caesar deals damage equal to the number of creature tokens you control to target opponent.";

const face = segmentCardFaces(oracleText)[0]!;
const segs = segmentAbilities("8e62d05a-6efd-4764-bca8-97895e0cb613", face.faceId, face.text, face.start);
const modalGroups = buildModalOptions("8e62d05a-6efd-4764-bca8-97895e0cb613", face.faceId, face.text, face.start);

const p = parseOracleSemanticsRC3({ oracleId: "8e62d05a-6efd-4764-bca8-97895e0cb613", oracleText });
console.log(
  JSON.stringify(
    {
      segments: segs.map((s) => ({
        idx: s.abilityIndex,
        type: s.abilityType,
        start: s.paragraphStart,
        end: s.paragraphEnd,
        text: s.paragraphText.slice(0, 80),
      })),
      modalGroups: modalGroups.map((g) => ({
        choose: g.chooseConstraints,
        options: g.options.length,
        headerIdx: g.headerAbilityIndex,
      })),
      abilities: p.abilities.map((a) => ({
        id: a.abilityId,
        type: a.abilityType,
        span: [a.abilitySpan.cardStart, a.abilitySpan.cardEnd],
        textHead: a.abilitySpan.text.slice(0, 60),
        options: a.options?.length,
      })),
      actions: p.actions.map((a) => ({
        type: a.actionType,
        parent: a.parentAbilityId,
        span: [a.provenance.actionSpan.cardStart, a.provenance.actionSpan.cardEnd],
        evidence: a.provenance.actionSpan.text,
        idx: a.segmentAbilityIndex,
        src: a.extractionSource,
        status: a.reviewStatus,
      })),
      invalid: p.semanticValidation,
      integrity: verifySemanticParseIntegrity(p, oracleText),
    },
    null,
    2,
  ),
);
