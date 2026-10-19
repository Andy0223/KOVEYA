ALTER TABLE `bookings` ADD `source` text DEFAULT 'CUSTOMER' NOT NULL;--> statement-breakpoint
CREATE INDEX `booking_client_start_idx` ON `bookings` (`org_id`,`client_id`,`starts_at`);--> statement-breakpoint
ALTER TABLE `client_relationships` ADD `phone` text;--> statement-breakpoint
ALTER TABLE `client_relationships` ADD `revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `client_relationships` ADD `created_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `client_relationships` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `booking_events_timeline_idx` ON `booking_events` (`booking_id`,`org_id`,`created_at`);