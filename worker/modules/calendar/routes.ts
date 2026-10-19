import { Hono } from "hono";
import type { Environment } from "../../environment";
import type { BookingTerms } from "../../../src/shared/booking";
import { requireUser } from "../identity/session";
import { ownedBooking } from "../scheduling/bookings";
import { bookingCalendar } from "./ical";
export const calendarRoutes = new Hono<Environment>();
calendarRoutes.get("/bookings/:id/calendar.ics", requireUser, async (c) => {
  const row = await ownedBooking(c.env.DB, c.req.param("id"), c.get("userId"));
  c.header("Content-Type", "text/calendar; charset=utf-8");
  c.header("Content-Disposition", 'attachment; filename="koveya-booking.ics"');
  c.header("Cache-Control", "private, no-store");
  return c.body(
    bookingCalendar({ ...row, terms: JSON.parse(row.terms) as BookingTerms }),
  );
});
