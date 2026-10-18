import type { Schedule } from "../../../src/shared/booking";
import { allocationSlots } from "./slots";

const DAY = 86_400_000;
export function validDate(date: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date
  );
}
export function addDays(date: string, days: number) {
  return new Date(Date.parse(date) + days * DAY).toISOString().slice(0, 10);
}
export function localClock(timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const cache = new Map<
    number,
    { date: string; minute: number; weekday: number }
  >();
  return (timestamp: number) => {
    let value = cache.get(timestamp);
    if (!value) {
      const parts = Object.fromEntries(
        formatter.formatToParts(timestamp).map((p) => [p.type, p.value]),
      );
      const date = `${parts.year}-${parts.month}-${parts.day}`;
      value = {
        date,
        minute: Number(parts.hour) * 60 + Number(parts.minute),
        weekday: new Date(date).getUTCDay(),
      };
      cache.set(timestamp, value);
    }
    return value;
  };
}
export interface SlotPolicy {
  timezone: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minNoticeMinutes: number;
  maxAdvanceDays: number;
}
/** SCH-001–008: enumerate UTC instants, so DST folds stay distinct and gaps never become fake times. */
export function availableSlots(
  date: string,
  schedule: Schedule,
  policy: SlotPolicy,
  occupied: Set<number>,
  now = Date.now(),
) {
  if (!validDate(date)) throw new RangeError("Invalid date");
  const serviceClock = localClock(policy.timezone),
    resourceClock = localClock(schedule.timezone);
  const today = serviceClock(now).date;
  if (date < today || date > addDays(today, policy.maxAdvanceDays)) return [];
  function open(timestamp: number) {
    if (occupied.has(timestamp)) return false;
    const local = resourceClock(timestamp);
    const exception = schedule.exceptions.find((e) => e.date === local.date);
    const intervals = exception
      ? exception.intervals
      : schedule.rules.filter((r) => r.weekday === local.weekday);
    // Each complete 15-minute allocation must fit working hours, including buffers.
    return intervals.some(
      (i) => local.minute >= i.start && local.minute + 15 <= i.end,
    );
  }
  const slots: number[] = [],
    midnight = Date.parse(date);
  for (
    let start = midnight - 14 * 3_600_000;
    start < midnight + 38 * 3_600_000;
    start += 900_000
  ) {
    if (
      start <= now ||
      start < now + policy.minNoticeMinutes * 60_000 ||
      serviceClock(start).date !== date
    )
      continue;
    if (
      allocationSlots(
        start,
        policy.durationMinutes,
        policy.bufferBeforeMinutes,
        policy.bufferAfterMinutes,
      ).every(open)
    )
      slots.push(start);
  }
  return slots;
}
