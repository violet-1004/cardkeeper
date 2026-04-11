PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_ui_inventory` (
	`id` text PRIMARY KEY NOT NULL,
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
INSERT INTO `__new_ui_inventory`("id", "card_id", "buy_date", "sell_date", "quantity", "buy_price", "sell_price", "source", "condition", "status", "note", "bulk_record_id", "album_id", "album_status", "album_quantity") SELECT "id", "card_id", "buy_date", "sell_date", "quantity", "buy_price", "sell_price", "source", "condition", "status", "note", "bulk_record_id", "album_id", "album_status", "album_quantity" FROM `ui_inventory`;--> statement-breakpoint
DROP TABLE `ui_inventory`;--> statement-breakpoint
ALTER TABLE `__new_ui_inventory` RENAME TO `ui_inventory`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_ui_sales` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` integer,
	`quantity` integer,
	`price` integer,
	`date` text,
	`buyer` text,
	`status` text,
	`note` text
);
--> statement-breakpoint
INSERT INTO `__new_ui_sales`("id", "card_id", "quantity", "price", "date", "buyer", "status", "note") SELECT "id", "card_id", "quantity", "price", "date", "buyer", "status", "note" FROM `ui_sales`;--> statement-breakpoint
DROP TABLE `ui_sales`;--> statement-breakpoint
ALTER TABLE `__new_ui_sales` RENAME TO `ui_sales`;