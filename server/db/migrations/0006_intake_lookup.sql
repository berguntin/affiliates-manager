ALTER TABLE `intake_drafts` ADD `brand` text;--> statement-breakpoint
ALTER TABLE `intake_drafts` ADD `basis_price_cents` integer;--> statement-breakpoint
ALTER TABLE `intake_drafts` ADD `basis_type` text;--> statement-breakpoint
ALTER TABLE `intake_drafts` ADD `features` text DEFAULT '[]' NOT NULL;