CREATE TABLE `intake_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`user_id` text NOT NULL,
	`card_message_id` integer,
	`asin` text NOT NULL,
	`title` text,
	`note` text DEFAULT '' NOT NULL,
	`price_cents` integer,
	`theme_id` text,
	`publication_ids` text DEFAULT '[]' NOT NULL,
	`queued_at` integer,
	`cancelled_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`theme_id`) REFERENCES `themes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `intake_drafts_card_idx` ON `intake_drafts` (`chat_id`,`card_message_id`);