/**
 * Win function semantics + win packages v4.14.
 */
import type { GoldenCatalogOracleCard } from "@/lib/deck-builder/golden-catalog/schemas";
import { combinedGoldenOracleText } from "../../../scripts/lib/load-golden-catalog-index";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";
import { buildFunctionalCardProfileV47 } from "./professor-functional-profile-v4-7-v1";
import type { FinalDeckDoctorDossierV48 } from "./professor-deck-dossier-v4-8-v1";
import { dossierToPromptText } from "./professor-deck-dossier-v4-8-v1";
import { callHeadProfessorJsonV48 } from "./professor-head-professor-caller-v4-8-v1";

export const PROFESSOR_WIN_PACKAGE_V4_14_V1_VERSION = "professor-win-package-v4-14-v1";

export type WinFunctionTypeV414 =
  | "VALUE_PAYOFF"
  | "ENGINE_PAYOFF"
  | "FINISHER"
  | "WIN_CONDITION"
  | "COMBO_COMPONENT"
  | "WIN_ENABLER";

export type WinPackageCardV414 = {
  name: string;
  oracleId: string | null;
  winFunction: WinFunctionTypeV414;
  roles: string[];
};

export type WinPackageV414 = {
  packageId: string;
  name: string;
  cards: WinPackageCardV414[];
  requiredPieces: string[];
  optionalPieces: string[];
  commanderRequired: boolean;
  setupMana: string;
  executionMana: string;
  turnsOfSetup: number;
  tutorAccess: string[];
  redundantPieces: string[];
  producesLethal: boolean;
  lethalMechanism: string;
  disruptableBy: string[];
  protectionAvailable: string[];
  worksWithoutCommander: boolean;
  compactnessScore: number;
  accessibilityScore: number;
  resilienceScore: number;
  expectedThreatWindow: string;
};

export type PackageDragV414 = {
  packageId: string;
  cards: string[];
  oracleIds: (string | null)[];
  slotsConsumed: number;
  purpose: string;
  currentContribution: string;
  bracketContribution: number;
  reasonItDragsTarget: string;
  preserveAnyCards: string[];
  cutCandidates: string[];
  desiredReplacementPackage: string;
};

export type BracketUpgradePackageProposalV414 = {
  version: typeof PROFESSOR_WIN_PACKAGE_V4_14_V1_VERSION;
  proposalId: string;
  currentPackage: string[];
  removeCards: string[];
  preserveCards: string[];
  addCards: string[];
  reason: string;
  deficitsSolved: string[];
  oldWinArchitecture: string;
  newWinArchitecture: string;
  oldSlotCount: number;
  newSlotCount: number;
  expectedThreatWindowBefore: string;
  expectedThreatWindowAfter: string;
  commanderFit: boolean;
  charterFit: boolean;
  bracketImpact: string;
  criticApproved: boolean;
  criticRejectionReason?: string;
};

export function classifyWinFunctionV414(card: GoldenCatalogOracleCard): WinFunctionTypeV414 {
  const text = combinedGoldenOracleText(card).toLowerCase();
  if (/you win the game/.test(text)) return "WIN_CONDITION";
  if (/can't be blocked|extra turn|take .* extra turns/.test(text)) return "FINISHER";
  if (/whenever .* dies|whenever a creature dies|drain|lose life equal/.test(text)) return "WIN_ENABLER";
  if (/sacrifice.*:.*draw|sacrifice.*:.*add|token/.test(text) && !/win the game/.test(text)) return "COMBO_COMPONENT";
  if (/doubling|proliferate|counter/.test(text)) return "ENGINE_PAYOFF";
  return "VALUE_PAYOFF";
}

export function inferWinPackagesFromDeck(args: {
  selectedCards: CouncilCardV46[];
  catalog: DeckResolutionCatalog;
}): WinPackageV414[] {
  const sacrifice = args.selectedCards.filter((c) => {
    const g = c.oracleId ? args.catalog.byOracleId.get(c.oracleId) : null;
    const profile = g ? buildFunctionalCardProfileV47(g) : null;
    return profile?.roles.includes("sacrifice-outlet") || c.roles.includes("sacrifice-outlet");
  });
  const payoffs = args.selectedCards.filter((c) => {
    const g = c.oracleId ? args.catalog.byOracleId.get(c.oracleId) : null;
    if (!g) return false;
    const wf = classifyWinFunctionV414(g);
    return wf === "WIN_ENABLER" || wf === "FINISHER" || wf === "WIN_CONDITION";
  });
  const fuel = args.selectedCards.filter((c) => {
    const g = c.oracleId ? args.catalog.byOracleId.get(c.oracleId) : null;
    const profile = g ? buildFunctionalCardProfileV47(g) : null;
    return profile?.roles.includes("token-generation") || profile?.roles.includes("ramp");
  });

  if (payoffs.length === 0 && sacrifice.length === 0) return [];

  const packageCards: WinPackageCardV414[] = [...sacrifice.slice(0, 3), ...fuel.slice(0, 4), ...payoffs.slice(0, 3)].map((c) => {
    const g = c.oracleId ? args.catalog.byOracleId.get(c.oracleId)! : null;
    return {
      name: c.name,
      oracleId: c.oracleId,
      winFunction: g ? classifyWinFunctionV414(g) : "VALUE_PAYOFF",
      roles: c.roles,
    };
  });

  const unique = new Map<string, WinPackageCardV414>();
  for (const pc of packageCards) unique.set(pc.name, pc);

  return [
    {
      packageId: "pkg-sacrifice-line-inferred",
      name: "Sacrifice resource cycle",
      cards: [...unique.values()],
      requiredPieces: sacrifice.slice(0, 2).map((c) => c.name),
      optionalPieces: fuel.slice(0, 2).map((c) => c.name),
      commanderRequired: true,
      setupMana: "4-6",
      executionMana: "2-4 per turn",
      turnsOfSetup: 4,
      tutorAccess: [],
      redundantPieces: [],
      producesLethal: payoffs.some((c) => /artist|devil|plunderer|tremors/.test(c.name.toLowerCase())),
      lethalMechanism: payoffs.length ? "death triggers / drain" : "combat / incremental",
      disruptableBy: ["removal on engine", "graveyard hate", "stifle on triggers"],
      protectionAvailable: [],
      worksWithoutCommander: false,
      compactnessScore: payoffs.length >= 2 && sacrifice.length >= 2 ? 6 : 4,
      accessibilityScore: 5,
      resilienceScore: sacrifice.length >= 3 ? 6 : 4,
      expectedThreatWindow: "turn 7-9",
    },
  ];
}

const WIN_PACKAGE_SYSTEM = `You are GPT-5.6 Sol analyzing Commander win lines from the exact deck list.

Return JSON:
{
  "winPackages": [
    {
      "packageId": "id",
      "name": "line name",
      "cards": ["exact card names"],
      "requiredPieces": ["..."],
      "optionalPieces": ["..."],
      "commanderRequired": true|false,
      "setupMana": "description",
      "executionMana": "description",
      "turnsOfSetup": number,
      "tutorAccess": ["which tutors find pieces"],
      "redundantPieces": ["..."],
      "producesLethal": true|false,
      "lethalMechanism": "how",
      "disruptableBy": ["..."],
      "protectionAvailable": ["..."],
      "worksWithoutCommander": true|false,
      "compactnessScore": 1-10,
      "accessibilityScore": 1-10,
      "resilienceScore": 1-10,
      "expectedThreatWindow": "turn range"
    }
  ],
  "packageDrag": [
    {
      "packageId": "id",
      "cards": ["exact names"],
      "slotsConsumed": number,
      "purpose": "what package does",
      "currentContribution": "current value",
      "bracketContribution": 1-10,
      "reasonItDragsTarget": "why insufficient for target bracket",
      "preserveAnyCards": ["optional keep"],
      "cutCandidates": ["cards to cut"],
      "desiredReplacementPackage": "functional replacement description"
    }
  ]
}`;

type WinPackageJson = { winPackages?: WinPackageV414[]; packageDrag?: PackageDragV414[] };

export async function analyzeWinPackagesWithSolV414(args: {
  dossier: FinalDeckDoctorDossierV48;
  selectedCards: CouncilCardV46[];
  targetBracket: number;
  currentBracket: number;
}): Promise<{ winPackages: WinPackageV414[]; packageDrag: PackageDragV414[] }> {
  const cardIndex = args.selectedCards
    .filter((c) => c.category !== "land")
    .map((c) => `${c.name} | oracleId=${c.oracleId ?? "null"}`)
    .join("\n");

  const prompt = [
    dossierToPromptText(args.dossier),
    "",
    "# WIN LINE / PACKAGE ANALYSIS",
    `Current B${args.currentBracket} → Target B${args.targetBracket}`,
    "What are the actual ways this deck wins? Which packages are too slow/diffuse for B4?",
    cardIndex,
  ].join("\n");

  try {
    const { parsed } = await callHeadProfessorJsonV48<WinPackageJson>({
      system: WIN_PACKAGE_SYSTEM,
      userContent: prompt,
    });
    return {
      winPackages: parsed.winPackages ?? [],
      packageDrag: (parsed.packageDrag ?? []).map((p) => ({
        ...p,
        oracleIds: p.cards.map((n) => args.selectedCards.find((c) => c.name === n)?.oracleId ?? null),
      })),
    };
  } catch {
    return { winPackages: [], packageDrag: [] };
  }
}

export function buildPackageUpgradeProposalsV414(args: {
  packageDrag: PackageDragV414[];
  selectedCards: CouncilCardV46[];
  catalog: DeckResolutionCatalog;
  colorIdentity: string[];
  excludeNames: Set<string>;
}): BracketUpgradePackageProposalV414[] {
  const proposals: BracketUpgradePackageProposalV414[] = [];

  const PACKAGE_REPLACEMENTS: Record<string, { remove: string[]; add: string[]; reason: string }> = {
    "slow token/value route": {
      remove: [],
      add: ["Pitiless Plunderer", "Blood Artist"],
      reason: "Compact sacrifice drain closure",
    },
    token: {
      remove: [],
      add: ["Mayhem Devil", "Impact Tremors", "Zulaport Cutthroat"],
      reason: "Token-to-lethal conversion package",
    },
    diffuse: {
      remove: [],
      add: ["Deadly Dispute", "Village Rites", "Plumb the Forbidden"],
      reason: "Sacrifice fuel + card velocity package",
    },
  };

  for (const drag of args.packageDrag.slice(0, 2)) {
    const removeCards = drag.cutCandidates.length > 0 ? drag.cutCandidates : drag.cards.filter((c) => !drag.preserveAnyCards.includes(c));
    if (removeCards.length === 0) continue;

    const key = Object.keys(PACKAGE_REPLACEMENTS).find((k) => drag.reasonItDragsTarget.toLowerCase().includes(k) || drag.purpose.toLowerCase().includes(k));
    const template = key ? PACKAGE_REPLACEMENTS[key] : { remove: removeCards.slice(0, 2), add: ["Mayhem Devil", "Pitiless Plunderer"], reason: drag.desiredReplacementPackage };

    const adds = template.add.filter((a) => !args.excludeNames.has(a.toLowerCase())).slice(0, Math.max(1, removeCards.length - 1));
    if (adds.length === 0) continue;

    proposals.push({
      version: PROFESSOR_WIN_PACKAGE_V4_14_V1_VERSION,
      proposalId: `pkg-${drag.packageId}`,
      currentPackage: drag.cards,
      removeCards: removeCards.slice(0, adds.length + 1),
      preserveCards: drag.preserveAnyCards,
      addCards: adds,
      reason: template.reason,
      deficitsSolved: ["WIN_COMPACTNESS"],
      oldWinArchitecture: drag.purpose,
      newWinArchitecture: template.reason,
      oldSlotCount: drag.slotsConsumed,
      newSlotCount: adds.length + removeCards.length - adds.length,
      expectedThreatWindowBefore: "turn 8+",
      expectedThreatWindowAfter: "turn 6-8",
      commanderFit: true,
      charterFit: true,
      bracketImpact: "Compress win package for B4",
      criticApproved: false,
    });
  }

  if (proposals.length === 0 && args.packageDrag.length === 0) {
    const slowTokenCards = args.selectedCards.filter((c) =>
      /thopter assembly|minion reflector|one with the kami|topography|cogwork assembler/.test(c.name.toLowerCase()),
    );
    if (slowTokenCards.length >= 2) {
      const remove = slowTokenCards.slice(0, 3).map((c) => c.name);
      const adds = ["Mayhem Devil", "Pitiless Plunderer"].filter((a) => !args.excludeNames.has(a.toLowerCase()));
      if (adds.length >= 1) {
        proposals.push({
          version: PROFESSOR_WIN_PACKAGE_V4_14_V1_VERSION,
          proposalId: "pkg-fallback-token-route",
          currentPackage: remove,
          removeCards: remove,
          preserveCards: [],
          addCards: adds,
          reason: "Replace slow token package with compact sacrifice drain closure",
          deficitsSolved: ["WIN_COMPACTNESS"],
          oldWinArchitecture: "Slow token/value route",
          newWinArchitecture: "Sacrifice drain compact win",
          oldSlotCount: remove.length,
          newSlotCount: adds.length,
          expectedThreatWindowBefore: "turn 8+",
          expectedThreatWindowAfter: "turn 6-7",
          commanderFit: true,
          charterFit: true,
          bracketImpact: "Package-level win compression",
          criticApproved: false,
        });
      }
    }
  }

  return proposals;
}
