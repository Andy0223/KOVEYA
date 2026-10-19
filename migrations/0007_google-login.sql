CREATE TABLE `google_challenges` (
	`nonce_hash` text PRIMARY KEY NOT NULL,
	`browser_hash` text NOT NULL,
	`return_to` text NOT NULL,
	`locale` text NOT NULL,
	`link_session_hash` text,
	`expires_at` integer NOT NULL,
	`consumed_nonce` text
);
--> statement-breakpoint
CREATE INDEX `google_challenges_expiry_idx` ON `google_challenges` (`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `identities_google_user_uq` ON `identities` (`user_id`) WHERE "identities"."provider" = 'google';