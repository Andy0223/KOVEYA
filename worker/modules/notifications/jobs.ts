/** Bounded jobs: notification delivery is independent of the booking transaction. */
export async function expireRequests(db: D1Database, now = Date.now()) {
  const rows = await db
    .prepare(
      "SELECT id,org_id AS orgId,version FROM booking_requests WHERE status IN ('SUBMITTED','COUNTER_PROPOSED') AND expires_at<=? ORDER BY expires_at LIMIT 5",
    )
    .bind(now)
    .all<{ id: string; orgId: string; version: number }>();
  for (const row of rows.results) {
    const nonce = crypto.randomUUID();
    await db.batch([
      db
        .prepare(
          "UPDATE booking_requests SET status='EXPIRED',version=version+1,last_mutation_id=? WHERE id=? AND version=? AND status IN ('SUBMITTED','COUNTER_PROPOSED') AND expires_at<=?",
        )
        .bind(nonce, row.id, row.version, now),
      db
        .prepare(
          "INSERT INTO request_events (id,request_id,org_id,event_type,payload,created_at) SELECT ?,id,org_id,'request.expired','{}',? FROM booking_requests WHERE id=? AND last_mutation_id=?",
        )
        .bind(crypto.randomUUID(), now, row.id, nonce),
      db
        .prepare(
          "INSERT INTO outbox_events (id,org_id,event_type,payload,next_attempt_at,created_at) SELECT ?,org_id,'request.expired',json_object('requestId',id),?,? FROM booking_requests WHERE id=? AND last_mutation_id=?",
        )
        .bind(crypto.randomUUID(), now, now, row.id, nonce),
    ]);
  }
}
export async function dispatchNotifications(db: D1Database, now = Date.now()) {
  const events = await db
    .prepare(
      "SELECT id,event_type AS eventType,payload,attempts FROM outbox_events WHERE status='PENDING' AND next_attempt_at<=? ORDER BY created_at,rowid LIMIT 10",
    )
    .bind(now)
    .all<{
      id: string;
      eventType: string;
      payload: string;
      attempts: number;
    }>();
  for (const event of events.results) {
    try {
      const payload = JSON.parse(event.payload) as {
        bookingId?: unknown;
        requestId?: unknown;
      };
      const request = event.eventType.startsWith("request."),
        entity = request ? payload.requestId : payload.bookingId;
      if (typeof entity !== "string") throw new Error("Invalid event target");
      const table = request ? "booking_requests" : "bookings";
      // Re-resolve the current authorized participants; never trust recipient IDs from an HTTP payload.
      const participants = `SELECT c.user_id AS user FROM ${table} b JOIN client_relationships c ON c.id=b.client_id AND c.org_id=b.org_id WHERE b.id=? AND b.org_id=e.org_id
        UNION SELECT o.owner_user_id AS user FROM ${table} b JOIN organizations o ON o.id=b.org_id AND o.status='ACTIVE' JOIN organization_members m ON m.org_id=o.id AND m.user_id=o.owner_user_id AND m.role='OWNER' WHERE b.id=? AND b.org_id=e.org_id`;
      await db.batch([
        db
          .prepare(
            `INSERT OR IGNORE INTO notifications (id,event_id,recipient_id,event_type,entity_type,entity_id,created_at)
          SELECT e.id||':'||u.id,e.id,u.id,e.event_type,?,?,e.created_at FROM outbox_events e JOIN users u ON u.status='ACTIVE'
          WHERE e.id=? AND e.status='PENDING' AND u.id IN (${participants})`,
          )
          .bind(
            request ? "REQUEST" : "BOOKING",
            entity,
            event.id,
            entity,
            entity,
          ),
        db
          .prepare(
            "UPDATE outbox_events SET status='SENT',last_error=NULL WHERE id=? AND status='PENDING'",
          )
          .bind(event.id),
      ]);
    } catch {
      // Persist a safe error category and bounded exponential retry; no private SQL/payload in logs.
      await db
        .prepare(
          "UPDATE outbox_events SET attempts=attempts+1,status=CASE WHEN attempts+1>=5 THEN 'FAILED' ELSE 'PENDING' END,next_attempt_at=?,last_error='IN_APP_DELIVERY_FAILED' WHERE id=? AND status='PENDING'",
        )
        .bind(now + Math.min(3_600_000, 30_000 * 2 ** event.attempts), event.id)
        .run();
    }
  }
}
export async function maintenance(db: D1Database, now = Date.now()) {
  try {
    await expireRequests(db, now);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "request.expiry_failed",
        name: error instanceof Error ? error.name : "Error",
      }),
    );
  }
  await dispatchNotifications(db, now);
}
