/**
 * P5 — explicit versioned D2 matchup ontology (not Cartesian product).
 * MB and CMD source vectors stay separate.
 */
import { MATCHUP_ONTOLOGY_V2_1_VERSION } from "./types";

export type MatchupZoneBlock = "mainboard" | "commandZone";

export type MatchupPairingDef = {
  termKey: string;
  direction: "oppDisruptsMy" | "myDisruptsOpp";
  rationale: string;
  oppVector: { family: string; vector: "disruption" | "exposure"; zone: MatchupZoneBlock };
  myVector: { family: string; vector: "reliance" | "exposure"; zone: MatchupZoneBlock };
  semanticDefinition: string;
};

export const MATCHUP_PAIRINGS_V2_1: MatchupPairingDef[] = [
  {
    termKey: "d2_oppGyDisrupt_x_myMbGyReliance",
    direction: "oppDisruptsMy",
    rationale: "Graveyard hate vs graveyard/reanimation plan.",
    oppVector: { family: "graveyard", vector: "disruption", zone: "mainboard" },
    myVector: { family: "graveyard", vector: "reliance", zone: "mainboard" },
    semanticDefinition: "opp MB graveyard disruption × my MB graveyard reliance",
  },
  {
    termKey: "d2_oppGyDisrupt_x_myCmdGyReliance",
    direction: "oppDisruptsMy",
    rationale: "Graveyard hate vs commander graveyard plan (Muldrotha).",
    oppVector: { family: "graveyard", vector: "disruption", zone: "mainboard" },
    myVector: { family: "graveyard", vector: "reliance", zone: "commandZone" },
    semanticDefinition: "opp MB graveyard disruption × my CMD graveyard reliance",
  },
  {
    termKey: "d2_oppArtDisrupt_x_myMbArtReliance",
    direction: "oppDisruptsMy",
    rationale: "Artifact removal vs artifact-synergy plan.",
    oppVector: { family: "artifacts", vector: "disruption", zone: "mainboard" },
    myVector: { family: "artifacts", vector: "reliance", zone: "mainboard" },
    semanticDefinition: "opp MB artifact disruption × my MB artifact reliance",
  },
  {
    termKey: "d2_oppArtDisrupt_x_myMbArtExposure",
    direction: "oppDisruptsMy",
    rationale: "Artifact removal vs artifact-heavy composition.",
    oppVector: { family: "artifacts", vector: "disruption", zone: "mainboard" },
    myVector: { family: "artifacts", vector: "exposure", zone: "mainboard" },
    semanticDefinition: "opp MB artifact disruption × my MB artifact exposure",
  },
  {
    termKey: "d2_oppArtDisrupt_x_myCmdArtReliance",
    direction: "oppDisruptsMy",
    rationale: "Artifact hate vs artifact-focused commander.",
    oppVector: { family: "artifacts", vector: "disruption", zone: "mainboard" },
    myVector: { family: "artifacts", vector: "reliance", zone: "commandZone" },
    semanticDefinition: "opp MB artifact disruption × my CMD artifact reliance",
  },
  {
    termKey: "d2_oppBoardReset_x_myMbTokenReliance",
    direction: "oppDisruptsMy",
    rationale: "Board wipe vs go-wide token plan.",
    oppVector: { family: "tokens", vector: "disruption", zone: "mainboard" },
    myVector: { family: "tokens", vector: "reliance", zone: "mainboard" },
    semanticDefinition: "opp MB token/board-reset disruption × my MB token reliance",
  },
  {
    termKey: "d2_oppBoardReset_x_myCmdTokenReliance",
    direction: "oppDisruptsMy",
    rationale: "Board wipe vs commander token engine.",
    oppVector: { family: "tokens", vector: "disruption", zone: "mainboard" },
    myVector: { family: "tokens", vector: "reliance", zone: "commandZone" },
    semanticDefinition: "opp MB board reset × my CMD token reliance",
  },
  {
    termKey: "d2_oppSearchDenial_x_myMbTutorReliance",
    direction: "oppDisruptsMy",
    rationale: "Search denial vs tutor-heavy plan.",
    oppVector: { family: "library_search", vector: "disruption", zone: "mainboard" },
    myVector: { family: "library_search", vector: "reliance", zone: "mainboard" },
    semanticDefinition: "opp MB search denial × my MB tutor reliance",
  },
  {
    termKey: "d2_oppStackDisrupt_x_myMbSpellReliance",
    direction: "oppDisruptsMy",
    rationale: "Countermagic vs instant/sorcery chain plan.",
    oppVector: { family: "spells_stack", vector: "disruption", zone: "mainboard" },
    myVector: { family: "spells_stack", vector: "reliance", zone: "mainboard" },
    semanticDefinition: "opp MB stack disruption × my MB spell reliance",
  },
  {
    termKey: "d2_oppStackDisrupt_x_myCmdSpellReliance",
    direction: "oppDisruptsMy",
    rationale: "Countermagic vs commander spell engine.",
    oppVector: { family: "spells_stack", vector: "disruption", zone: "mainboard" },
    myVector: { family: "spells_stack", vector: "reliance", zone: "commandZone" },
    semanticDefinition: "opp MB stack disruption × my CMD spell reliance",
  },
  {
    termKey: "d2_oppActDenial_x_myMbActReliance",
    direction: "oppDisruptsMy",
    rationale: "Null Rod effects vs activated ability engines.",
    oppVector: { family: "activated_abilities", vector: "disruption", zone: "mainboard" },
    myVector: { family: "activated_abilities", vector: "reliance", zone: "mainboard" },
    semanticDefinition: "opp MB activated denial × my MB activated reliance",
  },
  {
    termKey: "d2_oppActDenial_x_myCmdActReliance",
    direction: "oppDisruptsMy",
    rationale: "Ability shutdown vs commander activated engine.",
    oppVector: { family: "activated_abilities", vector: "disruption", zone: "mainboard" },
    myVector: { family: "activated_abilities", vector: "reliance", zone: "commandZone" },
    semanticDefinition: "opp MB activated denial × my CMD activated reliance",
  },
  {
    termKey: "d2_oppCreatureRem_x_myMbCreatureReliance",
    direction: "oppDisruptsMy",
    rationale: "Removal vs creature-centric plan.",
    oppVector: { family: "creatures", vector: "disruption", zone: "mainboard" },
    myVector: { family: "creatures", vector: "reliance", zone: "mainboard" },
    semanticDefinition: "opp MB creature removal × my MB creature reliance",
  },
  {
    termKey: "d2_myMbArtDisrupt_x_oppMbArtReliance",
    direction: "myDisruptsOpp",
    rationale: "My artifact answers vs opponent artifact plan.",
    oppVector: { family: "artifacts", vector: "reliance", zone: "mainboard" },
    myVector: { family: "artifacts", vector: "disruption", zone: "mainboard" },
    semanticDefinition: "my MB artifact disruption × opp MB artifact reliance",
  },
  {
    termKey: "d2_myMbStackDisrupt_x_oppMbSpellReliance",
    direction: "myDisruptsOpp",
    rationale: "My counters vs opponent spell chain.",
    oppVector: { family: "spells_stack", vector: "reliance", zone: "mainboard" },
    myVector: { family: "spells_stack", vector: "disruption", zone: "mainboard" },
    semanticDefinition: "my MB stack disruption × opp MB spell reliance",
  },
  {
    termKey: "d2_myMbGyDisrupt_x_oppMbGyReliance",
    direction: "myDisruptsOpp",
    rationale: "My graveyard hate vs opponent graveyard plan.",
    oppVector: { family: "graveyard", vector: "reliance", zone: "mainboard" },
    myVector: { family: "graveyard", vector: "disruption", zone: "mainboard" },
    semanticDefinition: "my MB graveyard disruption × opp MB graveyard reliance",
  },
];

export function matchupOntologyMetadata() {
  return {
    version: MATCHUP_ONTOLOGY_V2_1_VERSION,
    pairingCount: MATCHUP_PAIRINGS_V2_1.length,
    policy: "Explicit semantic pairings only — no blind Cartesian product.",
  };
}

export function allMatchupTermKeys(): string[] {
  return MATCHUP_PAIRINGS_V2_1.map((p) => p.termKey);
}

export function zonePrefix(zone: MatchupZoneBlock): "mb" | "cmd" {
  return zone === "mainboard" ? "mb" : "cmd";
}

export function profileKey(
  zone: MatchupZoneBlock,
  family: string,
  vector: string,
): string {
  return `ipv2_1_${zonePrefix(zone)}_${family}_${vector}`;
}
