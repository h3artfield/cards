import type { StoreEvent, StoreEventPublic } from "./types";

export function spotsRemaining(
  event: Pick<StoreEvent, "capacity">,
  signupCount: number,
): number | null {
  if (event.capacity == null || event.capacity <= 0) return null;
  return Math.max(0, event.capacity - signupCount);
}

export function eventAcceptsSignups(
  event: Pick<StoreEvent, "capacity">,
  signupCount: number,
): boolean {
  const remaining = spotsRemaining(event, signupCount);
  return remaining === null || remaining > 0;
}

export function toPublicStoreEvent(
  event: StoreEvent,
  signupCount: number,
): StoreEventPublic {
  const { flyer: _flyer, ...publicFields } = event;
  return {
    ...publicFields,
    signupCount,
    spotsRemaining: spotsRemaining(event, signupCount),
  };
}
