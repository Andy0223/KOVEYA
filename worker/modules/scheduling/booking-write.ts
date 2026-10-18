import type { BookingTerms } from "../../../src/shared/booking";
import type { BookableService } from "./repository";
import { allocationSlots } from "./slots";
import { eventStatements } from "./transactions";
export function termsFor(service: BookableService, now: number): BookingTerms {
  if (service.priceMinor === null)
    throw new Error("An agreed price is required");
  return {
    serviceId: service.id,
    serviceRevision: service.revision,
    serviceName: service.name,
    providerName: service.providerName,
    providerSlug: service.providerSlug,
    resourceId: service.resourceId,
    timezone: service.timezone,
    locationLabel: service.locationLabel,
    durationMinutes: service.durationMinutes,
    bufferBeforeMinutes: service.bufferBeforeMinutes,
    bufferAfterMinutes: service.bufferAfterMinutes,
    priceMinor: service.priceMinor,
    currency: service.currency,
    cancellationPolicy: service.cancellationPolicy,
    cancellationNoticeMinutes: service.cancellationNoticeMinutes,
    minNoticeMinutes: service.minNoticeMinutes,
    maxAdvanceDays: service.maxAdvanceDays,
    paymentMethod: "ARRANGED_WITH_PROVIDER",
    acceptedAt: now,
  };
}
export function clientStatement(db: D1Database, orgId: string, user: string) {
  return db
    .prepare(
      `INSERT INTO client_relationships (id,org_id,user_id,name,email)
    SELECT ?,?,u.id,u.name,i.provider_subject FROM users u JOIN identities i ON i.user_id=u.id AND i.provider='email' WHERE u.id=?
    ON CONFLICT(org_id,user_id) DO NOTHING`,
    )
    .bind(crypto.randomUUID(), orgId, user);
}
export function bookingStatements(
  db: D1Database,
  id: string,
  orgId: string,
  offeringId: string,
  clientUser: string,
  actor: string,
  start: number,
  terms: BookingTerms,
  now: number,
) {
  const end = start + terms.durationMinutes * 60_000;
  return [
    db
      .prepare(
        `INSERT INTO bookings (id,org_id,offering_id,client_id,starts_at,ends_at,status,terms_snapshot,created_at,version)
      SELECT ?,?,?,id,?,?,'CONFIRMED',?,?,1 FROM client_relationships WHERE org_id=? AND user_id=?`,
      )
      .bind(
        id,
        orgId,
        offeringId,
        start,
        end,
        JSON.stringify(terms),
        now,
        orgId,
        clientUser,
      ),
    db
      .prepare(
        "INSERT INTO booking_allocations (org_id,booking_id,resource_id,slot_start_utc) SELECT ?,?,?,value FROM json_each(?)",
      )
      .bind(
        orgId,
        id,
        terms.resourceId,
        JSON.stringify(
          allocationSlots(
            start,
            terms.durationMinutes,
            terms.bufferBeforeMinutes,
            terms.bufferAfterMinutes,
          ),
        ),
      ),
    ...eventStatements(
      db,
      orgId,
      id,
      actor,
      "booking.confirmed",
      { startsAt: start, endsAt: end },
      now,
    ),
  ];
}
