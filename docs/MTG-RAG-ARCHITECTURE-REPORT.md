# MTG RAG — Existing Architecture Report

**Date:** 2026-07-31  
**Status:** Inspection only — no RAG implementation started  
**Active GCP project:** `trading-card-buyback-dev`  
**Staging:** https://cardscanner9000.com (Cloud Run `buyback-web-staging`, rev 00305+)

---

## Executive summary

The app already has a strong **deterministic MTG data layer** (Scryfall catalog, golden-table inventory enrichment, EDHREC commander meta, store clerk with inventory tools + verifier). It has **no RAG infrastructure today**: no embedding service, no vector indexes, no knowledge chunk collections, and no hybrid retrieval pipeline.

The provided datasets (500 glossary terms, 30 color/faction records, 75 Commander primers, Comprehensive Rules, YouTube transcripts) are **greenfield** relative to the codebase. They must be kept **strictly separate** from `inventory` and `catalogCards`.

---

## 1. Firebase / GCP project

| Item | Value | Evidence |
|------|--------|----------|
| Firebase project | `trading-card-buyback-dev` | `.firebaserc`, deploy scripts |
| Region | `us-central1` | `scripts/deploy-web-staging-cloudbuild.ps1` |
| Primary web runtime | Cloud Run (`buyback-web-staging`) | Next.js 15 app in `web/` |
| Other services | `grading-service-staging`, `order-processing-job`, PriceCharting daily job | `scripts/deploy-*.ps1` |
| Default Storage bucket | `{project}.firebasestorage.app` | `scripts/cloud-run-web-env.yaml` |
| Archive bucket | `trading-card-buyback-dev-pricecharting` | `scripts/deploy-pricecharting-daily-job.ps1` |
| Secrets | GCP Secret Manager (`OPENAI_API_KEY`, etc.) | deploy scripts mount secrets on Cloud Run |
| Firestore mode | **Standard** (assumed) | No Enterprise / vector index config anywhere in repo |

**Firestore Enterprise:** Not referenced. Native text search and some advanced features require Enterprise; plan assumes **Standard + Firestore vector indexes** (supported on Standard as of vector search GA).

---

## 2. Firestore collections (actual names)

Defined in `web/src/lib/firebase/collections.ts`. Accessed via `web/src/lib/storage/data-store.ts` and `web/src/lib/deck-builder/deck-builder-store.ts`.

### Operational / golden data (do not mix with RAG)

| Collection | Purpose |
|------------|---------|
| `inventory` | Store sell-side rows: qty, `listPrice`, TCGplayer IDs, **golden-table** Scryfall fields (`catalogOracleText`, `catalogKeywords`, `catalogOracleTags`, `catalogColorIdentity`, …) |
| `catalogCards` | Canonical Scryfall card records (UUID-keyed) |
| `cardCrosswalk` | `inventoryItemId` ↔ `scryfallId` |
| `edhrecCommanderMeta` | EDHREC commander profiles + card recommendations |
| `storeDecks` | Saved deck lists |
| `cards` | Buyback scan records (per order) |
| `stores`, `storeSettings`, `storeRules` | Multi-tenant store config |
| `orders`, `customers`, `transactions` | Buyback workflow |
| `inventoryImportSnapshots` | TCGplayer import audit |

### Price warehouse (separate domain)

| Collection | Purpose |
|------------|---------|
| `pricecharting_products_current` | PriceCharting catalog |
| `card_price_snapshots` | Historical snapshots |
| `pricecharting_import_runs`, `pricecharting_daily_reports` | Import telemetry |

### RAG collections today

**None.** No `mtgKnowledgeSources`, `mtgKnowledgeChunks`, or similar.

---

## 3. Cloud Storage usage today

| Path pattern | Content |
|--------------|---------|
| `orders/{orderId}/{cardId}/…` | Buyback scan images |
| `stores/{storeId}/inventory/{itemId}/cover.*` | Cached inventory images |
| `stores/{storeId}/events/…` | Event flyers |
| `raw/{date}/*.csv` (pricecharting bucket) | PriceCharting CSV archives |

**No `mtg-rag/` prefix exists yet.** Recommended per brief:

```
gs://{bucket}/mtg-rag/raw/curated/glossary/…
gs://{bucket}/mtg-rag/raw/curated/colors/…
gs://{bucket}/mtg-rag/raw/curated/commander/…
gs://{bucket}/mtg-rag/raw/rules/mtg-comprehensive-rules.txt
gs://{bucket}/mtg-rag/raw/transcripts/*.txt
```

---

## 4. Embeddings / vector search

| Capability | Status |
|------------|--------|
| Embedding API calls | **Not implemented** |
| Firestore `VectorValue` fields | **Not used** |
| Vector indexes in `firestore.indexes.json` | **None** (only composite indexes on `orders`, `cards`) |
| Vertex AI Vector Search | **Not integrated** |

Repo-wide search for `embedding`, `findNearest`, `VectorValue`, `vector` in application code: **no matches**.

---

## 5. Current assistant / clerk architecture

Public endpoint: `POST /api/store/[slug]/inventory/clerk` (`maxDuration = 300`).

```
StoreClerkChat (UI)
  → routeClerkIntent (OpenAI JSON + heuristics)
  → runClerkTools
       • inventory_search → browseStoreInventory (Firestore inventory + filters)
       • card_catalog → catalogCards + live Scryfall
       • loadMagicInventoryMatchPool (full magic inventory for EDHREC matching)
  → runMtgCommanderSpecialist | runPokemonCompetitiveSpecialist
  → verifyClerkAnswer (grounding, legality, constraints)
  → formatClerkResponse
```

**Inventory lookup is deterministic** — in-memory filter over Firestore `inventory` rows, not semantic search over stock.

**“Semantic” clerk queries today** use golden-table fields (`catalogKeywords`, `catalogOracleTags`, `catalogOracleText`) via `store-inventory-semantic.ts` and `clerk-query-parser.ts` — structured filters, not embeddings.

**Knowledge today** lives in TypeScript modules under:
- `web/src/lib/store-inventory/knowledge/`
- `web/src/lib/card-flow-v2/knowledge/`
- `web/src/lib/deck-builder/knowledge/`

These are static prompts/personas, not retrievable corpora.

---

## 6. Golden table (operational card facts)

**Purpose:** Answer “what is this card?”, “is it in stock?”, “what’s the price?” without RAG.

| Layer | Mechanism |
|-------|-----------|
| Import | TCGplayer CSV → `inventory.listPrice`, qty, condition |
| Enrichment | `inventory-catalog-enrichment.ts` → Scryfall match → writes golden fields + `catalogCards` + `cardCrosswalk` |
| Oracle tags | Scryfall Tagger bulk → `catalogOracleTags` |
| Browse/clerk | Reads `item.listPrice`, `catalogColorIdentity`, semantic filters |

**Backfill:** `web/scripts/backfill-inventory-catalog.ts`, admin route `POST /api/admin/inventory/enrich-catalog`.

This layer must remain authoritative for **stock, price, printing, condition, quantity**.

---

## 7. External canonical sources (already integrated)

| Source | Use | Module |
|--------|-----|--------|
| Scryfall | Oracle text, legality, images, bulk catalog | `scryfall-client.ts`, `scryfall-catalog.ts`, `scryfall-bulk.ts` |
| EDHREC | Commander popularity, recommendations | `edhrec-client.ts`, `sync-edhrec.ts` |
| OpenAI | Vision, routing, generation, verifier | `openai-json.ts`, clerk agents |
| PriceCharting | Sports/non-MTG pricing warehouse | `prices/` |

**Important:** EDHREC commander meta in Firestore overlaps conceptually with the new **75 Commander primers** corpus, but serves a different role (live popularity + card lists vs. curated strategy prose). Both can coexist with clear authority tiers.

---

## 8. Provided RAG source packages (inspected)

User-supplied files in `Downloads/`:

| Package | Records | Canonical ingest format | Notes |
|---------|---------|-------------------------|-------|
| Glossary | 500 | `mtg_rag_glossary_500.jsonl` (+ CSV/SQLite) | One record/chunk; rich `aliases`, `rag_text`, `normalized_term` |
| Color/faction | 30 | `mtg_color_faction_30` (CSV/xlsx) | Alias forms (Jeskai, BUG, WU, …) |
| Commander primers | 75 | Markdown per commander (+ CSV index) | Needs ~4 chunks/commander per brief |
| Comprehensive Rules | 1 file (~953 KB) | `mtg-comprehensive-rules.txt` | **Near 1 MiB Firestore doc limit** — must chunk; store raw in GCS |
| YouTube transcripts | ~11 `.txt` files | Raw transcript text | Community education tier only |

Manifest + validation JSON accompany glossary and color packages. Glossary README documents hybrid retrieval (exact → FTS → vector), aligned with the brief.

---

## 9. Gap analysis vs. target architecture

| Brief requirement | Current state |
|-------------------|---------------|
| Separate RAG collections | ❌ Not started |
| GCS raw file storage | ❌ No `mtg-rag/` tree |
| Chunking pipeline | ❌ No `scripts/mtg-rag/` |
| Embeddings + vector index | ❌ Not started |
| Query router (`MtgQueryIntent`) | ⚠️ Partial — clerk router covers inventory/deck/recommendation, not terminology/rules/corpus routing |
| Exact alias index | ⚠️ Partial — clerk parser has some phrases; no glossary/color alias store |
| Hybrid retrieval | ❌ Only golden-table keyword/tag filters |
| Authority hierarchy | ⚠️ Partial — clerk verifier checks inventory grounding; no rules/transcript tier enforcement |
| Evaluation suite (75+ cases) | ❌ Not started |
| Idempotent ingestion | ⚠️ Pattern exists for PriceCharting/TCGplayer imports; not for knowledge |

---

## 10. Recommended integration points (when implementing)

1. **New Firestore collections** (per brief):  
   `mtgKnowledgeSources`, `mtgKnowledgeChunks`, `mtgKnowledgeAliases`, `mtgKnowledgeIngestionRuns`, `mtgKnowledgeEvaluations`

2. **New GCS prefix:** `mtg-rag/raw/…` for immutable originals

3. **Clerk extension:** Add `knowledge_retrieval` tool to `clerk-tools/index.ts` called only when router intent ∈ `{terminology, color, rules, commander_strategy, deckbuilding_education}` — never for `inventory_lookup` / `price_lookup`

4. **Router split:** Extend `clerk-router.ts` or add parallel `mtg-query-router.ts` with the brief’s `MtgQueryIntent` enum; keep inventory paths on existing deterministic tools

5. **Verifier extension:** Reuse `clerk-verifier/` patterns for rules/transcript authority checks

6. **Do not modify:** `inventory`, `catalogCards` schema for RAG text; do not embed inventory rows

---

## 11. Risks and constraints

1. **Comprehensive Rules size:** ~953 KB raw — must never be one Firestore document; rule-aware chunking required.
2. **Firestore 1 MiB doc limit:** Chunk target 300–800 tokens; exclude `text`/`embedding` from unnecessary single-field indexes.
3. **Embedding model lock-in:** Pick one model (e.g. `text-embedding-3-small` @ 1536 dims); record on every chunk; re-embed all on change.
4. **EDHREC vs. primers:** Commander strategy should prefer curated primers + inventory for in-stock picks; EDHREC for popularity/card names.
5. **Transcript authority:** `usingoracle.txt` / `usingscryfall.txt` explain tools — must not override live Oracle/Scryfall.
6. **Deck build latency:** Current clerk deck path is slow (full inventory pool + EDHREC + sequential catalog lookups); RAG must not add unbounded retrieval to that hot path without budgets.

---

## 12. Definition-of-done mapping (brief checklist)

| Item | Status |
|------|--------|
| Existing architecture inspected and documented | ✅ This report |
| Golden inventory/card collections left intact | ✅ No changes made |
| Raw files in Cloud Storage | ⬜ Not started |
| Source metadata in Firestore | ⬜ Not started |
| Curated datasets imported | ⬜ Not started |
| Comprehensive Rules parsed by rule number | ⬜ Not started |
| Transcripts cleaned/chunked | ⬜ Not started |
| Chunks have authority metadata + citations | ⬜ Not started |
| Embeddings + vector indexes | ⬜ Not started |
| Exact aliases before vector search | ⬜ Not started |
| Query router to correct corpus | ⬜ Not started |
| Inventory always deterministic | ✅ Already true; must preserve |
| Rules answers cite rule numbers | ⬜ Not started |
| Answer verifier blocks unsupported claims | ⚠️ Partial (inventory/clerk verifier exists) |
| Idempotent ingestion | ⬜ Not started |
| Evaluation + smoke tests pass | ⬜ Not started |

---

## 13. Suggested next steps (ordered)

1. Copy source files to repo staging area or upload to `gs://…/mtg-rag/raw/` via ingest script.
2. Scaffold `web/scripts/mtg-rag/` with `inspect`, `ingest`, per-source chunkers, `validate`, `smokeTest`.
3. Add Firestore collection constants + types; deploy vector indexes (2–3 to start).
4. Implement glossary + color alias exact-match layer first (highest ROI, no vector needed for “mana dork”, “BUG”, “Jeskai”).
5. Add rules chunker + transcript chunker; embed; smoke-test retrieval.
6. Wire clerk router + knowledge tool behind feature flag.
7. Build 75-case evaluation JSON; gate deploy on smoke tests.

---

*Generated from repository inspection and review of user-supplied MTG RAG datasets. No production data or secrets were modified.*
