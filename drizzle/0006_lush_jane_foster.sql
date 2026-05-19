CREATE TABLE `poca` (
	`id` integer PRIMARY KEY NOT NULL,
	`image` text NOT NULL,
	`stocked_count` integer NOT NULL,
	`price` text NOT NULL,
	`member_name_en` text,
	`group_name_en` text
);
--> statement-breakpoint
ALTER TABLE `ui_cards` ADD `member_id2` text;--> statement-breakpoint
ALTER TABLE `ui_cards` ADD `poco_id` integer;