import type { Booking, BookingTerms } from "../../../src/shared/booking";

/** RFC 5545 TEXT escaping; untrusted text cannot create new content lines. */
export function calendarText(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}
/** Fold at UTF-8 character boundaries; continuation whitespace counts toward 75 octets. */
export function foldLine(line: string) {
  const encoder = new TextEncoder();
  let current = "",
    bytes = 0;
  const lines: string[] = [];
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    if (bytes + size > 75) {
      lines.push(current);
      current = " ";
      bytes = 1;
    }
    current += ch;
    bytes += size;
  }
  lines.push(current);
  return lines.join("\r\n");
}
const utc = (time: number) =>
  new Date(time)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
export function bookingCalendar(input: {
  id: string;
  startsAt: number;
  endsAt: number;
  createdAt: number;
  updatedAt: number;
  version: number;
  status: Booking["status"];
  terms: BookingTerms;
}) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//KOVEYA//Service Booking//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${calendarText(input.id)}@calendar.koveya.invalid`,
    `DTSTAMP:${utc(input.updatedAt)}`,
    `CREATED:${utc(input.createdAt)}`,
    `LAST-MODIFIED:${utc(input.updatedAt)}`,
    `DTSTART:${utc(input.startsAt)}`,
    `DTEND:${utc(input.endsAt)}`,
    `SEQUENCE:${input.version - 1}`,
    `STATUS:${input.status === "CANCELLED" ? "CANCELLED" : "CONFIRMED"}`,
    "CLASS:PRIVATE",
    `SUMMARY:${calendarText(input.terms.serviceName)}`,
    `LOCATION:${calendarText(input.terms.locationLabel)}`,
    `DESCRIPTION:${calendarText(`Provider: ${input.terms.providerName}\nService timezone: ${input.terms.timezone}\nBooking status: ${input.status}\nThis export is a snapshot; check KOVEYA for updates.`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
