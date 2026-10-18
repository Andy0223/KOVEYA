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

import {
  availableSlots,
  validDate,
} from "../worker/modules/scheduling/availability";
import type { Schedule } from "../src/shared/booking";
const fullSchedule: Schedule = {
  revision: 1,
  timezone: "Asia/Taipei",
  rules: Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    start: 540,
    end: 1080,
  })),
  exceptions: [],
};
const policy = {
  timezone: "Asia/Taipei",
  durationMinutes: 60,
  bufferBeforeMinutes: 15,
  bufferAfterMinutes: 15,
  minNoticeMinutes: 0,
  maxAdvanceDays: 30,
};
describe("SCH-001–008 calendar rules", () => {
  it("rejects impossible dates", () => {
    expect(validDate("2026-02-30")).toBe(false);
    expect(validDate("2026-2-03")).toBe(false);
  });
  it("buffers must fit hours, and occupied buffers remove a candidate", () => {
    const now = Date.parse("2026-10-18T00:00:00Z");
    const slots = availableSlots(
      "2026-10-19",
      fullSchedule,
      policy,
      new Set(),
      now,
    );
    expect(slots[0]).toBe(Date.parse("2026-10-19T01:15:00Z"));
    expect(slots.at(-1)).toBe(Date.parse("2026-10-19T08:45:00Z"));
    const blocked = availableSlots(
      "2026-10-19",
      fullSchedule,
      policy,
      new Set([Date.parse("2026-10-19T01:00:00Z")]),
      now,
    );
    expect(blocked).not.toContain(slots[0]);
  });
  it("closed exceptions replace weekly hours; open exceptions replace rather than add", () => {
    const now = Date.parse("2026-10-18T00:00:00Z");
    expect(
      availableSlots(
        "2026-10-19",
        {
          ...fullSchedule,
          exceptions: [{ date: "2026-10-19", intervals: [] }],
        },
        policy,
        new Set(),
        now,
      ),
    ).toEqual([]);
    expect(
      availableSlots(
        "2026-10-19",
        {
          ...fullSchedule,
          exceptions: [
            { date: "2026-10-19", intervals: [{ start: 600, end: 690 }] },
          ],
        },
        policy,
        new Set(),
        now,
      ),
    ).toEqual([Date.parse("2026-10-19T02:15:00Z")]);
  });
  it("enforces notice and service-local booking horizon", () => {
    const now = Date.parse("2026-10-18T23:00:00Z");
    expect(
      availableSlots(
        "2026-10-19",
        fullSchedule,
        { ...policy, minNoticeMinutes: 300 },
        new Set(),
        now,
      )[0],
    ).toBe(Date.parse("2026-10-19T04:00:00Z"));
    expect(
      availableSlots("2026-11-19", fullSchedule, policy, new Set(), now),
    ).toEqual([]);
  });
  it("keeps both fall-back instants and skips spring-forward missing wall time", () => {
    const tz = "America/New_York",
      schedule = {
        ...fullSchedule,
        timezone: tz,
        rules: Array.from({ length: 7 }, (_, weekday) => ({
          weekday,
          start: 0,
          end: 240,
        })),
      };
    const p = {
      ...policy,
      timezone: tz,
      durationMinutes: 15,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      maxAdvanceDays: 365,
    };
    const fall = availableSlots(
      "2026-11-01",
      schedule,
      p,
      new Set(),
      Date.parse("2026-10-01"),
    );
    expect(fall).toContain(Date.parse("2026-11-01T05:30:00Z"));
    expect(fall).toContain(Date.parse("2026-11-01T06:30:00Z"));
    expect(fall).toHaveLength(20);
    const spring = availableSlots(
      "2027-03-14",
      schedule,
      p,
      new Set(),
      Date.parse("2026-10-01"),
    );
    expect(spring).toHaveLength(12);
  });
});
