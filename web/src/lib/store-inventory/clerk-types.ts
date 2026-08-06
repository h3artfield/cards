import type {
  StoreInventoryCard,
  StoreInventoryColorFilter,
  StoreInventoryGameFilter,
  StoreInventoryTypeFilter,
} from "../deck-builder/store-inventory-browse";
import type { StoreInventorySemanticFilter } from "../deck-builder/store-inventory-semantic";

export type ClerkGame =
  | "magic"
  | "pokemon"
  | "yugioh"
  | "lorcana"
  | "flesh_and_blood"
  | "riftbound"
  | "one_piece"
  | "warhammer"
  | "sports"
  | "unknown";

export type ClerkIntent =
  | "inventory_lookup"
  | "price_check"
  | "build_deck"
  | "deck_analysis"
  | "recommendation"
  | "substitution"
  | "rules_legality"
  | "general_chat";

export type ClerkFormat =
  | "commander"
  | "standard"
  | "modern"
  | "pioneer"
  | "pauper"
  | "legacy"
  | "expanded"
  | "limited"
  | "unknown";

export type ClerkAgentId =
  | "mtg_commander"
  | "mtg_competitive"
  | "pokemon_competitive"
  | "lorcana"
  | "general";

export type ClerkToolId =
  | "inventory_search"
  | "card_catalog"
  | "format_legality"
  | "deck_validator"
  | "price_lookup"
  | "knowledge_retrieval";

export interface ClerkRouterEntities {
  card_names: string[];
  commander?: string;
  featured_card?: string;
  archetype?: string;
  deck_list?: string[];
}

export interface ClerkRouterConstraints {
  budget?: number;
  inventory_only: boolean;
  max_price?: number;
  tournament_date?: string | null;
}

export interface ClerkRouterResult {
  game: ClerkGame;
  format: ClerkFormat;
  intent: ClerkIntent;
  entities: ClerkRouterEntities;
  constraints: ClerkRouterConstraints;
  required_agents: ClerkAgentId[];
  required_tools: ClerkToolId[];
  clarification_needed: boolean;
  clarification_question?: string;
  confidence: number;
}

export interface InventorySearchParams {
  q?: string;
  game?: StoreInventoryGameFilter;
  color?: StoreInventoryColorFilter;
  cardType?: StoreInventoryTypeFilter;
  maxPrice?: number;
  semantic?: StoreInventorySemanticFilter;
  semanticOnly?: boolean;
  limit?: number;
  priceSort?: "asc" | "desc";
}

export interface InventorySearchResult {
  items: StoreInventoryCard[];
  total: number;
  query: InventorySearchParams;
  identityTrace?: import("../inventory/catalog-link-identity").InventoryIdentityExclusionTrace;
}

export interface CardCatalogHit {
  scryfallId: string;
  oracleId?: string;
  name: string;
  setName?: string;
  colorIdentity: string[];
  typeLine?: string;
  /** Legal in Commander format — not sole-commander eligibility. */
  commanderFormatLegal?: boolean;
  /** Sole commander eligibility — from oracle classification only. */
  canBeSoleCommander?: boolean;
  imageNormal?: string;
}

export interface SpecialistRecommendation {
  card_name: string;
  scryfallId?: string;
  oracleId?: string;
  inventoryItemId?: string;
  qty?: number;
  price?: number;
  reason: string;
  imageProxyUrl?: string;
  colorIdentity?: string[];
}

export interface SpecialistResponse {
  direct_answer: string;
  recommendations: SpecialistRecommendation[];
  inventory_queries: Array<{ card_name: string; quantity_needed: number }>;
  missing_information: string[];
  warnings: string[];
  confidence: number;
  deckList?: ClerkDeckList;
  /** Locked commander Oracle ID for this response (deck builds). */
  commanderOracleId?: string;
  resolvedRequestId?: string;
}

export interface ClerkDeckCard {
  slot: string;
  name: string;
  qty: number;
  category:
    | "pokemon"
    | "trainer"
    | "energy"
    | "commander"
    | "land"
    | "ramp"
    | "draw"
    | "interaction"
    | "protection"
    | "synergy"
    | "finisher"
    | "other";
  oracleId?: string;
  scryfallId?: string;
  inventoryItemId?: string;
  imageUrl?: string;
  imageProxyUrl?: string;
  listPrice?: number;
  lineTotal?: number;
  inStock: boolean;
  substituteNote?: string;
}

export interface ClerkDeckList {
  game: "pokemon" | "magic";
  format: string;
  /** Display title — derived from oracle canonical name. */
  archetype: string;
  /** Authoritative commander identity for the entire deck build. */
  commanderOracleId?: string;
  commanderCanonicalName?: string;
  commanderColorIdentity?: string[];
  strategy: string;
  totalCards: number;
  targetCards: number;
  inStockCards: number;
  deckTotal: number;
  budget?: number;
  withinBudget: boolean;
  lines: ClerkDeckCard[];
  missingSlots: string[];
  /** True when commander + 99 maindeck validated and fully in stock. */
  complete?: boolean;
  mainDeckCount?: number;
  validationIssues?: string[];
  /** Present while a staged deck build is in progress or just completed. */
  buildProgress?: {
    stageIndex: number;
    stageLabel: string;
    totalStages: number;
    building: boolean;
  };
}

export interface ClerkOrchestratorContext {
  storeId: string;
  storeSlug: string;
  storeName: string;
  user_question: string;
  conversation_summary: string;
  currentFilters?: {
    game?: StoreInventoryGameFilter;
    color?: StoreInventoryColorFilter;
    cardType?: StoreInventoryTypeFilter;
    q?: string;
  };
}

export interface ClerkVerifierCheckDetail {
  score: number;
  passed: boolean;
  reason?: string;
  warnings?: string[];
}

export interface ClerkVerificationSummary {
  status: "pass" | "revise" | "block" | "soft_block";
  overall_score: number;
  revision_attempts: number;
  hard_failures: string[];
  warnings: string[];
}
