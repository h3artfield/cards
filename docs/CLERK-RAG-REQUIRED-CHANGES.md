# Required Changes to the Store Inventory Clerk and MTG RAG System

## Executive diagnosis

The primary problem is **not that the RAG is too small**.

The system is producing incorrect answers because it is:

1. Routing the same request through multiple independent classifiers.
2. Allowing several LLM calls to reinterpret the commander, theme, constraints, and intended answer.
3. Treating EDHREC recommendations as though they were a complete deck-building engine.
4. Using semantic retrieval to discover card names without a sufficiently strict card-resolution step.
5. Verifying structural details, such as card count, without verifying that every stage is still answering the original request.
6. Allowing the formatter to regenerate prose after verification, potentially introducing new claims.
7. Missing a true card-function and card-relationship layer.

The Smaug-to-Animar failure is a symptom of this design. The intent translator understood Smaug, another stage failed to resolve it, the planner selected something else, and the formatter continued discussing the original theme. The existing verifier checked the deck's structure but did not require the deck title, commander slot, strategy, and card selection to reference the same commander.

The correct target is:

> **One immutable request state, one canonical card identity system, deterministic fact tools, relationship-aware retrieval, a deterministic deck compiler, and a verifier that checks every customer-facing claim.**

---

# 1. Replace the multiple mutable request interpretations

## Current problem

The request can be interpreted by:

* The client-side classifier
* The server-side classifier
* The LLM router
* Heuristic overrides
* The deck-build intent translator
* The commander planner
* The specialist
* The formatter

Each component can produce a slightly different interpretation. The report explicitly notes that the translator, planner, and formatter can disagree.

## Required change

Create a single `ResolvedClerkRequest` object on the server.

```ts
interface ResolvedClerkRequest {
  requestId: string;

  game: "magic" | "pokemon" | "lorcana" | "other";
  format?: "commander" | "standard" | "modern" | "limited" | "unknown";
  task:
    | "inventory_lookup"
    | "card_fact"
    | "rules_question"
    | "recommend_cards"
    | "recommend_commander"
    | "build_deck"
    | "explain_strategy";

  requestedText: string;

  entities: {
    cardOracleIds: string[];
    requestedCardNames: string[];
    commanderOracleId?: string;
    requestedCommanderName?: string;
    archetypes: string[];
    mechanics: string[];
    colors: string[];
  };

  commanderSelectionPolicy:
    | "exact_commander_required"
    | "alternatives_allowed"
    | "recommend_a_commander";

  constraints: {
    inventoryOnly: boolean;
    budgetTotal?: number;
    maxCardPrice?: number;
    colorsExact?: string[];
    colorsAllowed?: string[];
    powerTarget?: string;
    excludeCards?: string[];
  };

  resolutionStatus:
    | "resolved"
    | "partially_resolved"
    | "needs_clarification"
    | "unsupported";
}
```

Once an exact commander is resolved, `commanderOracleId` must become immutable.

No later prompt may replace it.

The formatter must never be allowed to select or change the commander.

---

# 2. Make the server the only authoritative router

## Current problem

The client may bypass the full API for `inventory_direct` requests. That means apparently similar questions can use different search and validation paths.

For example:

* "Sol Ring"
* "Do you have Sol Ring?"
* "Show me Sol Rings under $5."
* "Would Sol Ring work in this deck?"

These should not be handled by unrelated pipelines merely because their wording differs.

## Required change

The client classifier should control only presentation behavior, such as whether to show a staged deck-building animation.

The server must always receive the original message and produce the authoritative route.

Routing precedence should be deterministic:

1. Exact card-name or product identifier
2. Rules question
3. Explicit complete deck request
4. Inventory lookup with constraints
5. Recommendation request
6. Strategy or educational request
7. Mixed request
8. LLM classifier only when deterministic routing remains ambiguous

Store the routing explanation:

```ts
{
  route: "inventory_lookup",
  routeSource: "deterministic_rule",
  matchedRule: "inventory_phrase_plus_card_entity",
  confidence: 1
}
```

This will make routing failures diagnosable.

---

# 3. Separate Oracle cards, printings, and store listings

## Current problem

The inventory documents currently contain both store-listing information and denormalized Scryfall information.

That is convenient for browsing, but it risks confusing three different entities:

1. The underlying Magic card
2. A particular printing of the card
3. A physical store listing in a particular condition

## Required data model

### Canonical Oracle card

```text
catalogOracleCards/{oracleId}
```

Contains:

* Canonical name
* Oracle text
* Faces
* Mana cost
* Color identity
* Types and subtypes
* Keywords
* Legalities
* Commander eligibility
* Functional profile
* Relationships
* Last Scryfall version

### Printing

```text
catalogPrintings/{scryfallId}
```

Contains:

* Oracle ID
* Set
* Collector number
* Finish
* Language
* Rarity
* TCGplayer product IDs
* Images
* Release date

### Inventory listing

```text
inventoryListings/{listingId}
```

Contains:

* Store ID
* Scryfall printing ID
* Condition
* Finish
* Quantity on hand
* Quantity reserved
* Quantity committed to orders
* Available quantity
* Store price
* Import source
* Last inventory update

A materialized inventory-search view may still denormalize fields, but the canonical ownership of every field must be clear.

---

# 4. Eliminate heuristic commander detection

## Current problem

The browse system calculates `isCommander` using either `catalogLegalCommander` or a legendary-type heuristic. A card being legendary does not automatically make it eligible to be a commander.

This can create answers similar to the earlier Lórien Revealed failure, where cards that are not commanders enter a commander recommendation set.

## Required change

Store an explicit commander eligibility object:

```ts
interface CommanderEligibility {
  eligible: boolean;

  basis:
    | "legendary_creature"
    | "card_text_allows_commander"
    | "background"
    | "doctor_companion"
    | "partner_variant"
    | "not_eligible";

  commanderColorIdentity: string[];
  partnerRestrictions?: string[];
  reason: string;
  sourceVersion: string;
}
```

A card enters a commander result set only when:

```ts
commanderEligibility.eligible === true
```

Do not use a legendary type-line heuristic as a fallback.

Unresolved cards should be excluded from commander results rather than guessed.

---

# 5. Correct the inventory quantity model

## Current concern

The import report says store reserve quantity is ignored during TCGplayer import, while the browse layer reportedly exposes an effective quantity that excludes reserved or sold units. Those two statements need to be reconciled.

## Required fields

```ts
quantityOnHand
quantityReserved
quantityCommitted
quantityDamaged
quantityAvailable
```

Calculate:

```text
quantityAvailable =
quantityOnHand
- quantityReserved
- quantityCommitted
- quantityDamaged
```

Every customer-facing stock statement must use `quantityAvailable`.

Also add:

```ts
inventorySnapshotId
inventoryCheckedAt
inventorySourceVersion
```

This lets the system say:

> "Two copies were available when I checked."

instead of treating inventory as permanently true.

Negative claims such as "we do not have this card" should be allowed only after an exhaustive normalized-name and printing search completes successfully.

---

# 6. Fix color-filter semantics

## Current problem

The report says selecting one color returns mono-color cards only.

That is correct for:

> "Show me mono-blue cards."

It is not correct for:

> "Show me blue cards."

The second request normally includes cards containing blue alongside other colors.

## Required operators

Support distinct filters:

```text
colorIdentityExact
colorIdentityContainsAll
colorIdentityContainsAny
colorIdentitySubsetOf
colorIdentityExcludes
```

Examples:

| User wording                         | Required operation  |
| ------------------------------------ | ------------------- |
| mono-blue                            | exact `[U]`         |
| blue cards                           | contains `U`        |
| blue-red cards                       | contains all `U,R`  |
| only cards legal in a Temur deck     | subset of `U,R,G`   |
| colorless cards                      | exact `[]`          |
| commanders with exactly three colors | identity length `3` |

The language model may interpret the wording, but Firestore must execute a defined operator.

---

# 7. Stop using RAG-extracted card names as trusted inventory results

## Current problem

The current `rag_card_names` strategy lets RAG retrieve strategy passages, asks an LLM to extract card names, and then searches inventory for those names.

That is useful for candidate generation, but it is unsafe as an authoritative recommendation path. A transcript might mention:

* A card as a bad example
* A card the creator removed
* An opponent's card
* A card that is illegal in the deck
* A card that does not actually perform the requested function

## Required change

RAG may generate candidates, but every candidate must pass:

1. Exact card resolution to Oracle ID
2. Commander color-identity validation
3. Format-legality validation
4. Requested-function validation
5. Inventory resolution
6. Price and quantity constraints
7. Recommendation relevance scoring

Candidate flow:

```text
RAG candidate name
→ canonical card resolver
→ functional-profile check
→ legality check
→ inventory join
→ relationship score
→ recommendation set
```

Never send raw extracted names directly to the customer.

---

# 8. Build a structured card-action ontology

This is the biggest missing data layer.

Embeddings tell you that two passages or cards are semantically related. They do not reliably tell you exactly what a card does or how two rules objects interact.

Every Oracle card should receive a structured functional representation.

## Proposed card-action schema

```ts
interface CardAction {
  actionType:
    | "draw"
    | "discard"
    | "mill"
    | "destroy"
    | "exile"
    | "counter"
    | "return_to_hand"
    | "return_to_battlefield"
    | "cast"
    | "copy"
    | "create_token"
    | "add_mana"
    | "sacrifice"
    | "search_library"
    | "modify_power"
    | "grant_ability"
    | "prevent_damage"
    | "gain_life"
    | "lose_life";

  eventType:
    | "spell"
    | "activated_ability"
    | "triggered_ability"
    | "replacement_effect"
    | "static_effect";

  sourceZone: string[];
  targetZone?: string[];
  affectedObjectTypes: string[];
  controllerRelationship?: "you" | "opponent" | "any";
  timing?: string;
  optional: boolean;
  repeatable: boolean;
  manaCost?: number;
  additionalCosts?: string[];
  conditions?: string[];
  results: string[];
}
```

Also store role dimensions:

```text
ramp
card_advantage
spot_removal
board_wipe
countermagic
protection
recursion
sacrifice_outlet
token_enabler
token_payoff
graveyard_enabler
graveyard_payoff
cast_from_exile_enabler
cast_from_exile_payoff
combo_piece
finisher
tutor
mana_sink
```

Each dimension should have:

```ts
{
  score: 0.0–1.0,
  confidence: 0.0–1.0,
  extractionMethod: "deterministic" | "llm" | "manual",
  evidence: [...]
}
```

This becomes the card's functional fingerprint.

---

# 9. Use multiple card representations, not one universal number

A card should not be reduced to one "synergy number."

Each card should have at least four representations:

### Semantic embedding

Answers:

> What cards are described similarly?

### Functional vector

Answers:

> What actions and roles does this card perform?

### Graph embedding

Answers:

> What cards, commanders, archetypes, and combos is it connected to?

### Observed deck vector

Answers:

> In what real deck contexts does this card appear?

Example:

```ts
interface CardRepresentations {
  semanticEmbedding: number[];
  functionalVector: number[];
  graphEmbedding: number[];
  deckContextEmbedding: number[];
}
```

These vectors should supplement the readable structured fields, not replace them.

---

# 10. Add a contextual card-relationship graph

Create a collection such as:

```text
cardRelationships/{relationshipId}
```

```ts
interface CardRelationship {
  sourceOracleId: string;
  targetOracleId: string;

  relationshipTypes: Array<
    | "direct_synergy"
    | "enables"
    | "payoff_for"
    | "redundant_with"
    | "substitute_for"
    | "combo_component"
    | "anti_synergy"
    | "commonly_played_together"
    | "competes_for_slot"
  >;

  context: {
    format: string;
    commanderOracleId?: string;
    archetypes?: string[];
    powerBand?: string;
  };

  scores: {
    rulesInteraction: number;
    commanderConditionedLift: number;
    archetypeConditionedLift: number;
    functionalComplementarity: number;
    comboEvidence: number;
    expertEvidence: number;
    curveCompatibility: number;
    antiSynergyPenalty: number;
    overall: number;
  };

  evidence: Array<{
    sourceType:
      | "oracle_analysis"
      | "deck_cooccurrence"
      | "edhrec"
      | "combo_database"
      | "primer"
      | "transcript"
      | "manual";
    sourceId: string;
    claim?: string;
    confidence: number;
  }>;

  version: string;
}
```

## Relationship scoring

Do not use raw co-occurrence.

Popular cards such as Sol Ring will co-occur with almost everything. Use commander- and archetype-conditioned lift:

```text
lift(A, B | commander) =
observed frequency of A and B together
/
expected frequency of A and B together
```

The overall score can begin with:

```text
25% rules interaction
20% commander-conditioned lift
15% archetype-conditioned lift
15% functional complementarity
10% verified combo evidence
10% independent expert-source agreement
 5% mana-curve compatibility
minus anti-synergy penalties
```

Store every component. The bot must be able to explain why the score is high.

External deck data may help generate evidence, but do not make the system dependent on scraping a third-party site without confirmed API access and commercial permission.

---

# 11. Improve transcript ingestion before adding large quantities

The current transcript ingestion uses paragraph chunks of approximately 550 tokens with a 400-character overlap and only basic transcript metadata.

That will create increasing noise as more transcripts are added.

## Required transcript pipeline

### Step 1: Clean the transcript

Remove:

* Sponsor segments
* Intros and outros
* Repeated captions
* Non-MTG digressions
* Auto-caption artifacts

### Step 2: Resolve entities

Attach:

* Oracle card IDs
* Commander IDs
* Archetypes
* Formats
* Mechanics
* Color identities
* Deck names

### Step 3: Extract claims

Examples:

```text
Card A is a strong payoff for Card B.
Card C should not be played in this commander.
Card D is a budget replacement for Card E.
This deck needs approximately ten ramp effects.
```

Store each as a claim with timestamp and source.

### Step 4: Classify each claim

```text
rules_statement
card_fact
strategy_opinion
deckbuilding_heuristic
synergy_claim
anti_synergy_claim
budget_advice
meta_dependent_claim
```

### Step 5: Create contextualized chunks

Each embedded chunk should include enough context to stand alone:

```text
This passage is from a Commander deck guide for Prosper,
Tome-Bound. The speaker is explaining cards that reward casting
spells from exile and is evaluating Jeska's Will as an engine card.
```

### Step 6: Weight evidence

A transcript is community opinion, not authoritative rules text.

Multiple independent sources agreeing should increase confidence. Repetition within one channel should not.

---

# 12. Replace fixed eight-chunk retrieval with query-specific retrieval

The current system retrieves up to eight chunks and ranks largely by authority, aliases, and vector score.

Different questions require different retrieval strategies.

## Required retrieval lanes

### Card-fact lane

Use canonical card data only.

### Rules lane

Use:

* Exact rule-number lookup
* Keyword index
* Rules glossary
* Vector search only as supplemental retrieval

### Inventory lane

Use structured Firestore queries.

### Strategy lane

Use primers, functional profiles, transcripts, and relationship evidence.

### Commander lane

Use commander profile, relationship graph, EDHREC observations, and legal inventory.

### Deck-building lane

Use the deterministic deck compiler.

## Recommended retrieval flow

```text
Query decomposition
→ exact entity retrieval
→ lexical retrieval
→ metadata-filtered vector retrieval
→ graph-neighbor retrieval
→ merge and deduplicate
→ rerank
→ evidence selection
```

Retrieve a larger candidate pool, such as 30–50 items, and rerank to the final evidence set.

Do not retrieve eight chunks from the entire knowledge corpus and expect every question type to work equally well.

---

# 13. Replace the LLM deck assembler with a deterministic deck compiler

The current staged builder primarily adds cards from EDHREC categories that match inventory. That can create a collection of popular cards rather than a coherent deck.

## New deck-building process

### Phase A: Lock the commander

The session stores:

```ts
commanderOracleId
commanderName
colorIdentity
commanderSelectionPolicy
```

These cannot change after initialization.

### Phase B: Build a deck specification

```ts
interface DeckSpecification {
  format: "commander";
  commanderOracleId: string;
  strategy: string[];
  requiredMechanics: string[];
  prohibitedMechanics: string[];
  targetPower: string;
  budget?: number;
  inventoryOnly: boolean;
  roleTargets: Record<string, { min: number; target: number; max: number }>;
  curveTargets: Record<string, number>;
}
```

### Phase C: Generate candidate pools

Sources:

* Commander-specific observed cards
* Functional-profile matches
* Relationship graph
* Verified combos
* Primer recommendations
* Store inventory
* Legal basic and nonbasic lands

### Phase D: Score candidates

```text
candidate score =
commander synergy
+ requested-theme relevance
+ role need
+ relationship evidence
+ curve fit
+ mana efficiency
+ inventory availability
+ budget fit
+ redundancy value
- legality penalties
- anti-synergy
- excessive role duplication
```

### Phase E: Optimize the deck

The compiler should satisfy:

* Exactly one legal commander
* Ninety-nine legal main-deck cards
* Singleton rule, except permitted cards
* Commander color identity
* Role requirements
* Mana curve
* Land count
* Budget
* Inventory quantities
* Requested strategy

### Phase F: Validate

The deck is not considered complete unless every hard constraint passes.

## Out-of-stock commander behavior

When the requested commander exists but is not in stock:

* Keep the requested commander.
* Mark it as unavailable.
* Build the deck around that commander if the user did not request inventory-only completion.

When the commander cannot be resolved:

* State that the card could not be verified.
* Do not silently substitute another commander.

When alternatives are permitted:

* Present the alternatives before changing the build target.
* Store the selected alternative as a new immutable commander ID.

---

# 14. Treat EDHREC as evidence, not as the deck engine

EDHREC is useful for:

* Observed inclusion
* Commander associations
* Themes
* Popularity
* Candidate generation

It does not by itself prove:

* A card performs the requested function
* A deck has enough interaction
* A recommendation is legal
* A card is available
* A deck is balanced
* Two cards have a direct synergy
* A card is good at the requested power level

Every EDHREC recommendation should be joined to:

* Oracle ID
* Functional profile
* Relationship evidence
* Legality
* Inventory
* Price
* Deck role
* Deck context

Raw EDHREC synergy should be only one scoring component.

---

# 15. Create an evidence-first answer object

Do not let specialists generate polished customer-facing prose directly.

They should create a structured answer plan.

```ts
interface ClerkAnswerPlan {
  resolvedRequestId: string;

  directAnswer: {
    value: string;
    confidence: number;
    evidenceIds: string[];
  };

  claims: Array<{
    claimId: string;
    text: string;
    claimType:
      | "inventory"
      | "card_fact"
      | "rules"
      | "strategy"
      | "recommendation";
    evidenceIds: string[];
    confidence: number;
  }>;

  recommendedCards: Array<{
    oracleId: string;
    inventoryListingId?: string;
    reasonClaimId: string;
  }>;

  deckId?: string;
  warnings: string[];
}
```

The formatter may:

* Shorten
* Organize
* Change tone
* Add headings

The formatter may not:

* Add card names
* Add prices
* Add quantities
* Change the commander
* Add rules claims
* Add recommendation reasons
* Remove required caveats

A final diff check should confirm that every named card in the formatted reply exists in the answer plan.

---

# 16. Rebuild the verifier around semantic contracts

The current verifier checks card count, inventory grounding, legality, constraints, role balance, and rules citations, but it does not check commander-name consistency.

## Required deterministic checks

### Request consistency

* Final task matches routed task
* Exact requested commander has not changed
* Requested format has not changed
* Inventory-only status has not changed
* Budget has not changed

### Entity validity

* Every named card resolves to an Oracle ID
* No invented set or printing
* Every commander recommendation is commander-eligible
* Every inventory listing resolves to the claimed card

### Inventory validity

* Available quantity is positive
* Recommended copies do not exceed available quantity
* Displayed price comes from the selected listing
* Negative stock claims came from an exhaustive search

### Deck validity

* Commander name, title, strategy, and deck list agree
* Exactly 100 Commander cards
* Exactly one commander, or a legal partnered configuration
* Singleton rules
* Legal color identity
* Format legality
* Copy quantity
* Budget
* Role minimums
* Mana-base requirements

### Evidence validity

* Every factual claim has evidence
* Rules citations actually support the claim
* Transcript opinions are not presented as official rules
* Recommendation explanations correspond to the recommended card
* No evidence refers to a different commander

### Response validity

* Every card name in the prose appears in structured output
* Every displayed price appears in the inventory snapshot
* Every caveat required by a failed or partial condition remains present

## LLM critic

An LLM critic may evaluate:

* Whether the recommendation is strategically useful
* Whether the explanation is understandable
* Whether obvious context was missed

It must not override deterministic facts.

Do not repeatedly rerun the entire specialist after a verifier failure. Patch or regenerate only the failed component.

---

# 17. Simplify prompts and assign each model one job

The current Commander persona is approximately 490 lines, and the same general JSON-call mechanism is used across routing, planning, specialists, and formatting.

Large personas often hide conflicting instructions and make debugging difficult.

Use narrow contracts:

* Router: classify only
* Entity resolver: resolve only
* Query translator: create structured filters only
* Strategy analyst: create evidence-backed claims only
* Deck compiler: deterministic code
* Critic: evaluate answer plan only
* Formatter: render validated fields only

Use a stronger reasoning model only where nuanced planning is genuinely needed. Use smaller, cheaper models for classification, extraction, and formatting.

Every model call should use:

* Strict schema validation
* Enumerated values
* No extra fields
* Logged input and output
* Prompt version
* Model version
* Retry reason
* Confidence or abstention

---

# 18. Unify Ask the Clerk and the Deck Builder core

The report says the Ask the Clerk and Deck Builder tabs use separate APIs and separate agent paths.

That will eventually produce different answers to the same question.

They should share:

* Entity resolver
* Card catalog
* Inventory service
* Functional profiles
* Relationship graph
* Commander resolver
* Deck compiler
* Validator
* Evidence system
* Evaluation suite

The UI may remain separate, but the intelligence layer should be shared.

---

# 19. Add data versioning and coverage gates

Every generated answer should record:

```ts
{
  scryfallBulkVersion: string;
  edhrecSyncVersion?: string;
  inventorySnapshotId: string;
  ragCorpusVersion?: string;
  relationshipGraphVersion?: string;
  promptVersions: string[];
}
```

## Required coverage metrics

Track:

* Percentage of Magic inventory with Oracle IDs
* Percentage with exact printing IDs
* Percentage with complete Oracle text
* Percentage with commander eligibility
* Percentage with functional profiles
* Percentage with Oracle tags
* Percentage with EDHREC commander profiles
* Percentage with relationship edges
* Unresolved inventory rows
* Fuzzy-match rate
* Manual-match rate
* Match-conflict rate

Do not expose a feature as fully supported when required data coverage is below its threshold.

For example, a complete inventory-only Commander deck request should not proceed when a substantial portion of inventory lacks canonical identities.

---

# 20. Expand evaluations from retrieval tests to complete system tests

The current approximately 75 golden cases are described primarily as RAG retrieval evaluations. That is not enough to validate the complete clerk.

Create separate test suites.

## Router evaluations

* Correct game
* Correct format
* Correct intent
* Correct constraints
* Correct commander policy

## Entity evaluations

* Exact card names
* Misspellings
* Split cards
* Double-faced cards
* Similar names
* Set names versus card names
* Unreleased or nonexistent cards

## Inventory evaluations

* In stock
* Out of stock
* Reserved quantity
* Multiple conditions
* Multiple printings
* Price caps
* Mono-color versus contains-color requests

## Rules evaluations

* Correct result
* Correct rule citations
* No unsupported extrapolation
* Correct interaction between multiple cards

## Recommendation evaluations

* All cards legal
* All cards commander-eligible where required
* All cards satisfy the requested function
* No irrelevant RAG-mentioned cards
* Inventory compliance

## Deck evaluations

Include at minimum:

* "Build a deck around Smaug."
* "Do not substitute another commander."
* "Build using only cards in stock."
* "Build the best mono-blue Commander deck under $100."
* "Recommend a commander that rewards casting from exile."
* "Build around an out-of-stock commander."
* "Build around a nonexistent card."
* "Build a tribal deck with no suitable commander in stock."

## Answer evaluations

* No hallucinated card
* No hallucinated stock
* No hallucinated price
* Commander consistency
* Claim-evidence consistency
* Correct caveats
* No contradiction between title and body

Every production deployment should run these evaluations before traffic moves to the new revision.

---

# 21. Add complete tracing and a quality dashboard

Current structured logs record the broad intent, strategy, RAG count, verification result, failures, and latency, but there is no dedicated dashboard.

Log a trace for every request:

```text
request
→ route decision
→ resolved entities
→ constraints
→ tool queries
→ inventory result IDs
→ catalog result IDs
→ retrieved chunk IDs
→ relationship IDs
→ candidate cards
→ rejected candidates and reasons
→ answer plan
→ verifier checks
→ formatted response
```

Dashboard metrics should include:

* Incorrect-route rate
* Entity-resolution failure rate
* Fuzzy-resolution rate
* Inventory-claim failure rate
* Commander-substitution rate
* Verifier revision rate
* Verifier block rate
* Hallucinated-card rate
* Illegal-deck rate
* Incomplete-deck rate
* RAG retrieval precision
* Customer correction rate
* Customer thumbs-down rate
* Latency by pipeline stage
* Cost by pipeline stage

Add an internal replay page where a failed customer request can be rerun against newer pipeline versions.

---

# 22. Changes to implement first

## Priority 0 — Stop incorrect customer-facing information

1. Make commander identity immutable.
2. Remove legendary-type commander heuristics.
3. Prevent the formatter from adding facts or card names.
4. Add commander/title/strategy consistency checks.
5. Require every named card to resolve to an Oracle ID.
6. Correct available-quantity calculations.
7. Separate "blue" from "mono-blue" filtering.
8. Block silent commander substitutions.
9. Require exact evidence for inventory, price, legality, and rules claims.
10. Route all requests authoritatively on the server.

## Priority 1 — Repair the data foundation

1. Split Oracle cards, printings, and inventory listings.
2. Complete the Scryfall crosswalk backfill.
3. Add data-coverage reporting.
4. Add functional card profiles.
5. Version Scryfall, EDHREC, inventory, and RAG data.
6. Create unresolved and conflicting-match queues.

## Priority 2 — Improve knowledge retrieval

1. Contextualize transcript chunks.
2. Extract card IDs and claims from transcripts.
3. Add lexical, vector, and graph retrieval.
4. Add reranking.
5. Replace fixed eight-chunk retrieval.
6. Prevent RAG card-name extraction from bypassing validation.

## Priority 3 — Add relationships and deterministic deck construction

1. Build card-action ontology.
2. Create card-to-card relationship documents.
3. Calculate commander-conditioned co-occurrence lift.
4. Add combo and anti-synergy evidence.
5. Replace staged EDHREC filling with the deck compiler.
6. Add deck-level scoring after deck construction.

## Priority 4 — Production quality controls

1. End-to-end evaluations.
2. Deployment quality gates.
3. Full tracing.
4. Quality dashboard.
5. Failed-request replay.
6. Shared intelligence layer for Ask the Clerk and Deck Builder.

---

# 23. What should not be done yet

Do not simply:

* Import thousands more transcripts into the existing chunker.
* Add dozens of unstructured columns without a functional ontology.
* Treat cosine similarity as card synergy.
* Treat raw EDHREC inclusion as strategic proof.
* Let an LLM decide whether its own answer is factually valid.
* Allow the formatter to reconstruct an already verified answer.
* Generate a complete deck by filling seven broad categories.
* Give every pair of cards one universal relationship score.
* Maintain separate commander logic in the Clerk and Deck Builder.
* Fix individual failures only by adding more prompt instructions.

Those changes may make the system appear more sophisticated while preserving the same failure modes.

---

# Final target architecture

```text
Customer request
    ↓
Single server router
    ↓
Canonical entity resolution
    ↓
Immutable resolved request
    ↓
Deterministic tool plan
    ├── Canonical card facts
    ├── Inventory snapshot
    ├── Rules retrieval
    ├── Strategy RAG
    ├── Functional profiles
    └── Relationship graph
    ↓
Recommendation engine or deck compiler
    ↓
Evidence-backed answer plan
    ↓
Deterministic verifier
    ↓
Limited strategic critic
    ↓
Non-inventive formatter
    ↓
Customer response
```

The most important conceptual change is:

> **The LLM should explain and reason over verified data. It should not be responsible for deciding what the underlying facts are.**

Your golden table, functional dimensions, relationship graph, inventory data, and deterministic validation should produce the permissible answer space. The language model should work inside that space.
