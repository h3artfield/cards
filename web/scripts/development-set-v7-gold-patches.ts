/**
 * Gold-label patches for development_set_v7 (FN adjudication, parent: immutable development_set_v6).
 */
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

export interface GoldPatchRecord {
  caseId: string;
  reason: string;
  changedFields: string[];
}

export const V7_GOLD_PATCH_RECORDS: GoldPatchRecord[] = [];

export function applyV7GoldPatches(cases: OracleActionEvalCaseV2[]): number {
  let count = 0;
  const patch = (
    id: string,
    reason: string,
    changedFields: string[],
    updater: (c: OracleActionEvalCaseV2) => void,
  ) => {
    const c = cases.find((x) => x.id === id);
    if (!c) return;
    updater(c);
    count += 1;
    V7_GOLD_PATCH_RECORDS.push({ caseId: id, reason, changedFields });
  };

  patch(
    "eval-0040",
    "Graveyard-to-hand modal bullet is return_to_hand, not return_to_battlefield (carried from v6 adjudication).",
    ["expectedPrimitiveActions", "expectedRoles"],
    (c) => {
      const ret = c.expectedPrimitiveActions.find((e) => e.evidenceContains === "graveyard to your hand");
      if (ret) {
        ret.actionType = "return_to_hand";
        ret.evidenceContains = "from your graveyard to your hand";
      }
      for (const role of c.expectedRoles ?? []) {
        role.fromPrimitiveActions = (role.fromPrimitiveActions ?? []).map((p) =>
          p === "return_to_battlefield" ? "return_to_hand" : p,
        );
      }
    },
  );

  patch(
    "eval-0057",
    "Shuffle hand and graveyard into library is shuffle_into_library, not mill (carried from v6 adjudication).",
    ["expectedPrimitiveActions"],
    (c) => {
      const mill = c.expectedPrimitiveActions.find((e) => e.actionType === "mill");
      if (mill) {
        mill.actionType = "shuffle_into_library";
        mill.evidenceContains = "shuffles their hand and graveyard into their library";
      }
    },
  );

  patch(
    "eval-0054",
    "Two distinct sacrifice effects on -2 and -6 loyalty abilities require separate gold labels.",
    ["expectedPrimitiveActions"],
    (c) => {
      c.expectedPrimitiveActions = [
        {
          actionType: "discard",
          evidenceContains: "discards",
        },
        {
          actionType: "sacrifice",
          evidenceContains: "Target player sacrifices",
        },
        {
          actionType: "sacrifice",
          evidenceContains: "That player sacrifices",
        },
      ];
    },
  );

  patch(
    "eval-0151",
    "Each opponent sacrifices is a Layer-2 sacrifice primitive, not structure-only.",
    ["expectedPrimitiveActions", "expectedStructure"],
    (c) => {
      c.expectedPrimitiveActions = [
        {
          actionType: "sacrifice",
          evidenceContains: "Each opponent sacrifices",
        },
      ];
      c.expectedStructure = { abilityTypes: ["spell_effect"] };
    },
  );

  patch(
    "eval-0064",
    "Flashback grant is structural permission; remove erroneous play primitive.",
    ["expectedPrimitiveActions", "expectedStructure", "expectedRoles"],
    (c) => {
      c.expectedPrimitiveActions = [];
      c.expectedStructure = {
        ...(c.expectedStructure ?? {}),
        abilityTypes: ["triggered"],
      };
      c.expectedRoles = [];
    },
  );

  patch(
    "eval-0083",
    "Graveyard-to-hand is return_to_hand only; remove duplicate return_to_battlefield label.",
    ["expectedPrimitiveActions"],
    (c) => {
      c.expectedPrimitiveActions = [
        {
          actionType: "return_to_hand",
          evidenceContains: "from your graveyard to your hand",
          optionalEffect: false,
          targetMaximum: 2,
          quantityMayBeZero: true,
        },
      ];
    },
  );

  patch(
    "eval-0137",
    "Graveyard-to-hand is return_to_hand only; remove duplicate return_to_battlefield label.",
    ["expectedPrimitiveActions"],
    (c) => {
      c.expectedPrimitiveActions = [
        {
          actionType: "return_to_hand",
          evidenceContains: "from your graveyard to your hand",
        },
      ];
    },
  );

  patch(
    "eval-0150",
    "Reveal top card is not search_library; structural library reveal only.",
    ["expectedPrimitiveActions", "expectedStructure", "expectedRoles"],
    (c) => {
      c.expectedPrimitiveActions = [];
      c.expectedStructure = { abilityTypes: ["spell_effect"] };
      c.expectedRoles = [];
    },
  );

  patch(
    "eval-0196",
    "Draw in Whenever condition is not the triggered effect; keep create_token only.",
    ["expectedPrimitiveActions"],
    (c) => {
      c.expectedPrimitiveActions = c.expectedPrimitiveActions.filter((e) => e.actionType !== "draw");
    },
  );

  patch(
    "eval-0200",
    "Prototype reminder line contains no draw action; remove erroneous draw gold.",
    ["expectedPrimitiveActions", "expectedRoles"],
    (c) => {
      c.expectedPrimitiveActions = [];
      c.expectedRoles = [];
    },
  );

  patch(
    "eval-0202",
    "Mutate keyword line contains no draw action; remove erroneous draw gold.",
    ["expectedPrimitiveActions", "expectedRoles"],
    (c) => {
      c.expectedPrimitiveActions = [];
      c.expectedRoles = [];
    },
  );

  patch(
    "eval-0120",
    "Sacrifice in Whenever clause is trigger event, not Layer 2 effect; remove sacrifice gold.",
    ["expectedPrimitiveActions"],
    (c) => {
      c.expectedPrimitiveActions = c.expectedPrimitiveActions.filter((e) => e.actionType !== "sacrifice");
    },
  );

  patch(
    "dev-opt-016",
    "Choose-from-graveyard without battlefield destination is structural; not return_to_battlefield.",
    ["expectedPrimitiveActions", "expectedStructure"],
    (c) => {
      c.expectedPrimitiveActions = [];
      c.expectedStructure = { abilityTypes: ["spell_effect"] };
    },
  );

  patch(
    "dev-opt-038",
    "Target retargeting on copy is structural; single copy primitive only.",
    ["expectedPrimitiveActions"],
    (c) => {
      c.expectedPrimitiveActions = c.expectedPrimitiveActions.filter(
        (e) => !e.evidenceContains.includes("choose new targets"),
      );
    },
  );

  return count;
}
