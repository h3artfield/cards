import { eventRegistrationBracketV1 } from "./event-registration-bracket-v1";
import type { EditableDeckV1 } from "./types-v1";

function deck(partial: Partial<EditableDeckV1> & Pick<EditableDeckV1, "buildId">): EditableDeckV1 {
  return {
    version: "professor-deck-editor-types-v1",
    deckId: "cust_test",
    buildId: partial.buildId,
    customerId: "cust",
    storeId: "store",
    storeSlug: "shop",
    deckName: "Test",
    bracket: partial.bracket ?? 3,
    commander: { oracleId: "c", name: "Commander", colorIdentity: ["G"] },
    cards: [],
    markers: [],
    baselineCards: partial.baselineCards ?? [],
    editedByUser: partial.editedByUser ?? false,
    revision: partial.revision ?? 0,
    measuredBracket: partial.measuredBracket,
    createdAt: "",
    updatedAt: "",
  };
}

const cases: Array<{ label: string; d: EditableDeckV1; bracket: number | null; stale: boolean }> = [
  {
    label: "unedited professor",
    d: deck({ buildId: "b1", bracket: 3 }),
    bracket: 3,
    stale: false,
  },
  {
    label: "edited professor without remeasure",
    d: deck({ buildId: "b1", editedByUser: true, baselineCards: [{} as never] }),
    bracket: null,
    stale: true,
  },
  {
    label: "fresh manual measurement",
    d: deck({
      buildId: null,
      measuredBracket: { bracket: 2, atRevision: 1, measuredAt: "" },
      revision: 1,
    }),
    bracket: 2,
    stale: false,
  },
];

let failed = 0;
for (const c of cases) {
  const got = eventRegistrationBracketV1(c.d);
  if (got.bracket !== c.bracket || got.stale !== c.stale) {
    console.error("FAIL", c.label, got, "expected", c.bracket, c.stale);
    failed++;
  }
}
if (failed) process.exit(1);
console.log("event-registration-bracket-v1 selftest passed");
