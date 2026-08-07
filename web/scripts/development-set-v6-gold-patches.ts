/**
 * Gold-label patches for development_set_v6 (parent: immutable development_set_v5).
 * Each patch records reason metadata for the v6 diff manifest.
 */
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

export interface GoldPatchRecord {
  caseId: string;
  reason: string;
  changedFields: string[];
}

export const V6_GOLD_PATCH_RECORDS: GoldPatchRecord[] = [];

export function applyV6GoldPatches(cases: OracleActionEvalCaseV2[]): number {
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
    V6_GOLD_PATCH_RECORDS.push({ caseId: id, reason, changedFields });
  };

  patch("eval-0021", "Missing untap gold on activated ability trigger.", ["expectedPrimitiveActions"], (c) => {
    c.expectedPrimitiveActions.push({
      actionType: "untap",
      evidenceContains: "Untap this artifact",
    });
  });

  patch(
    "eval-0036",
    "Gold scoped to trigger effect untap; cast-in-condition is not a Layer 2 action.",
    ["expectedPrimitiveActions"],
    (c) => {
      c.expectedPrimitiveActions = [
        { actionType: "untap", evidenceContains: "untap all nonland permanents" },
      ];
    },
  );

  patch(
    "eval-0284",
    "Replacement instead-clause draw on transform back face; attach replacement condition.",
    ["expectedPrimitiveActions", "expectedConditions"],
    (c) => {
      c.expectedPrimitiveActions.push({
        actionType: "draw",
        evidenceContains: "draw two cards",
        cardFace: "back",
      });
      c.expectedConditions = [
        {
          textContains: "If you would draw a card",
          type: "replacement",
          attachesToEvidence: "draw two cards",
        },
      ];
    },
  );

  patch("eval-0281", "Convert back replacement ability structure annotation.", ["expectedStructure"], (c) => {
    c.expectedStructure = {
      ...(c.expectedStructure ?? {}),
      abilityTypes: ["replacement"],
    };
  });

  patch("eval-0285", "Static cost-reduction structure annotation.", ["expectedStructure"], (c) => {
    c.expectedStructure = {
      ...(c.expectedStructure ?? {}),
      abilityTypes: ["static"],
    };
  });

  patch("eval-0266", "Static P/T modification structure annotation.", ["expectedStructure"], (c) => {
    c.expectedStructure = {
      ...(c.expectedStructure ?? {}),
      abilityTypes: ["static"],
    };
  });

  patch("eval-0276", "Battle back static anthem structure annotation.", ["expectedStructure"], (c) => {
    c.expectedStructure = {
      ...(c.expectedStructure ?? {}),
      abilityTypes: ["static", "triggered"],
    };
  });

  patch("eval-0167", "Correct create_token gold for Wolf token trigger.", ["expectedPrimitiveActions"], (c) => {
    c.expectedPrimitiveActions = [
      { actionType: "create_token", evidenceContains: "create a 2/2 Wolf token" },
    ];
  });

  patch(
    "eval-0091",
    "Tighten search_library evidence span to library-search clause.",
    ["expectedPrimitiveActions"],
    (c) => {
      const search = c.expectedPrimitiveActions.find((e) => e.actionType === "search_library");
      if (search) search.evidenceContains = "search your library for";
    },
  );

  patch("eval-0104", "Delayed trigger create_token was missing from gold.", ["expectedPrimitiveActions"], (c) => {
    c.expectedPrimitiveActions.push({
      actionType: "create_token",
      evidenceContains: "create a 3/3 token",
    });
  });

  patch(
    "eval-0109",
    "Optional cast permission on copied spell is a distinct cast primitive.",
    ["expectedPrimitiveActions"],
    (c) => {
      c.expectedPrimitiveActions.push({
        actionType: "cast",
        evidenceContains: "cast the copy",
        optionalEffect: true,
      });
    },
  );

  patch("eval-0112", "Second trigger create_token was missing from gold.", ["expectedPrimitiveActions"], (c) => {
    c.expectedPrimitiveActions.push({
      actionType: "create_token",
      evidenceContains: "create a 1/1 token",
    });
  });

  patch(
    "eval-0142",
    "Discard evidence span aligned to verb phrase (not generic Target).",
    ["expectedPrimitiveActions"],
    (c) => {
      const discard = c.expectedPrimitiveActions.find((e) => e.actionType === "discard");
      if (discard) discard.evidenceContains = "discards two cards";
    },
  );

  patch(
    "eval-0152",
    "Draw evidence span aligned to matched verb phrase draws a card.",
    ["expectedPrimitiveActions"],
    (c) => {
      const draw = c.expectedPrimitiveActions.find((e) => e.actionType === "draw");
      if (draw) draw.evidenceContains = "draws a card";
    },
  );

  patch("eval-0176", "Variable-X token creation is supported create_token.", ["expectedPrimitiveActions"], (c) => {
    c.expectedPrimitiveActions.push({
      actionType: "create_token",
      evidenceContains: "Create X 1/1 tokens",
    });
  });

  patch(
    "eval-0180",
    "Graveyard-to-battlefield return is return_to_battlefield primitive.",
    ["expectedPrimitiveActions"],
    (c) => {
      c.expectedPrimitiveActions.push({
        actionType: "return_to_battlefield",
        evidenceContains: "from your graveyard to the battlefield",
      });
    },
  );

  patch(
    "eval-0192",
    "Reflexive trigger creates token; prior copy label was erroneous.",
    ["expectedPrimitiveActions"],
    (c) => {
      c.expectedPrimitiveActions = [
        { actionType: "create_token", evidenceContains: "creates a 1/1 token" },
      ];
    },
  );

  patch(
    "dev-cond-008",
    "Delayed untap on next end step was missing from gold.",
    ["expectedPrimitiveActions"],
    (c) => {
      c.expectedPrimitiveActions.push({
        actionType: "untap",
        evidenceContains: "untap two lands",
      });
    },
  );

  patch(
    "eval-0040",
    "Graveyard-to-hand modal bullet aligns with return_to_hand taxonomy (not return_to_battlefield).",
    ["expectedPrimitiveActions"],
    (c) => {
      const ret = c.expectedPrimitiveActions.find((e) => e.evidenceContains === "graveyard to your hand");
      if (ret) {
        ret.actionType = "return_to_hand";
        ret.evidenceContains = "from your graveyard to your hand";
      }
    },
  );

  patch(
    "eval-0057",
    "Shuffle hand and graveyard into library is shuffle_into_library, not mill.",
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
    "eval-0062",
    "Cast/play audit: align compound permission with split play lands + cast spells from labels.",
    ["expectedPrimitiveActions"],
    (c) => {
      c.expectedPrimitiveActions = [
        {
          actionType: "play",
          evidenceContains: "play lands",
          optionalEffect: true,
        },
        {
          actionType: "cast",
          evidenceContains: "cast spells from your graveyard",
          optionalEffect: true,
        },
      ];
    },
  );

  patch(
    "eval-0063",
    "Cast/play audit: split compound permission — play lands (play) and cast spells from (cast).",
    ["expectedPrimitiveActions", "expectedRoles"],
    (c) => {
      c.expectedPrimitiveActions = [
        {
          actionType: "play",
          evidenceContains: "play lands",
          optionalEffect: true,
        },
        {
          actionType: "cast",
          evidenceContains: "cast spells from your graveyard",
          optionalEffect: true,
        },
      ];
      c.expectedRoles = [
        {
          role: "recursion",
          fromPrimitiveActions: ["play", "cast"],
        },
      ];
    },
  );

  patch(
    "dev-opt-040",
    "Cast/play audit: split compound permission — play lands (play) and cast spells from (cast).",
    ["expectedPrimitiveActions"],
    (c) => {
      c.expectedPrimitiveActions = [
        {
          actionType: "play",
          evidenceContains: "play lands",
          optionalEffect: true,
        },
        {
          actionType: "cast",
          evidenceContains: "cast spells from your graveyard",
          optionalEffect: true,
        },
      ];
    },
  );

  return count;
}
