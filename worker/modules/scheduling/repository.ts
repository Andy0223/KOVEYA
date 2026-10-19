import type { Schedule } from "../../../src/shared/booking";
import { ApiError } from "../../http";
import { availableSlots, localClock } from "./availability";

export async function readSchedule(
  db: D1Database,
  resourceId: string,
): Promise<Schedule> {
  const resource = await db
    .prepare("SELECT revision, timezone FROM resources WHERE id = ?")
    .bind(resourceId)
    .first<{ revision: number; timezone: string }>();
  if (!resource) throw new ApiError("NOT_FOUND", 404);
  const rules = await db
    .prepare(
      "SELECT weekday, start_local_minute AS start, end_local_minute AS end FROM availability_rules WHERE resource_id = ? ORDER BY weekday, start_local_minute",
    )
    .bind(resourceId)
    .all<Schedule["rules"][number]>();
  const exceptions = await db
    .prepare(
      "SELECT date, intervals FROM availability_exceptions WHERE resource_id = ? ORDER BY date",
    )
    .bind(resourceId)
    .all<{ date: string; intervals: string }>();
  return {
    ...resource,
    rules: rules.results,
    exceptions: exceptions.results.map((e) => ({
      date: e.date,
      intervals: JSON.parse(e.intervals),
    })),
  };
}
export interface BookableService {
  id: string;
  orgId: string;
  revision: number;
  mode: string;
  name: string;
  timezone: string;
  locationLabel: string;
  cancellationPolicy: string;
  cancellationNoticeMinutes: number;
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  offeringId: string;
  durationMinutes: number;
  pricingType: string;
  priceMinor: number | null;
  currency: string;
  resourceId: string;
  providerName: string;
  providerSlug: string;
}
export async function bookableService(
  db: D1Database,
  serviceId: string,
  offeringId: string,
  ownedOrgId?: string,
) {
  const row = await db
    .prepare(
      `SELECT s.id, s.org_id AS orgId, s.revision, s.mode, s.name, s.timezone, s.location_label AS locationLabel,
    s.cancellation_policy AS cancellationPolicy, s.cancellation_notice_minutes AS cancellationNoticeMinutes,
    s.min_notice_minutes AS minNoticeMinutes, s.max_advance_days AS maxAdvanceDays,
    s.buffer_before_minutes AS bufferBeforeMinutes, s.buffer_after_minutes AS bufferAfterMinutes,
    o.id AS offeringId, o.duration_minutes AS durationMinutes, o.pricing_type AS pricingType, o.price_minor AS priceMinor, o.currency,
    sr.resource_id AS resourceId, p.public_name AS providerName, p.slug AS providerSlug
    FROM services s JOIN offerings o ON o.service_id=s.id AND o.org_id=s.org_id
    JOIN service_resources sr ON sr.service_id=s.id AND sr.org_id=s.org_id
    JOIN organizations org ON org.id=s.org_id AND org.status='ACTIVE'
    JOIN provider_profiles p ON p.org_id=s.org_id
    WHERE s.id=? AND o.id=? AND ${ownedOrgId ? "s.org_id=? AND s.status='PUBLISHED'" : "s.status='PUBLISHED' AND p.published=1"}`,
    )
    .bind(
      ...(ownedOrgId
        ? [serviceId, offeringId, ownedOrgId]
        : [serviceId, offeringId]),
    )
    .first<BookableService>();
  if (!row) throw new ApiError("NOT_FOUND", 404);
  return row;
}
export async function slotsFor(
  db: D1Database,
  service: BookableService,
  date: string,
  now = Date.now(),
) {
  const schedule = await readSchedule(db, service.resourceId);
  // Bound the read to the date plus the largest permitted buffers and timezone offset.
  const midnight = Date.parse(date);
  const allocations = await db
    .prepare(
      "SELECT slot_start_utc AS slot FROM booking_allocations WHERE resource_id=? AND slot_start_utc>=? AND slot_start_utc<?",
    )
    .bind(
      service.resourceId,
      midnight - 2 * 86_400_000,
      midnight + 3 * 86_400_000,
    )
    .all<{ slot: number }>();
  return {
    schedule,
    slots: availableSlots(
      date,
      schedule,
      service,
      new Set(allocations.results.map((r) => r.slot)),
      now,
    ),
  };
}
export function dateOf(start: number, timezone: string) {
  return localClock(timezone)(start).date;
}
