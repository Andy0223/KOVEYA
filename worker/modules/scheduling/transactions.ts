import type { Context } from "hono";
import type { Environment } from "../../environment";
import { ApiError, ok } from "../../http";
import { hashToken } from "../identity/crypto";

export async function receipt(
  c: Context<Environment>,
  operation: string,
  value: unknown,
) {
  const key = c.req.header("Idempotency-Key") ?? "";
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(key))
    throw new ApiError("IDEMPOTENCY_REQUIRED", 400);
  const hash = await hashToken(JSON.stringify(value)),
    user = c.get("userId"),
    db = c.env.DB;
  async function replay() {
    const row = await db
      .prepare(
        "SELECT request_hash AS hash,result_ref AS id FROM idempotency_records WHERE actor_id=? AND operation=? AND key=?",
      )
      .bind(user, operation, key)
      .first<{ hash: string; id: string }>();
    if (row && row.hash !== hash)
      throw new ApiError("IDEMPOTENCY_CONFLICT", 409);
    return row ? { id: row.id } : null;
  }
  return {
    replay,
    // A concurrent identical mutation may finish between the initial receipt read
    // and a state/availability precheck. Replay its committed result in that case.
    async respond(work: () => Promise<Response>): Promise<Response> {
      try {
        return await work();
      } catch (error) {
        if (error instanceof ApiError) {
          const previous = await replay();
          if (previous) return ok(c, previous);
        }
        throw error;
      }
    },
    async commit(id: string, statements: D1PreparedStatement[]) {
      try {
        await db.batch([
          db
            .prepare(
              "INSERT INTO idempotency_records (actor_id,operation,key,request_hash,result_ref,created_at) VALUES (?,?,?,?,?,?)",
            )
            .bind(user, operation, key, hash, id, Date.now()),
          ...statements,
        ]);
        return { id };
      } catch (error) {
        const previous = await replay();
        if (previous) return previous;
        const message = String(error);
        if (message.includes("transaction_guard_check"))
          throw new ApiError("STATE_CONFLICT", 409);
        if (message.includes("booking_allocations"))
          throw new ApiError("SLOT_UNAVAILABLE", 409);
        throw error;
      }
    },
  };
}
export function eventStatements(
  db: D1Database,
  org: string,
  booking: string,
  user: string,
  event: string,
  payload: unknown,
  now: number,
) {
  return [
    db
      .prepare(
        "INSERT INTO booking_events (id,booking_id,org_id,actor_id,event_type,payload,created_at) VALUES (?,?,?,?,?,?,?)",
      )
      .bind(
        crypto.randomUUID(),
        booking,
        org,
        user,
        event,
        JSON.stringify(payload),
        now,
      ),
    db
      .prepare(
        "INSERT INTO outbox_events (id,org_id,event_type,payload,status,attempts,next_attempt_at,created_at) VALUES (?,?,?,?,'PENDING',0,?,?)",
      )
      .bind(
        crypto.randomUUID(),
        org,
        event,
        JSON.stringify({ bookingId: booking, ...(payload as object) }),
        now,
        now,
      ),
    db
      .prepare(
        "INSERT INTO audit_logs (id,actor_id,org_id,action,entity_id,created_at) VALUES (?,?,?,?,?,?)",
      )
      .bind(crypto.randomUUID(), user, org, event, booking, now),
  ];
}
