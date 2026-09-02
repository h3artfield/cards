/** TopDeck.gg API v2 types — derived tournament data only. */

export type TopdeckBulkRequest = {
  TID?: string | string[];
  game?: string;
  format?: string;
  start?: number;
  end?: number;
  last?: number;
  participantMin?: number;
  participantMax?: number;
  columns?: string[];
  rounds?: boolean | string[];
  tables?: string[];
  players?: string[];
};

export type TopdeckDeckObj = {
  Commanders?: Record<string, number | { count?: number; qty?: number }>;
  Mainboard?: Record<string, number | { count?: number; qty?: number }>;
  Sideboard?: Record<string, number | { count?: number; qty?: number }>;
};

export type TopdeckStandingRow = {
  name?: string;
  id?: string;
  decklist?: string | null;
  deckObj?: TopdeckDeckObj | null;
  wins?: number;
  draws?: number;
  losses?: number;
  winRate?: number;
};

export type TopdeckTablePlayer = {
  name?: string;
  id?: string;
  decklist?: string | null;
  deckObj?: TopdeckDeckObj | null;
};

export type TopdeckTable = {
  table?: number | string;
  players?: TopdeckTablePlayer[];
  winner?: string | null;
  winner_id?: string | null;
  winner_games?: number | null;
  loser_games?: number | null;
  status?: string;
  match?: string;
};

export type TopdeckRound = {
  round?: number | string;
  tables?: TopdeckTable[];
};

export type TopdeckTournament = {
  TID?: string;
  tournamentName?: string;
  swissNum?: number;
  startDate?: number;
  game?: string;
  format?: string;
  topCut?: number;
  standings?: TopdeckStandingRow[];
  rounds?: TopdeckRound[];
};

export const TOPDECK_BULK_EDH_REQUEST: TopdeckBulkRequest = {
  game: "Magic: The Gathering",
  format: "EDH",
  columns: ["name", "id", "decklist", "wins", "draws", "losses", "winRate"],
  rounds: true,
  tables: ["table", "players", "winner", "status"],
  players: ["name", "id", "decklist"],
};

export const TOPDECK_ATTRIBUTION =
  "Tournament data provided by TopDeck.gg — https://topdeck.gg";
