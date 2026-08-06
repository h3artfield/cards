export type CardCategory =
  | "pokemon"
  | "yugioh"
  | "mtg"
  | "sports"
  | "riftbound"
  | "onepiece"
  | "lorcana"
  | "unknown";

export type DetectedSide =
  | "front"
  | "back"
  | "slab_front"
  | "slab_back"
  | "unknown";

export type ImageUsability =
  | "excellent"
  | "good"
  | "limited"
  | "poor"
  | "unusable";

export type IdentificationMode =
  | "safe_to_continue"
  | "continue_with_variant_uncertainty"
  | "candidate_list_only"
  | "manual_review"
  | "request_rescan";

export type EvidenceStatus =
  | "observed"
  | "inferred"
  | "unknown"
  | "contradicted"
  | "not_applicable";

export type EvidenceSource =
  | "front_image"
  | "back_image"
  | "slab_label"
  | "ocr"
  | "catalog_match"
  | "market_title"
  | "staff_input";

export type VisualProblem =
  | "blur"
  | "glare"
  | "cut_off"
  | "too_dark"
  | "too_bright"
  | "angled"
  | "multiple_cards"
  | "low_resolution"
  | "sleeve_reflection"
  | "slab_label_unreadable";

export type EvidenceSlot = {
  field: string;
  value: string | null;
  status: EvidenceStatus;
  confidence: number;
  source: EvidenceSource;
  note?: string;
};

export type ImageEvidenceReport = {
  imageUsability: ImageUsability;
  canAttemptIdentification: boolean;
  canAutoLockIdentity: boolean;

  detectedCardCount: number;
  detectedSides: DetectedSide[];

  visualProblems: VisualProblem[];

  extractedText: string[];
  evidenceSlots: EvidenceSlot[];

  missingCriticalEvidence: string[];

  identificationMode: IdentificationMode;

  staffMessage: string;
  customerMessage?: string;
};

export type CategoryClassificationReport = {
  category: CardCategory;
  confidence: number;
  evidence: string[];
  detectedSides: DetectedSide[];
  needsHigherVision: boolean;
  possibleCategories?: Array<{
    category: CardCategory;
    confidence: number;
    reason: string;
  }>;
};

export type CategoryDetectiveGuide = {
  category: CardCategory;
  importantRegions: string[];
  keyFields: string[];
  variantTraps: string[];
  lockRequirements: string[];
  staffTips: string[];
  /** Safe lookup string when name-only search is insufficient. */
  identificationFormula?: string;
  /** Catalog/API tools for suspect generation (e.g. Scryfall). */
  catalogSources?: string[];
  /** Observational market research — shadow audit / staff context only. */
  marketResearchNotes?: string[];
};

/** Full Phase 1 diagnostic bundle saved on the card record. */
export type CardFlowV2EvidenceBundle = {
  ranAt: string;
  imageEvidence: ImageEvidenceReport;
  categoryClassification: CategoryClassificationReport;
  detectiveGuide: CategoryDetectiveGuide;
  /** Guide-driven follow-up questions planned or answered after pass 1. */
  detectiveQuestions?: import("./detective-question-planner").DetectiveQuestion[];
  versionMetadata?: import("./version-metadata").CardFlowV2VersionMetadata;
};

export type CardEvidenceInput = {
  frontImageUrl: string;
  backImageUrl?: string;
  declaredItemType?: string;
};

export type CatalogSource =
  | "scryfall"
  | "pokemon_tcg"
  | "ygoprodeck"
  | "riftbound_official"
  | "sports_checklist"
  | "pricecharting"
  | "local_catalog"
  | "scan_derived_fallback"
  | "unknown";

/** Verified TCGplayer Japan catalog row attached to scan-derived suspects. */
export type TcgplayerJapanProductMeta = {
  productId: string;
  productName: string;
  productLineName: string;
  setName?: string;
  setCode?: string;
  cardNumber?: string;
  marketPrice?: number;
  lowestPrice?: number;
  medianPrice?: number;
  productUrl: string;
  imageUrl: string;
  resolutionSource: "tcgplayer_search" | "pricecharting_tcg_id" | "direct_product_id";
};

/** Scan-derived fallback metadata stored on CardSuspect.rawCatalogData. */
export type ScanDerivedSuspectMeta = {
  identitySource: "scan_derived_fallback";
  catalogVerified: false;
  catalogSource: null;
  displayName?: string;
  nativeName?: string;
  pricingStatus:
    | "manual_price_required"
    | "market_data_missing"
    | "pricecharting_exact"
    | "tcgplayer_japan_exact";
  priceChartingProduct?: Record<string, unknown>;
  tcgplayerJapanProduct?: TcgplayerJapanProductMeta;
};

export type CardSuspect = {
  suspectId: string;
  category: CardCategory;

  label: string;
  canonicalName?: string;

  catalogSource: CatalogSource;
  catalogId?: string;

  setName?: string;
  setCode?: string;
  cardNumber?: string;
  collectorNumber?: string;

  language?: string;
  rarity?: string;
  finish?: string;
  edition?: string;

  variantTags: string[];

  gradingCompany?: string;
  grade?: string;

  expectedEvidence: EvidenceSlot[];

  referenceImageUrls?: string[];

  rawCatalogData?: unknown;
};

export type SuspectAssessment = {
  suspectId: string;

  matchScore: number;

  canConfirm: boolean;
  canEliminate: boolean;

  supportingEvidence: string[];
  contradictingEvidence: string[];
  missingEvidence: string[];

  variantRisks: string[];

  reasoning: string;
};

export type IdentityLockStatus =
  | "locked"
  | "not_locked_variant_uncertainty"
  | "not_locked_low_confidence"
  | "not_locked_missing_required_evidence"
  | "not_locked_no_candidates"
  | "manual_review_recommended";

export type LockedCardIdentity = {
  locked: boolean;
  lockStatus: IdentityLockStatus;

  confidence: number;

  category: CardCategory;

  canonicalName?: string;
  marketProductName?: string;

  catalogSource?: CatalogSource;
  catalogId?: string;

  setName?: string;
  setCode?: string;
  cardNumber?: string;
  collectorNumber?: string;

  language?: string;
  rarity?: string;
  finish?: string;
  edition?: string;

  variantTags: string[];

  gradingCompany?: string;
  grade?: string;
  certNumber?: string;

  requiredEvidenceSatisfied: boolean;

  missingRequiredEvidence: string[];
  unresolvedVariantRisks: string[];

  winningSuspectId?: string;

  staffMessage: string;
};

export type V2StaffSuspectSelection = {
  suspectId: string;
  confirmedAt: string;
  confirmedBy?: string;
  notes?: string;
  /** Stable identity fields for rematch after reprocess. */
  fingerprint?: import("./staff-confirmation-preservation").StaffConfirmedSuspectFingerprint;
  /** Image URLs at time of confirmation — used for image-change safety. */
  confirmedImageUrls?: { front: string; back?: string };
};

export type VariantUncertaintyStatus =
  | "unresolved"
  | "resolved_by_staff_confirmation"
  | "resolved_by_vision_lock"
  | "still_requires_review";

export type CardCandidateBundle = {
  category: CardCategory;

  suspects: CardSuspect[];

  suspectAssessments: SuspectAssessment[];

  lockedIdentity: LockedCardIdentity;

  /** Staff-confirmed printing when auto-lock did not run. */
  staffSelection?: V2StaffSuspectSelection;

  /** Result of last staff-confirmation preservation across reprocess. */
  staffConfirmationPreservation?: import("./staff-confirmation-preservation").StaffConfirmationPreservationRecord;

  /** Current variant uncertainty for offer preview — staff confirm can resolve. */
  variantUncertaintyStatus?: VariantUncertaintyStatus;

  /** Pre-staff-confirmation variant risks preserved for audit history. */
  historicalVariantUncertainty?: string[];

  candidateGenerationNotes: string[];

  createdAt: string;

  /** MTG The List micro-vision result when origin-ref trap candidates exist. */
  mtgListMarkInspection?: MtgListMarkInspection;

  /** MTG foil vs nonfoil micro-vision when both finishes exist for same printing. */
  mtgFoilWashInspection?: MtgFoilWashInspection;

  /** Pokémon reverse pattern micro-vision (Master Ball / Poké Ball / standard). */
  pokemonReversePatternInspection?: PokemonReversePatternInspection;

  /** MTG frame treatment micro-vision (borderless / showcase / regular). */
  mtgFrameTreatmentInspection?: MtgFrameTreatmentInspection;

  /** Yu-Gi-Oh edition micro-vision (1st vs Unlimited). */
  ygoEditionInspection?: YgoEditionInspection;

  /** Sports Prizm back-stamp micro-vision (base vs parallel). */
  sportsPrizmStampInspection?: SportsPrizmStampInspection;

  versionMetadata?: import("./version-metadata").CardFlowV2VersionMetadata;
};

export type MtgListMarkInspection = {
  attempted: boolean;
  listMarkVisible: "yes" | "no" | "unknown";
  confidence: number;
  cropQuality: "clear" | "usable" | "poor" | "blocked" | "unknown";
  inspectedRegions: string[];
  evidenceNotes: string[];
  /** Human-readable summary for staff picker. */
  staffSummary?: string;
};

export type MtgFoilWashInspection = {
  attempted: boolean;
  /** Broad prismatic/rainbow wash on art or frame — not stamp-only shine. */
  foilWashVisible: "yes" | "no" | "unknown";
  /** Shine confined to bottom security stamp — supports nonfoil rare. */
  stampOnlyShine: "yes" | "no" | "unknown";
  confidence: number;
  cropQuality: "clear" | "usable" | "poor" | "blocked" | "unknown";
  inspectedRegions: string[];
  evidenceNotes: string[];
  staffSummary?: string;
};

export type PokemonReversePatternInspection = {
  attempted: boolean;
  reversePattern:
    | "none"
    | "standard_reverse"
    | "poke_ball"
    | "master_ball"
    | "unknown";
  confidence: number;
  cropQuality: "clear" | "usable" | "poor" | "blocked" | "unknown";
  inspectedRegions: string[];
  evidenceNotes: string[];
  staffSummary?: string;
};

export type MtgFrameTreatmentInspection = {
  attempted: boolean;
  frameTreatment: "borderless" | "showcase" | "extended" | "regular" | "unknown";
  confidence: number;
  cropQuality: "clear" | "usable" | "poor" | "blocked" | "unknown";
  inspectedRegions: string[];
  evidenceNotes: string[];
  staffSummary?: string;
};

export type YgoEditionInspection = {
  attempted: boolean;
  edition: "first" | "unlimited" | "unknown";
  holoStampColor: string;
  confidence: number;
  cropQuality: "clear" | "usable" | "poor" | "blocked" | "unknown";
  inspectedRegions: string[];
  evidenceNotes: string[];
  staffSummary?: string;
};

export type SportsPrizmStampInspection = {
  attempted: boolean;
  prizmStampVisible: "yes" | "no" | "unknown";
  confidence: number;
  cropQuality: "clear" | "usable" | "poor" | "blocked" | "unknown";
  inspectedRegions: string[];
  evidenceNotes: string[];
  staffSummary?: string;
};
