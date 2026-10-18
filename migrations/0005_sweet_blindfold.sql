CREATE TABLE `booking_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`offering_id` text NOT NULL,
	`client_id` text NOT NULL,
	`starts_at` integer NOT NULL,
	`original_starts_at` integer NOT NULL,
	`terms_snapshot` text NOT NULL,
	`status` text DEFAULT 'SUBMITTED' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`booking_id` text,
	`last_mutation_id` text,
	FOREIGN KEY (`booking_id`,`org_id`) REFERENCES `bookings`(`id`,`org_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`offering_id`,`org_id`) REFERENCES `offerings`(`id`,`org_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`,`org_id`) REFERENCES `client_relationships`(`id`,`org_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "request_state_check" CHECK("booking_requests"."status" IN ('SUBMITTED','COUNTER_PROPOSED','ACCEPTED','REJECTED','WITHDRAWN','DECLINED','EXPIRED')),
	CONSTRAINT "request_values_check" CHECK("booking_requests"."version">0 AND "booking_requests"."starts_at"%900000=0 AND "booking_requests"."original_starts_at"%900000=0 AND json_valid("booking_requests"."terms_snapshot"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `request_tenant_uq` ON `booking_requests` (`id`,`org_id`);--> statement-breakpoint
CREATE INDEX `request_due_idx` ON `booking_requests` (`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`event_type` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`read_at` integer,
	FOREIGN KEY (`event_id`) REFERENCES `outbox_events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "notification_entity_check" CHECK("notifications"."entity_type" IN ('BOOKING','REQUEST'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_delivery_uq` ON `notifications` (`event_id`,`recipient_id`);--> statement-breakpoint
CREATE INDEX `notification_recipient_idx` ON `notifications` (`recipient_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `request_events` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`org_id` text NOT NULL,
	`actor_id` text,
	`event_type` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`request_id`,`org_id`) REFERENCES `booking_requests`(`id`,`org_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `outbox_events` ADD `last_error` text;