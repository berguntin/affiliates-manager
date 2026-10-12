CREATE TABLE `channels` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`identifier` text NOT NULL,
	`tracking_id` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `deals` (
	`id` text PRIMARY KEY NOT NULL,
	`theme_id` text NOT NULL,
	`asin` text NOT NULL,
	`source` text NOT NULL,
	`detected_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`title` text,
	`brand` text,
	`image_url` text,
	`price_cents` integer,
	`saving_basis_cents` integer,
	`saving_basis_type` text,
	`savings_pct` integer,
	`deal_type` text,
	`deal_ends_at` integer,
	`effective_discount_pct` integer,
	`reliability` text NOT NULL,
	`suspicious` integer DEFAULT false NOT NULL,
	`reasons` text DEFAULT '[]' NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`purged_at` integer,
	FOREIGN KEY (`theme_id`) REFERENCES `themes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `deals_asin_idx` ON `deals` (`asin`,`detected_at`);--> statement-breakpoint
CREATE INDEX `deals_theme_idx` ON `deals` (`theme_id`,`detected_at`);--> statement-breakpoint
CREATE TABLE `manual_products` (
	`id` text PRIMARY KEY NOT NULL,
	`theme_id` text NOT NULL,
	`asin` text NOT NULL,
	`title` text NOT NULL,
	`brand` text,
	`note` text DEFAULT '' NOT NULL,
	`internal_price_cents` integer,
	`consumed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`theme_id`) REFERENCES `themes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `manual_products_theme_idx` ON `manual_products` (`theme_id`,`consumed_at`);--> statement-breakpoint
CREATE TABLE `message_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`theme_id` text,
	`format` text NOT NULL,
	`body` text NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`theme_id`) REFERENCES `themes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `publications` (
	`id` text PRIMARY KEY NOT NULL,
	`deal_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`status` text NOT NULL,
	`text` text NOT NULL,
	`link` text NOT NULL,
	`price_cents_shown` integer,
	`price_checked_at` integer,
	`needs_review` integer DEFAULT false NOT NULL,
	`review_reason` text,
	`scheduled_at` integer,
	`published_at` integer,
	`external_id` text,
	`error` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `publications_status_idx` ON `publications` (`status`,`scheduled_at`);--> statement-breakpoint
CREATE INDEX `publications_deal_idx` ON `publications` (`deal_id`);--> statement-breakpoint
CREATE INDEX `publications_channel_idx` ON `publications` (`channel_id`,`published_at`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`trigger` text NOT NULL,
	`theme_id` text,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`status` text NOT NULL,
	`stats` text DEFAULT '{}' NOT NULL,
	`errors` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`theme_id`) REFERENCES `themes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `runs_started_idx` ON `runs` (`started_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `theme_channels` (
	`theme_id` text NOT NULL,
	`channel_id` text NOT NULL,
	PRIMARY KEY(`theme_id`, `channel_id`),
	FOREIGN KEY (`theme_id`) REFERENCES `themes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `themes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`provider` text DEFAULT 'mock' NOT NULL,
	`search_index` text DEFAULT 'All' NOT NULL,
	`keywords` text DEFAULT '[]' NOT NULL,
	`browse_nodes` text DEFAULT '[]' NOT NULL,
	`exclude_keywords` text DEFAULT '[]' NOT NULL,
	`exclude_brands` text DEFAULT '[]' NOT NULL,
	`min_discount_pct` integer DEFAULT 20 NOT NULL,
	`min_price_cents` integer,
	`max_price_cents` integer,
	`min_rating` integer,
	`min_reviews` integer,
	`daily_limit` integer DEFAULT 5 NOT NULL,
	`publish_windows` text DEFAULT '[]' NOT NULL,
	`dedupe_days` integer DEFAULT 14 NOT NULL,
	`tone` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `themes_slug_unique` ON `themes` (`slug`);