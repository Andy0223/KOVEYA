PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_offerings` (
	`id` text PRIMARY KEY NOT NULL,
	`service_id` text NOT NULL,
	`org_id` text NOT NULL,
	`duration_minutes` integer NOT NULL,
	`pricing_type` text NOT NULL,
	`price_minor` integer,
	`currency` text NOT NULL,
	FOREIGN KEY (`service_id`,`org_id`) REFERENCES `services`(`id`,`org_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "duration_check" CHECK("__new_offerings"."duration_minutes" > 0 AND "__new_offerings"."duration_minutes" % 15 = 0),
	CONSTRAINT "currency_shape_check" CHECK(length("__new_offerings"."currency") = 3 AND "__new_offerings"."currency" NOT GLOB '*[^A-Z]*'),
	CONSTRAINT "pricing_check" CHECK(("__new_offerings"."pricing_type" = 'FIXED' AND "__new_offerings"."price_minor" IS NOT NULL AND "__new_offerings"."price_minor" > 0) OR ("__new_offerings"."pricing_type" = 'FREE' AND "__new_offerings"."price_minor" IS NOT NULL AND "__new_offerings"."price_minor" = 0) OR ("__new_offerings"."pricing_type" = 'QUOTE' AND "__new_offerings"."price_minor" IS NULL))
);
--> statement-breakpoint
INSERT INTO `__new_offerings`("id", "service_id", "org_id", "duration_minutes", "pricing_type", "price_minor", "currency") SELECT "id", "service_id", "org_id", "duration_minutes", "pricing_type", "price_minor", "currency" FROM `offerings`;--> statement-breakpoint
DROP TABLE `offerings`;--> statement-breakpoint
ALTER TABLE `__new_offerings` RENAME TO `offerings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `offering_tenant_uq` ON `offerings` (`id`,`org_id`);