import { describe, expect, it } from "vitest";
import {
  bookingCalendar,
  calendarText,
  foldLine,
} from "../worker/modules/calendar/ical";
import type { BookingTerms } from "../src/shared/booking";
const terms = {
  serviceName: "私人教學",
  providerName: "教練",
  locationLabel: "Taipei",
  timezone: "Asia/Taipei",
} as BookingTerms;
describe("RFC 5545 calendar serialization", () => {
  it("escapes text delimiters and raw newlines without property injection", () => {
    expect(calendarText("A\\B;C,D\r\nATTENDEE:mailto:bad@example.test")).toBe(
      "A\\\\B\\;C\\,D\\nATTENDEE:mailto:bad@example.test",
    );
  });
  it("folds multilingual UTF-8 to at most 75 octets without splitting characters", () => {
    const original = "SUMMARY:" + "台灣😀教練".repeat(80),
      folded = foldLine(original);
    for (const line of folded.split("\r\n"))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(original);
    expect(folded).not.toContain("�");
  });
  it("uses UTC, a private event, valid terminal status and no implicit invitations", () => {
    const text = bookingCalendar({
      id: "abc",
      startsAt: Date.parse("2026-11-01T06:30:00Z"),
      endsAt: Date.parse("2026-11-01T07:30:00Z"),
      createdAt: Date.parse("2026-10-19T00:00:00Z"),
      updatedAt: Date.parse("2026-10-20T01:00:00Z"),
      version: 3,
      status: "COMPLETED",
      terms: { ...terms, serviceName: "Test\nEND:VEVENT\nBEGIN:VEVENT" },
    });
    expect(text).toContain("DTSTART:20261101T063000Z\r\n");
    expect(text).toContain("DTEND:20261101T073000Z\r\n");
    expect(text).toContain("DTSTAMP:20261020T010000Z\r\n");
    expect(text).toContain("SEQUENCE:2\r\n");
    expect(text).toContain("STATUS:CONFIRMED\r\n");
    expect(text).toContain("CLASS:PRIVATE\r\n");
    expect(text.match(/^BEGIN:VEVENT$/gm)).toHaveLength(1);
    expect(text).not.toContain("ATTENDEE:");
    expect(text).not.toContain("METHOD:REQUEST");
    expect(text.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(text.replaceAll("\r\n", "")).not.toMatch(/[\r\n]/);
  });
});
