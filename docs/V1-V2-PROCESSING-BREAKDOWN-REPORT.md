# V1/V2 Processing Breakdown Report

**Purpose:** Pre-merge decision document for moving to V2-primary pricing and reliable order processing.  
**Environment reference:** Staging (`buyback-web-staging`) as of 2026-07-06, all V2 flags + `CARD_FLOW_V2_OFFER_INFLUENCE=true`.  
**Author:** Engineering analysis from codebase + Firestore snapshot.

---

## Executive summary

- **Today:** Every submitted card runs the **full V1 pipeline**, then **full V2 pipeline**, then **V1 full analysis** again — sequentially per card, inside a **Next.js `after()` background task on Cloud Run**.
- **Production pricing:** V2 wins when `applyV2OfferInfluenceToCard()` passes guards (`pricingJson.source = "v2_offer_influence"`). Otherwise V1 values remain.
- **Timing:** Per-phase timers are **not instrumented**. Wall-clock order duration is the only real metric today.
- **Reliability:** Cloud Run + `after()` is **not safe** for 15–60 minute jobs. BB-000013 died on card 1; BB-000012 took **~58 minutes** for 4 cards when it succeeded.
- **Recommendation:** **Cloud Run Job per order** + **V2-primary submit path** (drop duplicate V1 pricing/comps on submit; keep V1 analysis artifacts async or clerk-triggered).

---

## 1. Current full processing sequence

### Entry points

| Trigger | File | What runs |
|---------|------|-----------|
| Customer submit | `web/src/app/api/orders/[id]/submit/route.ts` | Sets order `processing`, schedules `after(() => processOrderSubmission())` |
| Background worker | `web/src/lib/processing/process-order-submission.ts` | Loads order/cards/settings/rules → `processOrderCards()` |
| Per order | `web/src/lib/processing/process-order.ts` → `processOrderCards()` | **Sequential** loop over cards |
| Per card | `processOrderCards()` | `onCardProcessing` hook → `processCard()` → `enrichWithFullAnalysis()` → `onCardComplete` hook |
| Order finalize | `process-order-submission.ts` | `resolveOrderStatus()` → save order → `handleOrderReadyForReviewTransition()` (customer email) → `notifyOwner()` on first submit |
| Admin list repair | `web/src/lib/processing/repair-stuck-order.ts` | If all cards done but order still `processing`, finalize + email |

### Per-card call graph (single card)

```
processOrderCards (SEQUENTIAL cards)
├── onCardProcessing → saveCard(status: "processing")
├── processCard
│   ├── [PARALLEL START] runCardFlowV2WithRetry (up to 2 attempts)
│   │   ├── runCardEvidenceV2 (SEQUENTIAL)
│   │   │   ├── runCategoryClassifierAgent → OpenAI
│   │   │   ├── runImageEvidenceAgent → OpenAI
│   │   │   └── refinePokemonFoilEvidence (pokemon) → OpenAI
│   │   ├── runCardIdentityV2 (SEQUENTIAL, if identity flag)
│   │   │   ├── generateCatalogCandidates → Scryfall / Pokémon TCG API / etc.
│   │   │   ├── scoreSuspectsDeterministic (CPU)
│   │   │   ├── runVisionSuspectMatcher (conditional) → OpenAI
│   │   │   ├── category inspectors (conditional, 0–1 OpenAI each):
│   │   │   │   mtg foil/frame/list, pokemon reverse, sports prizm, ygo edition
│   │   │   └── runIdentityLockGate (CPU)
│   │   └── runCardMarketV2 (SEQUENTIAL per snapshot, if market flag)
│   │       ├── locked identity: 1× buildCandidateMarketSnapshot
│   │       └── unlocked: up to MARKET_MAX_SUSPECTS (3) × buildCandidateMarketSnapshot in parallel
│   │           └── fetchMarketCompsForPlan → eBay sold (N queries), eBay active, PriceCharting, TCGPlayer, Scryfall
│   │
│   ├── [SEQUENTIAL V1] analyzeCardImages → OpenAI gpt-4o (front + back high detail)
│   ├── enrichSportsCardIdentity (sports only) → OpenAI gpt-4o
│   ├── enrichCardFromSlabLabel (slab only) → OpenAI
│   ├── lookupMarketPrice → resolveMarketPrice
│   │   ├── lookupCatalogPrice → Pokémon TCG / Scryfall / YGO API
│   │   ├── [PARALLEL] fetchPriceChartingComps + fetchEbayComps
│   │   └── mergeCompSources (CPU)
│   ├── applyVisionPricingLayer (may call estimateMarketPriceFromVision → OpenAI)
│   ├── applyStoreRules, applyConditionPricing, buildConditionLadder (CPU)
│   ├── status decision (CPU): processed | manual_review | do_not_buy
│   ├── [AWAIT PARALLEL] v2Promise
│   ├── applyStaffConfirmationPreservation (if enabled)
│   ├── runCardAuditV2 (CPU, if audit flag)
│   ├── runCardOfferPreviewV2 (CPU, if preview flag)
│   ├── stampCardFlowV2Bundles (CPU)
│   ├── applySportsVisionToCard (CPU)
│   └── applyV2OfferInfluenceToCard (CPU — may overwrite production fields)
│
└── enrichWithFullAnalysis → runFullCardAnalysis (SEQUENTIAL)
    ├── verifyCardIdentity → OpenAI
    ├── refreshCardMarketData → duplicate catalog + PC + eBay path
    ├── syncCardIdentityFromCatalog (conditional)
    ├── [PARALLEL] gradeCardCondition (grading service HTTP) + fetchSalesComps (usually from pricingJson)
    ├── analyzeCardResale → OpenAI
    ├── reconcileCardAssessment (CPU)
    └── statusFromBuybackReport (may override status from resaleAnalysis)
├── onCardComplete → saveCard(final card state)
```

### Parallelism summary

| Parallel | Where |
|----------|--------|
| V2 bundle ∥ V1 vision start | `v2Promise` started before `analyzeCardImages`, awaited after V1 pricing |
| PC + eBay in V1 pricing | `Promise.all([fetchPriceChartingComps, fetchEbayComps])` |
| V2 suspect snapshots | `Promise.all` up to 3 `buildCandidateMarketSnapshot` |
| Condition + sales comps | `Promise.all([gradeCardCondition, fetchSalesComps])` in full analysis |
| **Not parallel** | Cards in an order (strict `for` loop) |

---

## 2. Per-card timing (last 5 completed orders)

**Important:** The codebase does **not** persist phase timings (`v1VisionMs`, `v2MarketMs`, etc.). Section 2 uses **wall-clock order duration** from Firestore timestamps only.

| Order | Cards | Submitted → Reviewed | Wall-clock | ~Per card | V2 influence | Notes |
|-------|-------|----------------------|------------|-----------|--------------|-------|
| BB-000012 | 4 | 2026-07-05 20:53 → 21:51 UTC | **58 min** | **~14.6 min** | 4/4 cards | Recent staging order; all V2 influence applied |
| BB-000009 | 4 | 2026-07-03 19:03 → 23:41 UTC | **~4h 38m** | ~69 min* | 2/4 cards | *Includes likely idle/stuck time, not pure compute |
| BB-000011 | 1 | 2026-07-03 19:48 → 19:51 UTC | **2.5 min** | **2.5 min** | 0/1 | V1 multi_source only |
| BB-V2-REGRESSION | 2 | (no submit timestamps) | — | — | 0/2 | Test order; no full analysis |
| BB-000005 | 8 | 2026-07-02 04:30 → 18:39 UTC | **~14h** | — | 1/8 | Clearly stuck/reprocessed; not representative |

### Estimated phase breakdown (code-based, not measured)

For a typical Pokémon raw card on staging (4 cards like BB-000012):

| Phase | Est. time | Confidence |
|-------|-----------|------------|
| V2 evidence | 15–40s | Medium (2–3 OpenAI calls) |
| V2 identity | 10–60s | Medium (catalog + optional matcher/inspectors) |
| V2 market (1 snapshot) | 30–90s | High (eBay N queries + PC + TCGPlayer) |
| V1 vision | 10–25s | Medium |
| V1 pricing | 20–60s | High (duplicate eBay + PC vs V2) |
| V2 audit + preview | 1–5s | High (CPU) |
| V1 full analysis | 30–90s | High (identity verify OpenAI + grading service + resale OpenAI + refresh pricing) |
| **Total per card** | **~2–6 min compute** | Observed ~14 min/card suggests queueing, retries, cold starts, duplicate work |

**Action required before merge:** Add structured timing spans to Firestore or Cloud Logging (`card.processingTimings`) on every `processCard` / `runFullCardAnalysis` exit.

---

## 3. API / model calls per card (typical Pokémon raw, staging flags)

### OpenAI (approximate)

| Call site | Model | When |
|-----------|-------|------|
| V1 `analyzeCardImages` | gpt-4o | Every card |
| V1 `enrichSportsCardIdentity` | gpt-4o | Sports only |
| V1 `enrichCardFromSlabLabel` | gpt-4o | Slab only |
| V1 `estimateMarketPriceFromVision` | gpt-4o | Slab/low comp edge cases |
| V1 `verifyCardIdentity` | gpt-4o | Full analysis, every card |
| V1 `analyzeCardResale` | gpt-4o | Full analysis, every card |
| V2 category classifier | gpt-4o-mini (default) | Every card |
| V2 image evidence | gpt-4o-mini | Every card |
| V2 pokemon foil refine | gpt-4o-mini | Pokémon |
| V2 vision suspect matcher | gpt-4o-mini | When deterministic scores ambiguous |
| V2 category inspectors | gpt-4o-mini | MTG/Pokemon/Sports/YGO traps (0–1 each) |

**Typical total:** **6–12 OpenAI calls per card** (Pokémon), **8–15** for MTG/sports with inspectors.

### External APIs

| Source | V1 path | V2 path | Duplicated? |
|--------|---------|---------|-------------|
| **eBay** | `fetchEbayComps` in `resolveMarketPrice` | `fetchEbaySoldByQueriesWithHealth` + active sanity in `market-fetchers` | **Yes** |
| **PriceCharting** | `fetchPriceChartingComps` in V1 pricing + possible legacy in `fetchSalesComps` | `fetchPriceChartingComps` in V2 market | **Yes** |
| **TCGplayer** (via Pokémon TCG API) | `lookupCatalogPrice` | `lookupCatalogPrice` in V2 market fetcher | **Yes** |
| **Scryfall** | `lookupScryfall` / catalog | `buildScryfallPrintPriceComps` in V2 MTG | Partial overlap |
| **Pokémon TCG API** | catalog pricing | catalog candidates | Partial overlap |
| **Grading service** | `gradeCardCondition` → Cloud Run OpenCV service | — | V1 only |

### Retries / timeouts

| Location | Behavior |
|----------|----------|
| `runCardFlowV2WithRetry` | 2 attempts, empty bundle on failure |
| `enrichWithFullAnalysis` | 2 attempts on full analysis |
| PriceCharting HTTP | `AbortSignal.timeout(15_000)` |
| eBay HTTP | 15–20s timeouts |
| Sports enrich / vision estimate | 45s timeout |
| V2 OpenAI (`openai-json.ts`) | **No explicit timeout** |
| V1 vision / verification / resale | **No explicit timeout** |
| Cloud Run service | **300s request timeout** (submit returns immediately; background `after()` not guaranteed) |

---

## 4. Production field ownership

### Who writes what (on submit processing)

| Field | Primary writer | Notes |
|-------|----------------|-------|
| `marketPrice` | V1 `applyConditionPricing` → **overwritten by V2** if influence applies | Final = V2 preview when eligible |
| `cashOffer` | Same | Store rule `do_not_buy` → 0 before influence |
| `tradeOffer` | Same | Same |
| `status` | V1 rules + `needsManualReview` → **overwritten by V2** influence + **again by** `statusFromBuybackReport` in full analysis | Last writer in pipeline wins |
| `pricingJson` | V1 `resolveMarketPrice` → merged; source set to `v2_offer_influence` on influence | Keeps V1 comp metadata + V2 audit fields |
| `conditionLadder` | V1 `buildConditionLadder` | Not updated by V2 influence |
| `resaleAnalysis` | V1 `analyzeCardResale` | Runs **after** V2 influence; can change status via `statusFromBuybackReport` |
| `identityVerification` | V1 full analysis | |
| `conditionReport` | V1 grading service | |
| `salesComps` | V1 `fetchSalesComps` (usually derived from V1 `pricingJson.comps`) | |
| `cardFlowV2*` | V2 pipeline | Shadow bundles + preview; influence reads preview only |

### V2 influence overwrite (`apply-v2-offer-influence.ts`)

**Requires flag:** `CARD_FLOW_V2_OFFER_INFLUENCE=true` and full preview chain enabled.

**Hard blockers (never influence):**
- `source_disagreement`
- `identity_not_locked_or_confirmed`
- `no_market_data`

**Additional guards:**
- Preview must be `enabled` with `previewMarketValue` and cash or trade offer
- `identityBasis` must be `staff_confirmed` **or** `vision_locked`
- `variant_uncertainty` blocker unless resolved by staff confirmation or vision lock
- Soft blockers also block: `sports_parallel_uncertainty`, `raw_graded_uncertainty`, `high_value_requires_stronger_evidence`, `manual_review_required`
- Staff decision `no` → `do_not_buy`; `yes` → `approved`
- Zero offers → `do_not_buy`
- Preview actions `staff_review_required` / `manual_price_required` → `manual_review`

**On apply:** Sets `pricingJson.source = "v2_offer_influence"`, stores `v2PreviousProduction` snapshot.

---

## 5. V1 dependency report

What still **requires** V1 outputs today:

| V1 output | Still required? | Used by |
|-----------|-----------------|---------|
| **V1 vision (`visionJson`)** | **Yes** | V1 pricing, rules, full analysis identity, sports fields; V2 runs separate evidence path |
| **Condition grade (`conditionReport`)** | **Yes (admin)** | `CardBuybackReportPanel` context, resale analysis prompt, condition override UI, grading service |
| **Condition ladder** | **Partial** | Admin ladder table when V2 not shown; offer editing fallback via `offersFromLadder` |
| **Buyback report (`resaleAnalysis`)** | **Partial** | Admin `CardBuybackReportPanel`; clerk default Yes/No when no staff decision; stale warnings suppressed when V2 ready |
| **Sales comps** | **Partial** | Resale analysis input; admin comps display; often duplicated from V1 pricing comps |
| **Status decision** | **Mixed** | V2 influence sets status; V1 rules set initial; `statusFromBuybackReport` can override after full analysis; store rules via `evaluateClerkStoreRules` |
| **Store rule pass/fail** | **Yes** | `evaluateClerkStoreRules`, clerk red/green ring, running total |
| **Customer-facing output** | **Minimal** | Customer sees thank-you + email only; **no** pricing/cards on submit |
| **Admin/clerk UI** | **Yes** | Running total uses production `marketPrice/cashOffer`; V2 mobile review card; buyback report; condition panel; V2 evidence/audit/preview panels |

**Key insight:** V2 can own **pricing numbers**, but clerks still rely on V1 **condition**, **buyback narrative**, and **identity verification** artifacts unless rebuilt on V2.

---

## 6. Failure / stuck-order report

| Topic | Current behavior |
|-------|------------------|
| **`processing` status set** | `submit/route.ts` sets order `processing`; `onCardProcessing` sets card `processing` |
| **Progress / heartbeat** | Admin progress bar reads card statuses (`pending`/`processing` vs done); **no worker heartbeat field** |
| **Worker dies mid-flight** | Order stays `processing`; one card may stay `processing`, rest `pending` (BB-000013) |
| **Retry on submit** | `RETRYABLE_STATUSES` includes `processing` — customer can resubmit, may duplicate work |
| **Auto-repair** | `repairStuckProcessingOrder` on admin **list load** only: if no cards `pending`/`processing`, finalizes order + sends ready email |
| **Admin reprocess** | `PATCH action: reprocess` re-runs full `processOrderCards` for all cards |
| **Idempotent?** | **No** — partial saves, duplicate OpenAI/eBay calls, email guarded by `orderNotifications.readyForReviewEmail` |
| **Resume half-processed card** | **No resume logic** — must re-run `processCard` from scratch; cards already `processed` are not skipped in loop |

### Safe resume (not implemented)

Recommended: skip cards where `status ∉ {pending, processing}` and only process incomplete cards; add `processingAttemptId` + `processingStartedAt` on order.

---

## 7. Proposed V2-primary submit path

Goal: **Order ready for clerk review in <2 min/card** without losing safety.

### Remove from submit-blocking path

| Component | Recommendation | Rationale |
|-----------|----------------|-----------|
| V1 `lookupMarketPrice` / `resolveMarketPrice` | **Remove on submit** when V2 influence enabled | Duplicate of V2 market; V2 wins production anyway when eligible |
| V1 `fetchEbayComps` + V1 PC in pricing | **Remove** | V2 `market-fetchers` already calls same APIs |
| V1 full analysis on submit | **Defer async** (Job phase 2 or clerk-open trigger) | Biggest latency after pricing; not needed for customer email |
| V1 `analyzeCardResale` | **Defer** | Clerk can use V2 preview + audit first |
| V1 `verifyCardIdentity` | **Defer or merge into V2 identity** | Redundant with V2 identity lock |
| V1 `refreshCardMarketData` in full analysis | **Remove** if V2-primary | Triple-fetch |
| Duplicate `fetchSalesComps` | **Remove on submit** | Derive from V2 comps or defer |
| V2 audit + preview on submit | **Keep (CPU-only)** | Required for influence guards |
| V2 market | **Keep (required for pricing)** | Single comp fetch path |
| V1 vision | **Keep short-term** OR replace with V2 evidence for rules | Store rules still read V1 vision today — migrate rules to V2 identity first |
| Condition ladder on submit | **Defer** | Admin can show V2 offer; ladder from preview math |
| Store rules | **Keep** | Apply against V2 identity + preview market value |

### Minimal V2-primary submit pipeline (target)

```
1. V2 evidence → identity → market → audit → offer preview
2. applyV2OfferInfluence (production fields)
3. evaluateClerkStoreRules (status override)
4. Save card → next card
5. Finalize order + email
--- async job (non-blocking) ---
6. V1 condition grade + resale report (optional)
```

---

## 8. Recommended worker architecture

### Options compared

| Approach | Pros | Cons |
|----------|------|------|
| **Cloud Tasks per card** | Fine-grained retries, parallel cards | Order completion detection harder; email dedup; 4× concurrent API blast |
| **Cloud Run Job per order** | Matches sequential card loop; one email at end; 60+ min timeout; idempotent order handler | Whole order retries on failure unless card-level skip added |
| **Pub/Sub worker** | Scalable | More infra; same completion/dedup problems as Tasks |

### Recommendation: **Cloud Run Job per order**

**Why:**
- Cards already processed **sequentially** in code
- Order-level status transition + **single ready email** is natural
- Jobs support **long timeouts** (30–60 min) vs unreliable `after()`
- Matches existing `deploy-pricecharting-daily-job.ps1` pattern
- Submit API becomes: enqueue job + return thank-you (fast)

**Implementation sketch:**
1. `POST /api/orders/[id]/submit` → write `processingJobId`, invoke Job with `{ orderId }`
2. Job runs `processOrderSubmission` with card-level skip + timings
3. Scheduler optional: scan stuck `processing` orders >10 min → re-enqueue

---

## 9. Field ownership: before vs after (V2-primary)

| Field | Today (after full pipeline) | V2-primary target |
|-------|----------------------------|-------------------|
| `marketPrice` | V2 influence if eligible, else V1 | **V2 preview → influence** (primary) |
| `cashOffer` / `tradeOffer` | Same | **V2 preview** from store percentages |
| `status` | V1 rules → V2 influence → buyback report | **Store rules + V2 preview action**; defer buyback report override |
| `pricingJson.source` | `v2_offer_influence` or V1 source | **`v2_offer_influence`** or `v2_market_only` |
| `pricingJson.comps` | V1 comp merge | **V2 market snapshot comps** |
| `resaleAnalysis` | V1 OpenAI | **Async** — populated after submit |
| `conditionReport` | Grading service | **Async** or on clerk expand |
| `conditionLadder` | V1 build | **Generated from V2 market + settings** or async |
| `identityVerification` | V1 verify | **Optional async**; clerk uses V2 identity |
| `cardFlowV2*` | Full bundles | **Same** — source of truth for clerk UI |

---

## 10. Safety plan

| Risk | Mitigation |
|------|------------|
| **Duplicate customer emails** | Keep `orderNotifications.readyForReviewEmail` + `shouldTransitionTriggerReadyEmail(processing → under_review)` only; Job must not re-send if already sent |
| **Duplicate processing** | Order `processingLock` / `processingJobId`; skip cards not in `{pending, processing}`; idempotent Job execution |
| **Stuck cards** | `processingStartedAt` on card; cron/scheduler re-enqueues orders with no progress > N minutes |
| **Timeout** | Job timeout 3600s; per-source caps (PC 15s, eBay 20s, OpenAI 60s) added to all fetch paths |
| **Max cards per order** | Enforce at submit (e.g. 50) to cap Job cost |
| **Worker death** | Job retry with card-level checkpoint (status + `lastCompletedStep`) |
| **Partial V2 influence** | Log `v2InfluenceApplied` per card; admin shows V1 fallback reason from `influenceBlockReason` |
| **Owner email** | Keep `notifyOwner` once on first successful finalize only |

---

## Appendix: Staging feature flags (deploy script)

```
CARD_FLOW_V2_EVIDENCE_ENABLED=true
CARD_FLOW_V2_IDENTITY_ENABLED=true
CARD_FLOW_V2_MARKET_ENABLED=true
CARD_FLOW_V2_AUDIT_ENABLED=true
CARD_FLOW_V2_STAFF_CONFIRMATION_ENABLED=true
CARD_FLOW_V2_OFFER_PREVIEW_ENABLED=true
CARD_FLOW_V2_OFFER_INFLUENCE=true
CARD_FLOW_V2_MARKET_ENABLE_EBAY=true
CARD_FLOW_V2_MARKET_ENABLE_PRICECHARTING=true
CARD_FLOW_V2_MARKET_ENABLE_TCGPLAYER=true
CARD_FLOW_V2_MARKET_MAX_SUSPECTS=3
```

---

## Appendix: Instrumentation gap (blocking for merge metrics)

Add to `ScannedCard` or order subdoc:

```typescript
processingTimings?: {
  v1VisionMs?: number;
  v1PricingMs?: number;
  v1FullAnalysisMs?: number;
  v2EvidenceMs?: number;
  v2IdentityMs?: number;
  v2MarketMs?: number;
  v2AuditPreviewMs?: number;
  totalMs?: number;
  completedAt?: string;
};
```

Without this, per-phase SLA tracking is estimate-only.
