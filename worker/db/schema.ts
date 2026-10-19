import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// UTC timestamps are epoch milliseconds. Wall-clock rules remain local to an IANA timezone.
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  locale: text("locale").notNull().default("zh-TW"),
  timezone: text("timezone").notNull().default("Asia/Taipei"),
  status: text("status", { enum: ["ACTIVE", "SUSPENDED", "DELETED"] })
    .notNull()
    .default("ACTIVE"),
  createdAt: integer("created_at").notNull(),
});

export const identities = sqliteTable(
  "identities",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    provider: text("provider").notNull(),
    subject: text("provider_subject").notNull(),
  },
  (t) => [uniqueIndex("identities_subject_uq").on(t.provider, t.subject)],
);

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: integer("expires_at").notNull(),
  revokedAt: integer("revoked_at"),
});

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id")
    .references(() => users.id)
    .unique(),
  name: text("name").notNull(),
  status: text("status", { enum: ["ACTIVE", "SUSPENDED"] })
    .notNull()
    .default("ACTIVE"),
  createdAt: integer("created_at").notNull(),
});

export const organizationMembers = sqliteTable(
  "organization_members",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role", { enum: ["OWNER", "ADMIN", "STAFF"] }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] })],
);

export const providerProfiles = sqliteTable(
  "provider_profiles",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    publicName: text("public_name").notNull(),
    slug: text("slug").notNull(),
    bio: text("bio").notNull().default(""),
    locationLabel: text("location_label").notNull().default(""),
    timezone: text("timezone").notNull(),
    published: integer("published", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (t) => [
    uniqueIndex("provider_slug_uq").on(t.slug),
    uniqueIndex("provider_org_uq").on(t.orgId),
  ],
);

export const services = sqliteTable(
  "services",
  {
    id: text("id").primaryKey(),
    revision: integer("revision").notNull().default(1),
    lastMutationId: text("last_mutation_id"),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    mode: text("mode", { enum: ["INSTANT", "REQUEST"] }).notNull(),
    status: text("status", {
      enum: ["DRAFT", "PUBLISHED", "UNPUBLISHED", "ARCHIVED"],
    })
      .notNull()
      .default("DRAFT"),
    delivery: text("delivery", {
      enum: ["ONLINE", "IN_PERSON", "AT_CLIENT"],
    }).notNull(),
    locationLabel: text("location_label").notNull().default(""),
    timezone: text("timezone").notNull(),
    cancellationNoticeMinutes: integer("cancellation_notice_minutes")
      .notNull()
      .default(1440),
    cancellationPolicy: text("cancellation_policy").notNull(),
    policyVersion: integer("policy_version").notNull().default(1),
    minNoticeMinutes: integer("min_notice_minutes").notNull().default(1440),
    maxAdvanceDays: integer("max_advance_days").notNull().default(60),
    bufferBeforeMinutes: integer("buffer_before_minutes").notNull().default(0),
    bufferAfterMinutes: integer("buffer_after_minutes").notNull().default(0),
  },
  (t) => [
    uniqueIndex("services_tenant_uq").on(t.id, t.orgId),
    index("services_org_idx").on(t.orgId, t.status),
    check(
      "service_rules_check",
      sql`${t.minNoticeMinutes} >= 0 AND ${t.maxAdvanceDays} > 0 AND ${t.cancellationNoticeMinutes} >= 0 AND ${t.policyVersion} > 0`,
    ),
    check(
      "service_buffer_check",
      sql`${t.bufferBeforeMinutes} >= 0 AND ${t.bufferBeforeMinutes} % 15 = 0 AND ${t.bufferAfterMinutes} >= 0 AND ${t.bufferAfterMinutes} % 15 = 0`,
    ),
    check("service_mode_check", sql`${t.mode} IN ('INSTANT','REQUEST')`),
    check(
      "service_status_check",
      sql`${t.status} IN ('DRAFT','PUBLISHED','UNPUBLISHED','ARCHIVED')`,
    ),
    check(
      "service_delivery_check",
      sql`${t.delivery} IN ('ONLINE','IN_PERSON','AT_CLIENT')`,
    ),
  ],
);

export const emailChallenges = sqliteTable("email_challenges", {
  tokenHash: text("token_hash").primaryKey(),
  browserHash: text("browser_hash").notNull(),
  email: text("email").notNull(),
  returnTo: text("return_to").notNull(),
  locale: text("locale").notNull(),
  expiresAt: integer("expires_at").notNull(),
  consumedAt: integer("consumed_at"),
  consumedNonce: text("consumed_nonce"),
});

export const rateLimitBuckets = sqliteTable("rate_limit_buckets", {
  key: text("key").primaryKey(),
  hits: integer("hits").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  actorId: text("actor_id")
    .notNull()
    .references(() => users.id),
  orgId: text("org_id").references(() => organizations.id),
  action: text("action").notNull(),
  entityId: text("entity_id").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const privacyRequests = sqliteTable("privacy_requests", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  type: text("type", { enum: ["EXPORT", "DELETE"] }).notNull(),
  status: text("status", {
    enum: ["SUBMITTED", "PROCESSING", "COMPLETED", "REJECTED"],
  })
    .notNull()
    .default("SUBMITTED"),
  createdAt: integer("created_at").notNull(),
});

export const offerings = sqliteTable(
  "offerings",
  {
    id: text("id").primaryKey(),
    serviceId: text("service_id").notNull(),
    orgId: text("org_id").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    pricingType: text("pricing_type", {
      enum: ["FIXED", "FREE", "QUOTE"],
    }).notNull(),
    priceMinor: integer("price_minor"),
    currency: text("currency").notNull(),
  },
  (t) => [
    uniqueIndex("offering_tenant_uq").on(t.id, t.orgId),
    foreignKey({
      columns: [t.serviceId, t.orgId],
      foreignColumns: [services.id, services.orgId],
    }),
    check(
      "duration_check",
      sql`${t.durationMinutes} > 0 AND ${t.durationMinutes} % 15 = 0`,
    ),
    check(
      "currency_shape_check",
      sql`length(${t.currency}) = 3 AND ${t.currency} NOT GLOB '*[^A-Z]*'`,
    ),
    check(
      "pricing_check",
      sql`(${t.pricingType} = 'FIXED' AND ${t.priceMinor} IS NOT NULL AND ${t.priceMinor} > 0) OR (${t.pricingType} = 'FREE' AND ${t.priceMinor} IS NOT NULL AND ${t.priceMinor} = 0) OR (${t.pricingType} = 'QUOTE' AND ${t.priceMinor} IS NULL)`,
    ),
  ],
);

export const resources = sqliteTable(
  "resources",
  {
    revision: integer("revision").notNull().default(1),
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    timezone: text("timezone").notNull(),
  },
  (t) => [uniqueIndex("resource_tenant_uq").on(t.id, t.orgId)],
);

export const availabilityRules = sqliteTable(
  "availability_rules",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    resourceId: text("resource_id").notNull(),
    weekday: integer("weekday").notNull(),
    startLocalMinute: integer("start_local_minute").notNull(),
    endLocalMinute: integer("end_local_minute").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.resourceId, t.orgId],
      foreignColumns: [resources.id, resources.orgId],
    }),
    check("availability_day_check", sql`${t.weekday} BETWEEN 0 AND 6`),
    check(
      "availability_range_check",
      sql`${t.startLocalMinute} >= 0 AND ${t.endLocalMinute} <= 1440 AND ${t.startLocalMinute} < ${t.endLocalMinute} AND ${t.startLocalMinute} % 15 = 0 AND ${t.endLocalMinute} % 15 = 0`,
    ),
  ],
);

export const clients = sqliteTable(
  "client_relationships",
  {
    phone: text("phone"),
    revision: integer("revision").notNull().default(1),
    createdAt: integer("created_at").notNull().default(0),
    updatedAt: integer("updated_at").notNull().default(0),
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    userId: text("user_id").references(() => users.id),
    name: text("name").notNull(),
    email: text("email"),
  },
  (t) => [
    uniqueIndex("client_tenant_uq").on(t.id, t.orgId),
    uniqueIndex("client_user_org_uq").on(t.orgId, t.userId),
  ],
);

export const bookings = sqliteTable(
  "bookings",
  {
    source: text("source", { enum: ["CUSTOMER", "PROVIDER_RECORDED"] })
      .notNull()
      .default("CUSTOMER"),
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    offeringId: text("offering_id").notNull(),
    clientId: text("client_id").notNull(),
    startsAt: integer("starts_at").notNull(),
    endsAt: integer("ends_at").notNull(),
    status: text("status", {
      enum: ["CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"],
    }).notNull(),
    // Immutable agreed or provider-reported terms, independent of live service settings.
    termsSnapshot: text("terms_snapshot", { mode: "json" }).notNull(),
    createdAt: integer("created_at").notNull(),
    version: integer("version").notNull().default(1),
  },
  (t) => [
    uniqueIndex("booking_tenant_uq").on(t.id, t.orgId),
    index("booking_org_start_idx").on(t.orgId, t.startsAt),
    index("booking_client_start_idx").on(t.orgId, t.clientId, t.startsAt),
    foreignKey({
      columns: [t.offeringId, t.orgId],
      foreignColumns: [offerings.id, offerings.orgId],
    }),
    foreignKey({
      columns: [t.clientId, t.orgId],
      foreignColumns: [clients.id, clients.orgId],
    }),
    check(
      "booking_time_check",
      sql`${t.endsAt} > ${t.startsAt} AND ${t.startsAt} % 900000 = 0 AND ${t.endsAt} % 900000 = 0`,
    ),
    check(
      "booking_status_check",
      sql`${t.status} IN ('CONFIRMED','COMPLETED','CANCELLED','NO_SHOW')`,
    ),
    check("booking_snapshot_check", sql`json_valid(${t.termsSnapshot})`),
  ],
);

export const bookingAllocations = sqliteTable(
  "booking_allocations",
  {
    orgId: text("org_id").notNull(),
    bookingId: text("booking_id").notNull(),
    resourceId: text("resource_id").notNull(),
    slotStartUtc: integer("slot_start_utc").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.resourceId, t.slotStartUtc] }),
    foreignKey({
      columns: [t.bookingId, t.orgId],
      foreignColumns: [bookings.id, bookings.orgId],
    }),
    foreignKey({
      columns: [t.resourceId, t.orgId],
      foreignColumns: [resources.id, resources.orgId],
    }),
    check("slot_alignment_check", sql`${t.slotStartUtc} % 900000 = 0`),
  ],
);

export const outboxEvents = sqliteTable(
  "outbox_events",
  {
    lastError: text("last_error"),
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    eventType: text("event_type").notNull(),
    payload: text("payload", { mode: "json" }).notNull(),
    status: text("status", {
      enum: ["PENDING", "PROCESSING", "SENT", "FAILED"],
    })
      .notNull()
      .default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: integer("next_attempt_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("outbox_due_idx").on(t.status, t.nextAttemptAt)],
);

export const idempotencyRecords = sqliteTable(
  "idempotency_records",
  {
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id),
    operation: text("operation").notNull(),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    resultRef: text("result_ref").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.actorId, t.operation, t.key] })],
);

// One shared personal resource per service in this MVP.
export const serviceResources = sqliteTable(
  "service_resources",
  {
    serviceId: text("service_id").primaryKey(),
    orgId: text("org_id").notNull(),
    resourceId: text("resource_id").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.serviceId, t.orgId],
      foreignColumns: [services.id, services.orgId],
    }),
    foreignKey({
      columns: [t.resourceId, t.orgId],
      foreignColumns: [resources.id, resources.orgId],
    }),
  ],
);
export const availabilityExceptions = sqliteTable(
  "availability_exceptions",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    resourceId: text("resource_id").notNull(),
    date: text("date").notNull(),
    intervals: text("intervals", { mode: "json" }).notNull(),
  },
  (t) => [
    uniqueIndex("availability_exception_uq").on(t.resourceId, t.date),
    foreignKey({
      columns: [t.resourceId, t.orgId],
      foreignColumns: [resources.id, resources.orgId],
    }),
    check("exception_json_check", sql`json_valid(${t.intervals})`),
  ],
);
// A failed assertion aborts the whole D1 batch, including any earlier writes.
export const transactionGuards = sqliteTable(
  "transaction_guards",
  {
    id: text("id").primaryKey(),
    passed: integer("passed").notNull(),
  },
  (t) => [check("transaction_guard_check", sql`${t.passed} = 1`)],
);
export const bookingEvents = sqliteTable(
  "booking_events",
  {
    id: text("id").primaryKey(),
    bookingId: text("booking_id").notNull(),
    orgId: text("org_id").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id),
    eventType: text("event_type").notNull(),
    payload: text("payload", { mode: "json" }).notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("booking_events_timeline_idx").on(t.bookingId, t.orgId, t.createdAt),
    foreignKey({
      columns: [t.bookingId, t.orgId],
      foreignColumns: [bookings.id, bookings.orgId],
    }),
  ],
);
export const rescheduleRequests = sqliteTable(
  "reschedule_requests",
  {
    id: text("id").primaryKey(),
    bookingId: text("booking_id").notNull(),
    orgId: text("org_id").notNull(),
    proposerId: text("proposer_id")
      .notNull()
      .references(() => users.id),
    responderId: text("responder_id")
      .notNull()
      .references(() => users.id),
    bookingVersion: integer("booking_version").notNull(),
    startsAt: integer("starts_at").notNull(),
    status: text("status").notNull().default("PENDING"),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.bookingId, t.orgId],
      foreignColumns: [bookings.id, bookings.orgId],
    }),
    check(
      "reschedule_status_check",
      sql`${t.status} IN ('PENDING','ACCEPTED','REJECTED','EXPIRED','CANCELLED')`,
    ),
    check(
      "reschedule_time_check",
      sql`${t.startsAt} % 900000 = 0 AND ${t.bookingVersion} > 0`,
    ),
    index("reschedule_booking_idx").on(t.bookingId, t.status),
  ],
);

export const bookingRequests = sqliteTable(
  "booking_requests",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    offeringId: text("offering_id").notNull(),
    clientId: text("client_id").notNull(),
    startsAt: integer("starts_at").notNull(),
    originalStartsAt: integer("original_starts_at").notNull(),
    termsSnapshot: text("terms_snapshot", { mode: "json" }).notNull(),
    status: text("status").notNull().default("SUBMITTED"),
    version: integer("version").notNull().default(1),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
    bookingId: text("booking_id"),
    lastMutationId: text("last_mutation_id"),
  },
  (t) => [
    uniqueIndex("request_tenant_uq").on(t.id, t.orgId),
    foreignKey({
      columns: [t.bookingId, t.orgId],
      foreignColumns: [bookings.id, bookings.orgId],
    }),
    index("request_due_idx").on(t.status, t.expiresAt),
    foreignKey({
      columns: [t.offeringId, t.orgId],
      foreignColumns: [offerings.id, offerings.orgId],
    }),
    foreignKey({
      columns: [t.clientId, t.orgId],
      foreignColumns: [clients.id, clients.orgId],
    }),
    check(
      "request_state_check",
      sql`${t.status} IN ('SUBMITTED','COUNTER_PROPOSED','ACCEPTED','REJECTED','WITHDRAWN','DECLINED','EXPIRED')`,
    ),
    check(
      "request_values_check",
      sql`${t.version}>0 AND ${t.startsAt}%900000=0 AND ${t.originalStartsAt}%900000=0 AND json_valid(${t.termsSnapshot})`,
    ),
  ],
);
export const requestEvents = sqliteTable(
  "request_events",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id").notNull(),
    orgId: text("org_id").notNull(),
    actorId: text("actor_id").references(() => users.id),
    eventType: text("event_type").notNull(),
    payload: text("payload", { mode: "json" }).notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.requestId, t.orgId],
      foreignColumns: [bookingRequests.id, bookingRequests.orgId],
    }),
  ],
);
export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => outboxEvents.id),
    recipientId: text("recipient_id")
      .notNull()
      .references(() => users.id),
    eventType: text("event_type").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    createdAt: integer("created_at").notNull(),
    readAt: integer("read_at"),
  },
  (t) => [
    uniqueIndex("notification_delivery_uq").on(t.eventId, t.recipientId),
    index("notification_recipient_idx").on(t.recipientId, t.createdAt),
    check(
      "notification_entity_check",
      sql`${t.entityType} IN ('BOOKING','REQUEST')`,
    ),
  ],
);
