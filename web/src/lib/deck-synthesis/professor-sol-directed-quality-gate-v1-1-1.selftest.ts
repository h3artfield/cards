import assert from "node:assert/strict";
import {
  formatHeadProfessorQualityFailureDetailV111,
  isSolDirectedHeadProfessorShippableV111,
  shouldRunProfessorRepairCriticV111,
  type SolDirectedHeadProfessorWholeDeckVerdictV111,
} from "./professor-sol-directed-head-professor-v1-1-1";

function verdict(
  partial: Partial<SolDirectedHeadProfessorWholeDeckVerdictV111> &
    Pick<SolDirectedHeadProfessorWholeDeckVerdictV111, "classification" | "grade">,
): SolDirectedHeadProfessorWholeDeckVerdictV111 {
  return {
    bracketFit: "",
    strategyCoherence: "",
    manaAssessment: "",
    earlyMidLateGameAssessment: "",
    winConditionAssessment: "",
    interactionAssessment: "",
    resilienceAssessment: "",
    offPlanCards: [],
    requiredChanges: [],
    optionalChanges: [],
    reasoningSummary: "",
    selfBuildQuestionAnswer: "",
    ...partial,
  };
}

assert.equal(
  isSolDirectedHeadProfessorShippableV111(
    verdict({ classification: "CONSTRUCTION_SUCCESS", grade: "A" }),
  ),
  true,
);
assert.equal(
  isSolDirectedHeadProfessorShippableV111(
    verdict({ classification: "OPTIONAL_REFINEMENT", grade: "B+" }),
  ),
  true,
);
assert.equal(
  isSolDirectedHeadProfessorShippableV111(
    verdict({
      classification: "CONSTRUCTION_DEFECT",
      grade: "F as submitted; approximately B+/A- after correction",
    }),
  ),
  false,
);
assert.equal(
  isSolDirectedHeadProfessorShippableV111(
    verdict({ classification: "OPTIONAL_REFINEMENT", grade: "F as submitted; approximately A- after fixes" }),
  ),
  false,
);

assert.equal(
  shouldRunProfessorRepairCriticV111(
    verdict({ classification: "OPTIONAL_REFINEMENT", grade: "B+", requiredChanges: ["Add two ETB creatures"] }),
  ),
  true,
);
assert.equal(
  shouldRunProfessorRepairCriticV111(
    verdict({ classification: "CONSTRUCTION_SUCCESS", grade: "A-" }),
  ),
  false,
);

const detail = formatHeadProfessorQualityFailureDetailV111(
  verdict({
    classification: "CONSTRUCTION_DEFECT",
    grade: "F as submitted; approximately B+/A- after correction",
    requiredChanges: ["Cut 3 slow lands for interaction"],
    offPlanCards: ["Rhystic Study"],
  }),
);
assert.match(detail, /F as submitted/);
assert.match(detail, /Required:/);

import {
  isSolDirectedHeadProfessorBestEffortShippableV111,
  prepareHeadProfessorVerdictForCustomerV111,
} from "./professor-sol-directed-deck-grade-v1-1-1";

assert.equal(
  isSolDirectedHeadProfessorBestEffortShippableV111(
    verdict({ classification: "CONSTRUCTION_DEFECT", grade: "D+" }),
    { repairPassesCompleted: 2, maxRepairPasses: 2, validationPass: true },
  ),
  true,
);
assert.equal(
  isSolDirectedHeadProfessorBestEffortShippableV111(
    verdict({ classification: "CONSTRUCTION_DEFECT", grade: "C-" }),
    { repairPassesCompleted: 2, maxRepairPasses: 2, validationPass: true },
  ),
  true,
);
assert.equal(
  isSolDirectedHeadProfessorBestEffortShippableV111(
    verdict({ classification: "CONSTRUCTION_DEFECT", grade: "D" }),
    { repairPassesCompleted: 2, maxRepairPasses: 2, validationPass: true, deckPreferencesConstrained: true },
  ),
  true,
);
assert.equal(
  isSolDirectedHeadProfessorBestEffortShippableV111(
    verdict({ classification: "CONSTRUCTION_DEFECT", grade: "D+" }),
    { repairPassesCompleted: 1, maxRepairPasses: 2, validationPass: true },
  ),
  false,
);
assert.equal(
  isSolDirectedHeadProfessorBestEffortShippableV111(
    verdict({ classification: "CONSTRUCTION_DEFECT", grade: "D" }),
    { repairPassesCompleted: 2, maxRepairPasses: 2, validationPass: true },
  ),
  false,
);

const softened = prepareHeadProfessorVerdictForCustomerV111(
  verdict({
    classification: "CONSTRUCTION_DEFECT",
    grade: "C-",
    requiredChanges: ["Fix token package"],
  }),
  true,
);
assert.equal(softened.classification, "OPTIONAL_REFINEMENT");
assert.equal(softened.requiredChanges.length, 0);
assert.equal(softened.optionalChanges.length, 1);

console.log("professor-sol-directed-quality-gate-v1-1-1.selftest: ok");
