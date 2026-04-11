CREATE TABLE `batches` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text,
	`channel` integer,
	`batch_number` text,
	`date` text,
	`group_id` integer,
	`series_id` integer,
	`image` text
);
--> statement-breakpoint
CREATE TABLE `channels` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text,
	`short_name` text
);
--> statement-breakpoint
CREATE TABLE `ui_cards` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`group_id` integer,
	`member_id` integer,
	`series_id` integer,
	`batch_id` integer,
	`type` text,
	`channel` integer,
	`image` text
);
