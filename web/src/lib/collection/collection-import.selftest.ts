import assert from "node:assert/strict";
import { parseCollectionImportText } from "./collection-import-parse";
import { stripFoilMark } from "./collection-finish";
import {
  buildOwnedCardIndex,
  overlayTone,
  splitCopyOwnership,
} from "./owned-index";

const lines = parseCollectionImportText(`
1 Sol Ring (c21) 165
2 Lightning Bolt
Sol Ring
`);
assert.equal(lines.length, 3);
assert.deepEqual(
  lines.find((l) => l.name === "Lightning Bolt"),
  { name: "Lightning Bolt", quantity: 2, setCode: undefined, collectorNumber: undefined },
);
const ring = lines.find((l) => l.setCode === "c21");
assert.equal(ring?.name, "Sol Ring");
assert.equal(ring?.collectorNumber, "165");

const csv = parseCollectionImportText(`Count,Name,Set,Collector Number
1,Birds of Paradise,mh2,199
`);
assert.equal(csv[0]?.name, "Birds of Paradise");
assert.equal(csv[0]?.setCode, "mh2");

assert.deepEqual(stripFoilMark("Lightning Bolt *F*"), {
  name: "Lightning Bolt",
  finish: "foil",
});
const foilLine = parseCollectionImportText("1 Sol Ring (c21) 165 *F*");
assert.equal(foilLine[0]?.finish, "foil");
assert.equal(foilLine[0]?.name, "Sol Ring");

const foilCsv = parseCollectionImportText(`Count,Name,Set,Foil
1,Birds of Paradise,mh2,foil
`);
assert.equal(foilCsv[0]?.finish, "foil");

const dek = parseCollectionImportText(
  `<Deck><Cards Qty="3" Name="Forest" Edition="UNF" /></Deck>`,
);
assert.equal(dek.length, 1);
assert.equal(dek[0]?.quantity, 3);
assert.equal(dek[0]?.setCode, "unf");

assert.deepEqual(splitCopyOwnership(2, 1, 4), {
  owned: 1,
  buyHere: 1,
  needElsewhere: 0,
});
assert.deepEqual(splitCopyOwnership(3, 1, 0), {
  owned: 1,
  buyHere: 0,
  needElsewhere: 2,
});
assert.equal(overlayTone({ owned: 2, buyHere: 0, needElsewhere: 0 }), "owned");
assert.equal(overlayTone({ owned: 1, buyHere: 1, needElsewhere: 0 }), "mixed");

const index = buildOwnedCardIndex([
  {
    status: "owned",
    displayName: "Sol Ring",
    oracleId: "o-ring",
    quantity: 2,
  },
  {
    status: "owned",
    displayName: "Vague Card",
    needsReview: true,
    quantity: 4,
  },
]);
assert.equal(index.count, 2);
assert.equal(index.qtyByOracleId.get("o-ring"), 2);
assert.equal(index.names.has("vague card"), false);

console.log("PASS  collection import parse + copy-aware ownership");
