import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

export const groups = sqliteTable("groups", {
  id: integer("id").primaryKey(),
  name: text("name"),
  image: text("image")
});

export const members = sqliteTable("members", {
  id: integer("id").primaryKey(),
  group_id: integer("group_id"),
  name: text("name"),
  image: text("image"),
  sort_order: integer("sort_order"),
  subunit: text("subunit")
});

export const uiSubunits = sqliteTable("ui_subunits", {
  id: text("id").primaryKey(), // 👈 這裡改成 text
  group_id: integer("group_id"),
  name: text("name"),
  image: text("image"),
  sort_order: integer("sort_order")
});

export const channels = sqliteTable("channels", {
  id: text("id").primaryKey(), 
  group_id: integer("group_id"),
  name: text("name"),
  short_name: text("short_name")
});

export const types = sqliteTable("types", {
  id: text("id").primaryKey(),
  group_id: integer("group_id"),
  name: text("name"),
  short_name: text("short_name"),
  sort_order: integer("sort_order")
});

export const series = sqliteTable("series", {
  id: integer("id").primaryKey(),
  group_id: integer("group_id"),
  name: text("name"),
  type: text("type"),
  date: text("date"),
  short_name: text("short_name"),
  image: text("image"),
  subunit: text("subunit"),
  api: text("api")
});

export const batches = sqliteTable("batches", {
  id: integer("id").primaryKey(),
  group_id: integer("group_id"),
  series_id: integer("series_id"),
  name: text("name"),
  type: text("type"),
  channel: text("channel"),
  batch_number: text("batch_number"),
  image: text("image"),
  date: text("date")
});

export const uiCards = sqliteTable("ui_cards", {
  id: integer("id").primaryKey(),
  group_id: integer("group_id"),
  member_id: integer("member_id"),
  series_id: integer("series_id"),
  batch_id: integer("batch_id"),
  name: text("name"),
  type: text("type"),
  channel: text("channel"),
  image: text("image"),
  is_wishlist: integer("is_wishlist") 
});

export const uiInventory = sqliteTable("ui_inventory", {
  id: text("id").primaryKey(),
  card_id: integer("card_id"),
  buy_date: text("buy_date"),
  sell_date: text("sell_date"),
  quantity: integer("quantity"),
  buy_price: integer("buy_price"),
  sell_price: integer("sell_price"),
  source: text("source"),
  condition: text("condition"),
  status: text("status"),
  note: text("note"),
  bulk_record_id: integer("bulk_record_id"),
  album_id: integer("album_id"),
  album_status: text("album_status"),
  album_quantity: integer("album_quantity")
});

export const bulkRecords = sqliteTable("bulk_records", {
  id: integer("id").primaryKey(),
  group_id: integer("group_id"),
  name: text("name"),
  image: text("image"),
  status: text("status"),
  buy_date: text("buy_date"),
  source: text("source"),
  total_amount: integer("total_amount"),
  items: text("items")
});

export const customLists = sqliteTable("custom_lists", {
  id: integer("id").primaryKey(),
  title: text("title"),
  description: text("description"),
  created_at: text("created_at"),
  items: text("items")
});

export const uiSales = sqliteTable("ui_sales", {
  id: text("id").primaryKey(),
  card_id: integer("card_id"),
  quantity: integer("quantity"),
  price: integer("price"),
  date: text("date"),
  buyer: text("buyer"),
  status: text("status"),
  note: text("note"),
  color: text("color") // 👈 補上這個顏色欄位
});