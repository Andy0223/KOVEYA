export const SLOT_MINUTES = 15;
const SLOT_MS = SLOT_MINUTES * 60_000;

/** SCH-003, SCH-007: half-open allocation intervals including both buffers. */
export function allocationSlots(
  startsAt: number,
  durationMinutes: number,
  before = 0,
  after = 0,
): number[] {
  if (!Number.isSafeInteger(startsAt) || startsAt % SLOT_MS !== 0)
    throw new RangeError("Start must align to a 15-minute UTC slot.");
  if (
    ![durationMinutes, before, after].every(
      (n) => Number.isSafeInteger(n) && n >= 0 && n % SLOT_MINUTES === 0,
    ) ||
    durationMinutes === 0
  ) {
    throw new RangeError(
      "Duration must be positive; duration and buffers must be multiples of 15 minutes.",
    );
  }
  const start = startsAt - before * 60_000;
  const end = startsAt + (durationMinutes + after) * 60_000;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    end - start > 24 * 60 * 60_000
  )
    throw new RangeError("Allocation may not exceed 24 hours.");
  return Array.from(
    { length: (end - start) / SLOT_MS },
    (_, i) => start + i * SLOT_MS,
  );
}

export type BookingStatus = "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";

/** BKG-005–007: terminal states cannot be transitioned again. Actor/policy checks belong in the API transaction. */
export function canTransitionBooking(
  from: BookingStatus,
  to: BookingStatus,
): boolean {
  return (
    from === "CONFIRMED" && ["COMPLETED", "CANCELLED", "NO_SHOW"].includes(to)
  );
}
