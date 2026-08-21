/**
 * Production-write tripwire for the mechanical-space experiment.
 * Default is fail-closed. This subsystem must never write Firestore.
 */

export const ALLOW_PRODUCTION_INTERACTION_WRITES_ENV = "ALLOW_PRODUCTION_INTERACTION_WRITES";

export class ProductionInteractionWriteBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductionInteractionWriteBlockedError";
  }
}

export function productionInteractionWritesAllowed(): boolean {
  return process.env[ALLOW_PRODUCTION_INTERACTION_WRITES_ENV] === "true";
}

/** Call before any write attempt from this subsystem. Always throws in this milestone. */
export function assertNoProductionInteractionWrites(context: string): void {
  if (productionInteractionWritesAllowed()) {
    throw new ProductionInteractionWriteBlockedError(
      `Mechanical-space write blocked even with ${ALLOW_PRODUCTION_INTERACTION_WRITES_ENV}=true (${context}). This milestone forbids production interaction writes.`,
    );
  }
  throw new ProductionInteractionWriteBlockedError(
    `Mechanical-space production writes are disabled (${context}). ${ALLOW_PRODUCTION_INTERACTION_WRITES_ENV} is not true, and this milestone must not write Firestore.`,
  );
}

export function assertMechanicalSpaceReadOnly(context: string): void {
  if (productionInteractionWritesAllowed()) {
    throw new ProductionInteractionWriteBlockedError(
      `Refusing to continue: ${ALLOW_PRODUCTION_INTERACTION_WRITES_ENV}=true is unsafe for ${context}.`,
    );
  }
}
