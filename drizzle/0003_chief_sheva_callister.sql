PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_ui_subunits` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` integer,
	`name` text,
	`image` text,
	`sort_order` integer
);
--> statement-breakpoint
INSERT INTO `__new_ui_subunits`("id", "group_id", "name", "image", "sort_order") SELECT "id", "group_id", "name", "image", "sort_order" FROM `ui_subunits`;--> statement-breakpoint
DROP TABLE `ui_subunits`;--> statement-breakpoint
ALTER TABLE `__new_ui_subunits` RENAME TO `ui_subunits`;--> statement-breakpoint
PRAGMA foreign_keys=ON;