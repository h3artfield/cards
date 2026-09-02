/**
 * Win architecture analysis v4.13 — how the deck actually closes games.
 */
import type { FinalDeckDoctorDossierV48 } from "./professor-deck-dossier-v4-8-v1";
import { dossierToPromptText } from "./professor-deck-dossier-v4-8-v1";
import { callHeadProfessorJsonV48 } from "./professor-head-professor-caller-v4-8-v1";

export const PROFESSOR_WIN_ARCHITECTURE_V4_13_V1_VERSION = "professor-win-architecture-v4-13-v1";

export type WinLineV413 = {
  lineName: string;
  requiredPieces: string[];
  manaRequired: string;
  setupRequired: string;
  tutorAccess: string;
  redundancy: string;
  interactionSensitivity: string;
  estimatedThreatWindow: string;
};

export type WinArchitectureV413 = {
  version: typeof PROFESSOR_WIN_ARCHITECTURE_V4_13_V1_VERSION;
  primaryLines: WinLineV413[];
  compactnessScore: number;
  closingSpeed: "SLOW" | "MEDIUM" | "FAST";
  primaryWeakness: string;
  b4GapExplanation: string;
};

const WIN_ARCH_SYSTEM = `You are GPT-5.6 Sol analyzing Commander win architecture.

Return JSON:
{
  "primaryLines": [
    {
      "lineName": "short name",
      "requiredPieces": ["card names or roles"],
      "manaRequired": "description",
      "setupRequired": "description",
      "tutorAccess": "how easy to assemble",
      "redundancy": "backup pieces",
      "interactionSensitivity": "how fragile",
      "estimatedThreatWindow": "turn range when lethal"
    }
  ],
  "compactnessScore": 1-10,
  "closingSpeed": "SLOW"|"MEDIUM"|"FAST",
  "primaryWeakness": "main win architecture problem",
  "b4GapExplanation": "why win plan may not meet B4 if applicable"
}`;

type WinJson = {
  primaryLines?: WinLineV413[];
  compactnessScore?: number;
  closingSpeed?: "SLOW" | "MEDIUM" | "FAST";
  primaryWeakness?: string;
  b4GapExplanation?: string;
};

export async function analyzeWinArchitectureV413(args: {
  dossier: FinalDeckDoctorDossierV48;
  currentBracket: number;
  targetBracket: number;
}): Promise<WinArchitectureV413> {
  const cardIndex = args.dossier.cards
    .filter((c) => c.category !== "land")
    .slice(0, 70)
    .map((c) => `- ${c.name}${c.oracleId ? ` [${c.oracleId.slice(0, 8)}]` : ""} roles=${c.roles.join(",")}`)
    .join("\n");

  const prompt = [
    dossierToPromptText(args.dossier),
    "",
    "# WIN ARCHITECTURE ANALYSIS",
    `Current bracket: B${args.currentBracket} | Target: B${args.targetBracket}`,
    "How does this deck actually win? Cards:",
    cardIndex,
    "",
    "Inspect: piece count, mana, setup, disruptability, tutor access, threat window.",
  ].join("\n");

  try {
    const { parsed } = await callHeadProfessorJsonV48<WinJson>({
      system: WIN_ARCH_SYSTEM,
      userContent: prompt,
    });
    return {
      version: PROFESSOR_WIN_ARCHITECTURE_V4_13_V1_VERSION,
      primaryLines: parsed.primaryLines ?? [],
      compactnessScore: parsed.compactnessScore ?? 4,
      closingSpeed: parsed.closingSpeed ?? "SLOW",
      primaryWeakness: parsed.primaryWeakness ?? "Win plan requires too many pieces",
      b4GapExplanation: parsed.b4GapExplanation ?? "",
    };
  } catch {
    return {
      version: PROFESSOR_WIN_ARCHITECTURE_V4_13_V1_VERSION,
      primaryLines: [],
      compactnessScore: 3,
      closingSpeed: "SLOW",
      primaryWeakness: "Diffuse sacrifice/token plan without compact finisher",
      b4GapExplanation: "B4 requires faster, more redundant closing lines",
    };
  }
}
