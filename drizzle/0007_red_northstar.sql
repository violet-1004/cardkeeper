CREATE TABLE `price` (
	`id` integer PRIMARY KEY NOT NULL,
	`id_c` integer
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_poca` (
	`id` integer PRIMARY KEY NOT NULL,
	`image` text NOT NULL,
	`stocked_count` integer NOT NULL,
	`price` integer NOT NULL,
	`group_name_en` text
);
--> statement-breakpoint
INSERT INTO `__new_poca`("id", "image", "stocked_count", "price", "group_name_en") SELECT "id", "image", "stocked_count", "price", "group_name_en" FROM `poca`;--> statement-breakpoint
DROP TABLE `poca`;--> statement-breakpoint
ALTER TABLE `__new_poca` RENAME TO `poca`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_ui_subunits` (
	`id` integer PRIMARY KEY NOT NULL,
	`group_id` integer,
	`name` text,
	`image` text,
	`sort_order` integer
);
--> statement-breakpoint
INSERT INTO `__new_ui_subunits`("id", "group_id", "name", "image", "sort_order") SELECT "id", "group_id", "name", "image", "sort_order" FROM `ui_subunits`;--> statement-breakpoint
DROP TABLE `ui_subunits`;--> statement-breakpoint
ALTER TABLE `__new_ui_subunits` RENAME TO `ui_subunits`;