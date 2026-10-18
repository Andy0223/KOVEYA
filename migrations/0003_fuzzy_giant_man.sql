CREATE TABLE `availability_exceptions` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`resource_id` text NOT NULL,
	`date` text NOT NULL,
	`intervals` text NOT NULL,
	FOREIGN KEY (`resource_id`,`org_id`) REFERENCES `resources`(`id`,`org_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "exception_json_check" CHECK(json_valid("availability_exceptions"."intervals"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `availability_exception_uq` ON `availability_exceptions` (`resource_id`,`date`);--> statement-breakpoint
CREATE TABLE `booking_events` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`org_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`event_type` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`booking_id`,`org_id`) REFERENCES `bookings`(`id`,`org_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `service_resources` (
	`service_id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`resource_id` text NOT NULL,
	FOREIGN KEY (`service_id`,`org_id`) REFERENCES `services`(`id`,`org_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resource_id`,`org_id`) REFERENCES `resources`(`id`,`org_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `transaction_guards` (
	`id` text PRIMARY KEY NOT NULL,
	`passed` integer NOT NULL,
	CONSTRAINT "transaction_guard_check" CHECK("transaction_guards"."passed" = 1)
);
--> statement-breakpoint
ALTER TABLE `resources` ADD `revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
INSERT INTO service_resources (service_id, org_id, resource_id)
SELECT s.id, s.org_id, (SELECT r.id FROM resources r WHERE r.org_id=s.org_id ORDER BY r.id LIMIT 1)
FROM services s WHERE EXISTS (SELECT 1 FROM resources r WHERE r.org_id=s.org_id);
