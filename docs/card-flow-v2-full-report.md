# Card Flow V2 — Full System Report

**Version:** 2026-07-03  
**Audience:** Store managers, staff trainers, and developers  
**Staging:** https://buyback-web-staging-rrogeqxyea-uc.a.run.app (`buyback-web-staging-00090-mzm`)

---

## 1. Executive Summary

**Card Flow V2** is not meant to blindly auto-price cards. It is an **evidence-first, staff-assisted** card identification and pricing support system.

| V1 (production today) | V2 (shadow layer) |
|----------------------|-------------------|
| Identifies and prices quickly | Narrows likely versions, shows evidence |
| Writes `marketPrice`, `cashOffer`, `tradeOffer` | Prepares **shadow** market snapshots and offer preview |
| Single best guess | Multiple **suspects** with prepared market data |
| Staff overrides via manual review | Staff **confirms exact printing** when uncertain |

V2 runs **alongside** V1. It stores all output in nested fields (`cardFlowV2*`) and **does not change customer-facing offers** unless a future guarded-influence directive explicitly enables that (not enabled today).

**Key principle:** When variant identity is uncertain, V2 shows staff the likely versions instead of silently picking one.

---

## 2. Current Status (Staging)

| Capability | Status |
|------------|--------|
| V2 evidence | ✅ Enabled |
| V2 identity | ✅ Enabled |
| V2 market | ✅ Enabled |
| V2 audit | ✅ Enabled |
| V2 staff confirmation | ✅ Enabled |
| V2 offer preview | ✅ Enabled |
| Offer influence | ❌ **Not enabled — no flag exists** |
| Mode | Shadow / staff-assist only |

**Latest staging revision:** `buyback-web-staging-00090-mzm`  
**Cloud Build ID:** `62fd2082-3c28-4cd9-8efa-31da58fbc0b3`

---

## 3. Full Pipeline Overview

```
Customer uploads card images
        ↓
Image Evidence Agent          ← What is visible in the photo?
        ↓
Category Classifier           ← Pokémon, MTG, sports, Riftbound, etc.
        ↓
Category Knowledge Guide      ← Variant traps, lock rules, staff tips
        ↓
Catalog Candidate Generator   ← Build likely suspects (not one guess)
        ↓
Suspect Scoring               ← Match evidence to each suspect
        ↓
Optional Vision Suspect Matcher ← Disambiguate close suspects
        ↓
Identity Lock Gate            ← Lock only when evidence is strong enough
        ↓
Candidate Market Snapshots    ← Pre-fetch market data per suspect
        ↓
Staff Confirmation (optional) ← Staff picks exact printing
        ↓
Staff-Confirmed Market Promotion ← Promote prepared snapshot (no refetch)
        ↓
Source Health / Market Analysis
        ↓
Offer Preview (shadow only)     ← cardFlowV2OfferPreview
        ↓
Audit                         ← Compare V1 vs V2, track blockers
```

### Step-by-step

1. **Image Evidence Agent** — Extracts visible fields (name, set, number, foil, slab label). Reports missing evidence and whether auto-lock is safe.
2. **Category Classifier** — Fast model assigns category (Pokémon, MTG, Yu-Gi-Oh, sports, Riftbound, One Piece, Lorcana, unknown).
3. **Knowledge Guide** — Category-specific rules for variant traps and lock requirements.
4. **Catalog Candidates** — Searches catalogs/fixtures and returns **suspects** (e.g. Grusha normal vs reverse holo).
5. **Suspect Scoring** — Scores each suspect against evidence; flags variant risks.
6. **Vision Suspect Matcher** — Optional second pass when top suspects are too close.
7. **Identity Lock Gate** — Locks identity only when score gap and required evidence are satisfied.
8. **Market Snapshots** — For each suspect, runs search plans, fetches comps/signals, records source health.
9. **Staff Confirmation** — Staff selects suspect; system promotes matching snapshot.
10. **Offer Preview** — Shadow cash/trade preview using store rules; **never writes production fields**.
11. **Audit** — Rollup of agreement, blockers, risk, staff-confirmed coverage.

---

## 4. Image Evidence Agent

**Purpose:** Inspect customer photos and extract **observable evidence only** — not final pricing.

**Outputs (`cardFlowV2Evidence`):**

- Image usability (excellent → unusable)
- Evidence slots (card name, set, collector number, foil, slab grade, etc.)
- `identificationMode`: safe_to_continue | continue_with_variant_uncertainty | candidate_list_only | manual_review | request_rescan
- Missing critical evidence list
- Staff and customer messages

**Examples of problems detected:**

| Problem | Effect |
|---------|--------|
| Glare on collector number | Number marked unknown — cannot lock |
| Foil pattern not visible | Finish uncertain — separate suspects kept |
| Slab label unreadable | Graded context blocked |
| Multiple cards in frame | manual_review |
| Blur / cut-off | Continue if partial evidence visible |

V2 **does not reject** imperfect photos if useful evidence remains visible.

---

## 5. Category Classifier

Assigns one primary category with confidence and alternates:

- Pokémon, MTG, Yu-Gi-Oh, Sports, Riftbound, One Piece, Lorcana, Unknown

Uses a fast vision-capable model (`gpt-4o-mini` class). Low confidence → `unknown` or `possibleCategories` list.

---

## 6. Knowledge Guides

Guides define **what to look for** and **what traps to avoid**. Viewable in admin at **`/admin/v2/knowledge`**.

| Category | Guide quality | Notes |
|----------|---------------|-------|
| Pokémon | Complete (inline + image rules) | Reverse holo pattern vs solid |
| MTG | Complete module | Set code + collector # + finish |
| Yu-Gi-Oh | Partial | Set code critical |
| Sports | Partial | Parallel + raw/graded separation |
| Riftbound | Complete module | Collector suffix, overnumbered, signature |
| One Piece | Generic | Catalog placeholder |
| Lorcana | Generic | Catalog placeholder |
| Unknown | Generic | Fallback when category unclear |

Each guide includes: important regions, key fields, variant traps, lock requirements, staff tips.

---

## 7. Catalog Candidate Generation

**V2 does not just pick one card. It creates likely suspects.**

| Example | Suspects generated |
|---------|-------------------|
| Grusha | normal + reverse holo (same #184) |
| MTG She-Hulk | foil + nonfoil printings |
| Sports CJ Stroud | base vs silver parallel |
| Riftbound Ahri | base vs 30a alt-art vs #303 overnumbered vs #303* signature |

Catalog sources: legacy helpers (Pokémon/MTG/Scryfall), sports checklists, Riftbound local fixtures (until official API).

---

## 8. Suspect Matching and Identity Lock

**Deterministic scoring** per suspect:

- Supporting evidence
- Contradicting evidence
- Missing evidence
- Variant risks

**Lock gate thresholds:**

- Top score ≥ 0.90 with gap ≥ 0.12 → may lock
- Close suspects or unresolved variants → `not_locked_variant_uncertainty`
- Missing required fields → `not_locked_missing_required_evidence`
- Slab mismatch → `manual_review_recommended`

**Why V2 refuses to lock:** Variant-critical evidence missing (finish, parallel, signature status). Better to show staff a short list than lock the wrong printing.

---

## 9. Candidate Market Snapshots

**Before staff confirms, V2 prepares market snapshots for likely suspects.**

Staff should **not wait** after picking the correct card — values are already prepared.

Each snapshot includes:

| Field | Meaning |
|-------|---------|
| `mode` | candidate_market_comparison or staff_confirmed_identity_market |
| `acceptedComps` | Sold comps that match search plan |
| `maybeComps` | Active listings (sanity only) |
| `rejectedComps` | Wrong variant/finish/grade |
| `pricingSignals` | TCGplayer / PriceCharting shadow values |
| `sourceHealth` | Per-source attempt status, errors, counts |

---

## 10. Staff Confirmation

1. Staff chooses correct suspect in admin UI.
2. Fingerprint saved for reprocess rematch.
3. Matching prepared snapshot **promoted** (no full refetch).
4. `variantUncertaintyStatus` may update to `resolved_by_staff_confirmation`.
5. Survives **shadow reprocess** via preservation module.

**Grusha example (validated on staging):**

- Staff confirmed `pokemon_tcg:sv2-184:reverse_holo`
- Shadow reprocess: preservation `preserved`
- Reverse holo did **not** revert to normal
- V2 preview ~$0.125 shadow median; production offers unchanged

---

## 11. Source Health

**Important:** No accepted sold comps ≠ no market value.

| Source | Current staging behavior |
|--------|-------------------------|
| eBay sold | Attempted — **403 authorization** (all cards) |
| eBay active | Sanity check only — not sold value |
| TCGplayer | Pricing signal when mapped |
| PriceCharting | Pricing signal + tier selection |

Source health fields: attempted, http status, raw count, accepted, maybe, rejected, pricing signals, fatal error, summary label.

---

## 12. Market Value Decision

**Source confidence policy:**

- TCGplayer + PriceCharting must agree within **25%** to blend
- High value guards: $25 / $100 / $250 thresholds
- Sports parallel uncertainty blocks without staff confirm
- Slab raw tier mismatch blocks preview

| Card | Result |
|------|--------|
| Grusha (staff-confirmed reverse holo) | TCG $0.13 + PC $0.12 → blend ~$0.125 ✅ |
| Morgan | TCG $49.93 vs PC $18.48 → **source disagreement** ❌ |
| CJ Stroud | Active only + sports parallel → **blocked** ❌ |

---

## 13. Offer Preview

- Calculates preview market / cash / trade using **same store rules as V1**
- Stored **only** under `cardFlowV2OfferPreview`
- **Never** writes `marketPrice`, `cashOffer`, `tradeOffer`, `status`
- UI label: **"V2 Offer Preview — Shadow Only"**
- No `CARD_FLOW_V2_OFFER_INFLUENCE` flag

Recommended actions include: `staff_confirmed_preview_ready`, `staff_review_required`, `identity_confirmation_required`, `insufficient_market_data`.

---

## 14. Audit System

Audit compares V1 production pricing vs V2 shadow preview:

- Identity basis (vision_locked, staff_confirmed, unlocked, no_candidates)
- Agreement counts (matches_current, v2_higher, source_disagreement, etc.)
- Risk levels
- Staff confirmation coverage toward 10/10/5/5 targets
- Variant resolved vs unresolved
- Source health batch rollup

Command: `npm run card-flow-v2:audit -- --limit 50`

---

## 15. Shadow-Only Reprocess

**Problem:** Full V1 reprocess can change production offers (e.g. Grusha cash $0.25 → $1.00 in 006D).

**Solution:**

```bash
npm run card-flow-v2:reprocess-shadow-audit-set
```

- Recomputes all V2 nested fields
- **Does not** invoke V1 offer recalculation
- **Mutation guard:** fails if `marketPrice`, `cashOffer`, `tradeOffer`, or `status` change

⚠️ Do **not** use `card-flow-v2:reprocess-audit-set` for audit validation — it runs full V1.

---

## 16. Staff Confirmation Queue

**Admin URL:** `/admin/v2/staff-confirmation`

Shows cards blocked on identity confirmation:

- Card image, category, V1 value
- Top V2 suspects with match scores
- Pricing signal counts
- Missing evidence
- Link to order page to confirm

**Purpose:** Build ground-truth staff-confirmed examples toward validation targets.

Staff-confirmed cards (e.g. Grusha) **do not** appear in queue after preservation.

---

## 17. Riftbound System

**Core rule:** Same card name ≠ same market product.

| Variant | Detection |
|---------|-----------|
| Alternate art | Collector suffix `a` |
| Overnumbered | # above set total (OGN = 298, #299+) |
| Signature Overnumbered | Asterisk in collector # |
| Ultimate | Rarity + staff review |
| OGS | No foil versions |

**Key files:**

- `knowledge/riftbound.ts`
- `catalogs/riftbound-catalog-adapter.ts`
- `riftbound-candidate-generator.ts`
- `riftbound-suspect-scoring.ts`
- `market/riftbound-comp-rules.ts`
- `offer/riftbound-preview-policy.ts`

Catalog: local fixtures today; official gallery / TCGplayer / PriceCharting integration planned.

---

## 18. Current Known Limitations

1. eBay sold Marketplace Insights — **403** on all staging attempts
2. Most cards still require staff confirmation
3. Staff-confirmed coverage small (1 Pokémon, 1 sports vs 10/10/5/5 target)
4. Sports pricing difficult without sold comps
5. Slab exact grade pricing needs stronger sources
6. Riftbound catalog is fixture-based until API integration
7. One Piece / Lorcana catalog placeholders

---

## 19. Next Validation Goal

| Category | Target | Current (approx) |
|----------|--------|------------------|
| Pokémon staff-confirmed | 10 | 1 |
| MTG staff-confirmed | 10 | 0 |
| Sports reviewed/blocked | 5 | 1 |
| Slabs reviewed/blocked | 5 | 0 |

**Not required for 006F deploy** — this is the next milestone before guarded offer influence.

Use `/admin/v2/staff-confirmation` and confirm only when evidence is clear.

---

## 20. Future Directive 007 Criteria

Do **not** enable offer influence until:

- [ ] Sufficient staff-confirmed coverage across categories
- [ ] Preview values stable and explainable
- [ ] Source disagreement properly blocked
- [ ] Production mutation guard trusted
- [ ] Staff confirmation survives reprocess (Grusha path proven)
- [ ] Offer preview agrees with accepted pricing signals where eligible

---

## Commands

```bash
npm run test:card-flow-v2              # Evidence tests
npm run test:card-flow-v2-identity
npm run test:card-flow-v2-market
npm run test:card-flow-v2-audit
npm run test:card-flow-v2-offer-preview
npm run test:riftbound-knowledge
npm run test:shadow-v2-reprocess
npm run test:staff-confirmation-preservation
npm run card-flow-v2:regression       # Full regression suite
npm run card-flow-v2:audit -- --limit 50
npm run card-flow-v2:reprocess-shadow-audit-set   # Safe reprocess
npm run card-flow-v2:reprocess-audit-set          # ⚠️ Mutates V1 offers
npm run card-flow-v2:market-probe
npm run card-flow-v2:seed-regression-cards
```

Deploy staging (canonical):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\deploy-web-staging-cloudbuild.ps1
```

---

## Feature Flags

```env
CARD_FLOW_V2_EVIDENCE_ENABLED=true
CARD_FLOW_V2_IDENTITY_ENABLED=true
CARD_FLOW_V2_MARKET_ENABLED=true
CARD_FLOW_V2_AUDIT_ENABLED=true
CARD_FLOW_V2_STAFF_CONFIRMATION_ENABLED=true
CARD_FLOW_V2_OFFER_PREVIEW_ENABLED=true
# CARD_FLOW_V2_OFFER_INFLUENCE — does not exist
```

---

## Implementation File Map

```
web/src/lib/card-flow-v2/
  types.ts                          Core V2 types
  run-card-flow-v2.ts               Orchestrator
  run-card-evidence-v2.ts           Evidence pipeline
  run-card-identity-v2.ts           Identity pipeline
  image-evidence-agent.ts             Image evidence LLM
  category-classifier-agent.ts        Category classifier
  detective-guides.ts                 Guide registry
  knowledge/
    mtg.ts                            MTG guide + image rules
    pokemon.ts                        Pokémon image rules
    riftbound.ts                      Riftbound full knowledge
  knowledge-viewer-data.ts            Admin knowledge viewer data
  catalog-candidates.ts               Candidate generation
  catalogs/riftbound-catalog-adapter.ts
  suspect-matcher.ts                  Deterministic scoring
  vision-suspect-matcher.ts           Vision disambiguation
  identity-lock-gate.ts               Lock decisions
  staff-suspect-selection.ts          Staff confirm UI data
  staff-confirmation-preservation.ts  Reprocess preservation
  staff-confirmation-queue.ts         Admin queue builder
  variant-uncertainty.ts              Variant resolution after staff
  shadow-v2-reprocess.ts              Safe shadow reprocess + guard
  riftbound-candidate-generator.ts
  riftbound-suspect-scoring.ts
  market/
    run-card-market-v2.ts
    search-plan-builder.ts
    comp-matcher.ts
    source-health.ts
    promote-staff-confirmed-market.ts
    riftbound-comp-rules.ts
  offer/
    run-card-offer-preview-v2.ts
    market-value-decision.ts
    v2-offer-preview.ts
    source-confidence-policy.ts
    riftbound-preview-policy.ts
  audit/
    run-card-audit-v2.ts
    audit-summary.ts
  feature-flag.ts

web/src/app/admin/v2/
  staff-confirmation/page.tsx         Staff confirmation queue
  knowledge/page.tsx                  Knowledge base viewer

web/src/components/
  CardFlowV2EvidencePanel.tsx
  CardFlowV2SuspectPicker.tsx
  CardFlowV2OfferPreviewPanel.tsx
  CardFlowV2AuditPanel.tsx

web/scripts/
  card-flow-v2-audit.ts
  card-flow-v2-regression.ts
  reprocess-shadow-audit-set.ts
  test-riftbound-knowledge.ts
  test-shadow-v2-reprocess.ts
  validate-directive-006f-revised.ts

docs/
  card-flow-v2-full-report.md         This document
  card-flow-v2-full-report.json         Machine-readable summary
```

---

## Admin Pages Summary

| Page | URL | Purpose |
|------|-----|---------|
| Staff Confirmation Queue | `/admin/v2/staff-confirmation` | Cards needing identity confirm |
| V2 Card Knowledge Base | `/admin/v2/knowledge` | View category guides for staff training |

---

*V2 remains shadow/staff-assist only. Production offers are owned by V1 until a future guarded-influence directive explicitly changes that policy.*
