CREATE TABLE `reschedule_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`org_id` text NOT NULL,
	`proposer_id` text NOT NULL,
	`responder_id` text NOT NULL,
	`booking_version` integer NOT NULL,
	`starts_at` integer NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`proposer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`responder_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`booking_id`,`org_id`) REFERENCES `bookings`(`id`,`org_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "reschedule_status_check" CHECK("reschedule_requests"."status" IN ('PENDING','ACCEPTED','REJECTED','EXPIRED','CANCELLED')),
	CONSTRAINT "reschedule_time_check" CHECK("reschedule_requests"."starts_at" % 900000 = 0 AND "reschedule_requests"."booking_version" > 0)
);
--> statement-breakpoint
CREATE INDEX `reschedule_booking_idx` ON `reschedule_requests` (`booking_id`,`status`);