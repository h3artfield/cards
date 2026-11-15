# Professor V4.6 — Collaborative Deck Assembly Acceptance Report

**Decision:** `PROFESSOR_V4_6_COLLABORATIVE_DECK_ASSEMBLY_AND_CHECKPOINT_COUNCIL_V1_AUTHORIZED`  
**Status:** Initial collaboration loop demonstrated — **REPORT AND WAIT** (no final grading / 100-card optimization)

---

## What Was Implemented

### 1. Shared card pool (`ProfessorCouncilStateV46`)

Extended V4.5 council state with first-class deck construction:

- `selectedCards[]`, `candidatePool[]`, `rejectedCards[]`
- `cardDecisions[]`, `replacementHistory[]`
- `snapshots[]`, `checkpointsCompleted[]`, `assemblyRevision`
- `bracketBuildPolicy` (build constraint, not a label)

Each card carries identity, origin, roles, commander dependence, verification flags, and status (`PROPOSED` → `SELECTED` / `CORE` / `CUT_CANDIDATE` / `REJECTED`).

**Primary file:** `web/src/lib/deck-synthesis/professor-council-assembly-v4-6-v1.ts`

### 2. Incremental assembly (not one-shot 99)

- **Initial batch:** ~12 structural cards scored against Deck Charter (engine, interaction, protection, harmony)
- **Research batches:** `appendResearchBatchV46()` adds 3–5 cards per tree advance, scored against current snapshot gaps
- **Stop target:** 85 cards (`ASSEMBLY_STOP_TARGET_V46`) before cut review

### 3. Deck Snapshot (`DeckSnapshotV46`)

Computed deterministically from selected cards — not LLM memory:

- Role / engine / package coverage
- Commander dependence distribution
- Lifegain enabler vs payoff ratio
- Weaknesses, underused resources, redundancy clusters
- **Deck-aware research question** derived from actual gaps

### 4. Checkpoint Council

Thresholds: **12, 25, 40, 55, 70**

At each checkpoint, Research / Critic / Creative receive the **actual assembled deck** and discuss:

- What the deck produces vs what it exploits
- Harmony / bracket / play-style constraints
- Concrete cut/replace/add decisions

**Midpoint dialogue** at threshold 55 asks whether the deck still matches the original thesis.

### 5. Cut review

At **85 cards**, `runCutReviewV46()` evaluates slots that no longer earn their place.

### 6. Wiring

| Hook | Behavior |
|------|----------|
| `HYDRATE_LOOP` | Builds V4.6 council state; deck list from `selectedCards` |
| `ADVANCE_TREE` | `advanceCouncilAssemblyV46()` — batch add → checkpoint → cut review |
| Council transcript | `+` / `−` / `↻` mutation entries from `cardDecisions` |
| UI | Deck change rows in council log |

### 7. Creative LLM usage

No automatic Creative calls at checkpoints. Creative pass 1 only at charter; optional midpoint revisit only if warranted (unchanged from V4.5 cost policy).

---

## Acceptance Trace — Aerith (simulated)

Run: `npx tsx scripts/professor-v4-6-acceptance-demo-v1.ts`  
Output JSON: `web/data/milestones/deck-synthesis/professor-v4-6-acceptance-demo-output-v1.json`

### Deck Charter (design brief)

| Field | Value |
|-------|-------|
| Commander | Aerith Gainsborough |
| Bracket | 3 |
| Play style | weird deck |
| Commander relationship | Harmony |
| Primary strategy | Lifegain Value Engine |

Bracket policy translated to combo/tutor/speed/interaction expectations before any cards selected.

### Initial structural batch (12 cards)

Essence Warden, Ajani's Pridemate, Authority of the Consuls, Suture Priest, Vito, Soul's Attendant, Auriok Champion, Cathars' Crusade, Swords to Plowshares, Kytheon, Thalia, Heroic Intervention (+ commander)

### First Deck Snapshot (before checkpoint mutation)

| Metric | Value |
|--------|-------|
| Nonland count | 12 |
| Lifegain enablers | 4 |
| Lifegain payoffs | 1 |
| Card advantage | 0 |
| **Weakness** | Many lifegain enablers but few payoffs converting life into cards or durable advantage |

**Research question:**  
*"The current deck creates life gain frequently but only has thin card-advantage conversion — search for lifegain payoffs that also draw cards or create durable resources."*

### Checkpoint council conversation

**Research:** We're 12 structural cards in. Many lifegain enablers but few payoffs… I'm searching based on what we've actually committed — not generic Aerith staples.

**Critic:** Good. I also want new candidates to function without Aerith because the player asked for Harmony. Pure narrow lifegain slots should be cut unless the rate is exceptional.

**Creative:** Agreed. Don't bring me pure lifegain unless it's exceptional — prefer candidates that compress roles.

**Research:** I'd replace Soul Warden with Heroic Intervention — addresses the lifegain/payoff gap while fitting the charter.

**Critic:** Heroic Intervention covers 2 charter-relevant roles. I support the swap.

### Deck mutations

| Action | Card | Reason |
|--------|------|--------|
| **CUT** | Soul Warden | Narrow lifegain enabler; deck over-indexed on life gain events |
| **REPLACE** | Heroic Intervention ← Soul Warden | Role compression + charter fit |

### Second snapshot (after mutation + assembly advances)

| Metric | Before | After |
|--------|--------|-------|
| Lifegain enablers | 4 | 4 |
| Card advantage | 0 | 2 |
| Lifegain payoffs | 1 | 3 |
| Weaknesses | 2 | 0 |

Subsequent research batches added: Rhystic Study, Skullclamp, Well of Lost Dreams, Dawn of Hope, Path to Exile, Sol Ring, Arcane Signet, Alseid of Life's Bounty — all scored against **updated** snapshot gaps, not commander name alone.

---

## Proof chain (required acceptance format)

```
Existing deck state (12 cards, 4 lifegain enablers, 0 card advantage)
        ↓
Observation (snapshot weakness + research question)
        ↓
Research (deck-aware search in candidate pool)
        ↓
Council conversation (Research → Critic → Creative)
        ↓
Council decision (Replace Soul Warden → Heroic Intervention)
        ↓
Actual deck change (cardDecisions persisted, selectedCards mutated)
        ↓
Updated snapshot (card advantage + payoffs improved)
```

---

## UI

Council log now shows:

- Natural agent dialogue (pre-build → assembly → checkpoint)
- Green **Council decision** blocks
- **Deck change** rows: `− Soul Warden`, `↻ Soul Warden → Heroic Intervention`, `+ Rhystic Study`

Open **View council log** during a live Aerith brew at `the-game-lodge` to verify.

---

## Explicitly deferred (per spec §20)

- Final 100-card review / mana base finalization
- Professor Grade integration on completed deck
- DRAFT READY state
- Player interrupt choices (`KEEP GOING`, `GO WEIRDER`, etc.) — types exist; UI wiring next

---

## Stop condition met

✅ Shared card pool  
✅ Real checkpoint analysis from assembled deck  
✅ Deck-aware Research (snapshot-driven questions + candidate scoring)  
✅ Agent conversation with readable Critic reasoning  
✅ Actual card mutations persisted and visible  

**Waiting for inspection before final grading / deck-completion phase.**
