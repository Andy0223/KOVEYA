CREATE TABLE `availability_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`resource_id` text NOT NULL,
	`weekday` integer NOT NULL,
	`start_local_minute` integer NOT NULL,
	`end_local_minute` integer NOT NULL,
	FOREIGN KEY (`resource_id`,`org_id`) REFERENCES `resources`(`id`,`org_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "availability_day_check" CHECK("availability_rules"."weekday" BETWEEN 0 AND 6),
	CONSTRAINT "availability_range_check" CHECK("availability_rules"."start_local_minute" >= 0 AND "availability_rules"."end_local_minute" <= 1440 AND "availability_rules"."start_local_minute" < "availability_rules"."end_local_minute" AND "availability_rules"."start_local_minute" % 15 = 0 AND "availability_rules"."end_local_minute" % 15 = 0)
);
--> statement-breakpoint
CREATE TABLE `booking_allocations` (
	`org_id` text NOT NULL,
	`booking_id` text NOT NULL,
	`resource_id` text NOT NULL,
	`slot_start_utc` integer NOT NULL,
	PRIMARY KEY(`resource_id`, `slot_start_utc`),
	FOREIGN KEY (`booking_id`,`org_id`) REFERENCES `bookings`(`id`,`org_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resource_id`,`org_id`) REFERENCES `resources`(`id`,`org_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "slot_alignment_check" CHECK("booking_allocations"."slot_start_utc" % 900000 = 0)
);
--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`offering_id` text NOT NULL,
	`client_id` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`status` text NOT NULL,
	`terms_snapshot` text NOT NULL,
	`created_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`offering_id`,`org_id`) REFERENCES `offerings`(`id`,`org_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`,`org_id`) REFERENCES `client_relationships`(`id`,`org_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "booking_time_check" CHECK("bookings"."ends_at" > "bookings"."starts_at" AND "bookings"."starts_at" % 900000 = 0 AND "bookings"."ends_at" % 900000 = 0),
	CONSTRAINT "booking_status_check" CHECK("bookings"."status" IN ('CONFIRMED','COMPLETED','CANCELLED','NO_SHOW')),
	CONSTRAINT "booking_snapshot_check" CHECK(json_valid("bookings"."terms_snapshot"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `booking_tenant_uq` ON `bookings` (`id`,`org_id`);--> statement-breakpoint
CREATE INDEX `booking_org_start_idx` ON `bookings` (`org_id`,`starts_at`);--> statement-breakpoint
CREATE TABLE `client_relationships` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`email` text,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `client_tenant_uq` ON `client_relationships` (`id`,`org_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `client_user_org_uq` ON `client_relationships` (`org_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `idempotency_records` (
	`actor_id` text NOT NULL,
	`operation` text NOT NULL,
	`key` text NOT NULL,
	`request_hash` text NOT NULL,
	`result_ref` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`actor_id`, `operation`, `key`),
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `identities` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_subject` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `identities_subject_uq` ON `identities` (`provider`,`provider_subject`);--> statement-breakpoint
CREATE TABLE `offerings` (
	`id` text PRIMARY KEY NOT NULL,
	`service_id` text NOT NULL,
	`org_id` text NOT NULL,
	`duration_minutes` integer NOT NULL,
	`pricing_type` text NOT NULL,
	`price_minor` integer,
	`currency` text NOT NULL,
	FOREIGN KEY (`service_id`,`org_id`) REFERENCES `services`(`id`,`org_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "duration_check" CHECK("offerings"."duration_minutes" > 0 AND "offerings"."duration_minutes" % 15 = 0),
	CONSTRAINT "currency_shape_check" CHECK(length("offerings"."currency") = 3 AND "offerings"."currency" NOT GLOB '*[^A-Z]*'),
	CONSTRAINT "pricing_check" CHECK(("offerings"."pricing_type" = 'FIXED' AND "offerings"."price_minor" IS NOT NULL AND "offerings"."price_minor" > 0) OR ("offerings"."pricing_type" = 'FREE' AND "offerings"."price_minor" = 0) OR ("offerings"."pricing_type" = 'QUOTE' AND "offerings"."price_minor" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `offering_tenant_uq` ON `offerings` (`id`,`org_id`);--> statement-breakpoint
CREATE TABLE `organization_members` (
	`org_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	PRIMARY KEY(`org_id`, `user_id`),
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `outbox_events` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`event_type` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `outbox_due_idx` ON `outbox_events` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `provider_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`public_name` text NOT NULL,
	`slug` text NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`location_label` text DEFAULT '' NOT NULL,
	`timezone` text NOT NULL,
	`published` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_slug_uq` ON `provider_profiles` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `provider_org_uq` ON `provider_profiles` (`org_id`);--> statement-breakpoint
CREATE TABLE `resources` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`timezone` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resource_tenant_uq` ON `resources` (`id`,`org_id`);--> statement-breakpoint
CREATE TABLE `services` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`mode` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`delivery` text NOT NULL,
	`location_label` text DEFAULT '' NOT NULL,
	`timezone` text NOT NULL,
	`cancellation_notice_minutes` integer DEFAULT 1440 NOT NULL,
	`cancellation_policy` text NOT NULL,
	`policy_version` integer DEFAULT 1 NOT NULL,
	`min_notice_minutes` integer DEFAULT 1440 NOT NULL,
	`max_advance_days` integer DEFAULT 60 NOT NULL,
	`buffer_before_minutes` integer DEFAULT 0 NOT NULL,
	`buffer_after_minutes` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "service_rules_check" CHECK("services"."min_notice_minutes" >= 0 AND "services"."max_advance_days" > 0 AND "services"."cancellation_notice_minutes" >= 0 AND "services"."policy_version" > 0),
	CONSTRAINT "service_buffer_check" CHECK("services"."buffer_before_minutes" >= 0 AND "services"."buffer_before_minutes" % 15 = 0 AND "services"."buffer_after_minutes" >= 0 AND "services"."buffer_after_minutes" % 15 = 0),
	CONSTRAINT "service_mode_check" CHECK("services"."mode" IN ('INSTANT','REQUEST')),
	CONSTRAINT "service_status_check" CHECK("services"."status" IN ('DRAFT','PUBLISHED','UNPUBLISHED','ARCHIVED')),
	CONSTRAINT "service_delivery_check" CHECK("services"."delivery" IN ('ONLINE','IN_PERSON','AT_CLIENT'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `services_tenant_uq` ON `services` (`id`,`org_id`);--> statement-breakpoint
CREATE INDEX `services_org_idx` ON `services` (`org_id`,`status`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`locale` text DEFAULT 'zh-TW' NOT NULL,
	`timezone` text DEFAULT 'Asia/Taipei' NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` integer NOT NULL
);
