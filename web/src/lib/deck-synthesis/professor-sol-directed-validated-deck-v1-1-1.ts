/**
 * A deck and the verdict on that exact deck, bound into one value.
 *
 * The Omnath incident came from tracking these separately: the land-base repair
 * mutated the deck after validation had already passed, and the stale `pass:
 * true` shipped with it. A terminal re-validation closed that specific hole,
 * but the shape that allowed it stayed — two variables, reassigned in a dozen
 * places, with nothing but discipline keeping them in step.
 *
 * `ValidatedDeckV111` is only constructible by running the validator, so a
 * verdict can never refer to a deck other than the one beside it. Mutating
 * produces a new value; there is no way to change the deck in place and keep
 * the old verdict.
 *
 * The validator is a closure over the build's context rather than a function of
 * seven arguments. That context — catalog, contract, candidate dictionary, land
 * pool, identity ledger, prohibited ids — was previously repeated at every call
 * site, which is its own staleness risk: the bracket attainment pass extends the
 * candidate dictionary, and any site still holding an older copy would reject
 * cards the build legitimately added. Capturing it once removes that class of
 * mistake, and holding the dictionary by reference means later additions are
 * visible to every subsequent validation.
 */
import { validateSolDirectedDeckV111 } from "./professor-sol-directed-pre-head-professor-gate-v1-1-1";
import type { SolDirectedValidationV111 } from "./professor-sol-directed-pre-head-professor-gate-v1-1-1";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { IdentityResolutionLedgerEntryV111 } from "./professor-sol-directed-candidate-hydration-v1-1-1";
import type {
  CanonicalCardFactsV11,
  LandPoolV11,
  RetrievalContractV11,
  SolDirectedConstructedDeckV11,
} from "./professor-sol-directed-types-v1-1";

export const PROFESSOR_SOL_DIRECTED_VALIDATED_DECK_V111_VERSION =
  "professor-sol-directed-validated-deck-v1-1-1";

/**
 * A deck paired with the verdict for that deck. Both fields are readonly: the
 * only way to move forward is to validate again.
 */
export type ValidatedDeckV111 = {
  readonly deck: SolDirectedConstructedDeckV11;
  readonly validation: SolDirectedValidationV111;
};

export type DeckValidationContextV111 = {
  catalog: DeckResolutionCatalog;
  contract: RetrievalContractV11;
  /** Held by reference so additions made mid-build are visible here. */
  candidateDictionary: Record<string, CanonicalCardFactsV11>;
  landPool: LandPoolV11;
  identityLedger: IdentityResolutionLedgerEntryV111[];
  prohibitedOracleIds?: string[];
};

export type DeckValidatorV111 = {
  /** The only constructor of a ValidatedDeckV111. */
  validate(deck: SolDirectedConstructedDeckV11): ValidatedDeckV111;
  /**
   * Applies a mutation and re-validates in one step, so a caller cannot forget
   * the second half. Returns a new value; the input is untouched.
   */
  mutate(
    current: ValidatedDeckV111,
    change: (deck: SolDirectedConstructedDeckV11) => SolDirectedConstructedDeckV11,
  ): ValidatedDeckV111;
};

export function createDeckValidatorV111(context: DeckValidationContextV111): DeckValidatorV111 {
  const validate = (deck: SolDirectedConstructedDeckV11): ValidatedDeckV111 =>
    Object.freeze({
      deck,
      validation: validateSolDirectedDeckV111({
        deck,
        catalog: context.catalog,
        contract: context.contract,
        candidateDictionary: context.candidateDictionary,
        landPool: context.landPool,
        identityLedger: context.identityLedger,
        prohibitedOracleIds: context.prohibitedOracleIds,
      }),
    });

  return {
    validate,
    mutate: (current, change) => validate(change(current.deck)),
  };
}
