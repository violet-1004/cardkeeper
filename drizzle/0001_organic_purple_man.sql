CREATE TABLE `bulk_records` (
	`id` integer PRIMARY KEY NOT NULL,
	`group_id` integer,
	`name` text,
	`image` text,
	`status` text,
	`buy_date` text,
	`source` text,
	`total_amount` integer,
	`items` text
);
--> statement-breakpoint
CREATE TABLE `custom_lists` (
	`id` integer PRIMARY KEY NOT NULL,
	`title` text,
	`description` text,
	`created_at` text,
	`items` text
);
--> statement-breakpoint
CREATE TABLE `groups` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text,
	`image` text
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` integer PRIMARY KEY NOT NULL,
	`group_id` integer,
	`name` text,
	`image` text,
	`sort_order` integer,
	`subunit` text
);
--> statement-breakpoint
CREATE TABLE `series` (
	`id` integer PRIMARY KEY NOT NULL,
	`group_id` integer,
	`name` text,
	`type` text,
	`date` text,
	`short_name` text,
	`image` text,
	`subunit` text,
	`api` text
);
--> statement-breakpoint
CREATE TABLE `types` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` integer,
	`name` text,
	`short_name` text,
	`sort_order` integer
);
--> statement-breakpoint
CREATE TABLE `ui_inventory` (
	`id` integer PRIMARY KEY NOT NULL,
	`card_id` integer,
	`buy_date` text,
	`sell_date` text,
	`quantity` integer,
	`buy_price` integer,
	`sell_price` integer,
	`source` text,
	`condition` text,
	`status` text,
	`note` text,
	`bulk_record_id` integer,
	`album_id` integer,
	`album_status` text,
	`album_quantity` integer
);
--> statement-breakpoint
CREATE TABLE `ui_sales` (
	`id` integer PRIMARY KEY NOT NULL,
	`card_id` integer,
	`price` integer,
	`date` text,
	`buyer` text,
	`status` text,
	`note` text
);
--> statement-breakpoint
CREATE TABLE `ui_subunits` (
	`id` integer PRIMARY KEY NOT NULL,
	`group_id` integer,
	`name` text,
	`image` text
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_batches` (
	`id` integer PRIMARY KEY NOT NULL,
	`group_id` integer,
	`series_id` integer,
	`name` text,
	`type` text,
	`channel` text,
	`batch_number` text,
	`image` text,
	`date` text
);
--> statement-breakpoint
INSERT INTO `__new_batches`("id", "group_id", "series_id", "name", "type", "channel", "batch_number", "image", "date") SELECT "id", "group_id", "series_id", "name", "type", "channel", "batch_number", "image", "date" FROM `batches`;--> statement-breakpoint
DROP TABLE `batches`;--> statement-breakpoint
ALTER TABLE `__new_batches` RENAME TO `batches`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` integer,
	`name` text,
	`short_name` text
);
--> statement-breakpoint
INSERT INTO `__new_channels`("id", "group_id", "name", "short_name") SELECT "id", "group_id", "name", "short_name" FROM `channels`;--> statement-breakpoint
DROP TABLE `channels`;--> statement-breakpoint
ALTER TABLE `__new_channels` RENAME TO `channels`;--> statement-breakpoint
CREATE TABLE `__new_ui_cards` (
	`id` integer PRIMARY KEY NOT NULL,
	`group_id` integer,
	`member_id` integer,
	`series_id` integer,
	`batch_id` integer,
	`name` text,
	`type` text,
	`channel` text,
	`image` text,
	`is_wishlist` integer
);
--> statement-breakpoint
INSERT INTO `__new_ui_cards`("id", "group_id", "member_id", "series_id", "batch_id", "name", "type", "channel", "image", "is_wishlist") SELECT "id", "group_id", "member_id", "series_id", "batch_id", "name", "type", "channel", "image", "is_wishlist" FROM `ui_cards`;--> statement-breakpoint
DROP TABLE `ui_cards`;--> statement-breakpoint
ALTER TABLE `__new_ui_cards` RENAME TO `ui_cards`;