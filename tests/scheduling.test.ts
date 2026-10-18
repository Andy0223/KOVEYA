import { describe, expect, it } from "vitest";
import {
  allocationSlots,
  canTransitionBooking,
} from "../worker/modules/scheduling/slots";

const start = Date.parse("2026-10-19T11:00:00Z");
describe("SCH-003 / SCH-007 slot allocations", () => {
  it("includes both buffers, excludes the right endpoint", () => {
    const slots = allocationSlots(start, 60, 15, 15);
    expect(slots).toHaveLength(6);
    expect(slots[0]).toBe(start - 15 * 60_000);
    expect(slots.at(-1)).toBe(start + 60 * 60_000);
    expect(slots).not.toContain(start + 75 * 60_000);
  });
  it("permits adjacent services without buffers", () => {
    const first = allocationSlots(start, 60);
    const second = allocationSlots(start + 60 * 60_000, 30);
    expect(first.filter((s) => second.includes(s))).toEqual([]);
  });
  it("buffers conflict even when service intervals do not", () => {
    const first = allocationSlots(start, 60, 0, 15);
    const second = allocationSlots(start + 60 * 60_000, 30);
    expect(first.filter((s) => second.includes(s))).toHaveLength(1);
  });
  it.each([
    [start + 1, 60, 0, 0],
    [start, 46, 0, 0],
    [start, 0, 0, 0],
    [start, 60, -15, 0],
    [start, 60, 0, 5],
    [NaN, 60, 0, 0],
    [start, 1500, 0, 0],
  ])("rejects invalid input %j", (s, duration, before, after) => {
    expect(() => allocationSlots(s, duration, before, after)).toThrow(
      RangeError,
    );
  });
});

describe("BKG lifecycle", () => {
  it("allows each terminal state only from CONFIRMED", () => {
    for (const to of ["CANCELLED", "COMPLETED", "NO_SHOW"] as const)
      expect(canTransitionBooking("CONFIRMED", to)).toBe(true);
    expect(canTransitionBooking("CONFIRMED", "CONFIRMED")).toBe(false);
  });
  it.each(["CANCELLED", "COMPLETED", "NO_SHOW"] as const)(
    "blocks repeated transitions from %s",
    (from) => {
      for (const to of [
        "CONFIRMED",
        "CANCELLED",
        "COMPLETED",
        "NO_SHOW",
      ] as const)
        expect(canTransitionBooking(from, to)).toBe(false);
    },
  );
});
