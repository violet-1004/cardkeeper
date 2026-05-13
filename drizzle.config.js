
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./schema.js", // 確保指向您定義資料表的檔案
  out: "./drizzle",
  dialect: "sqlite",
  driver: "d1-http",
  dbCredentials: {
    accountId: "3309ef2b6e90c0d6dc52abe4d72caeae",       // 在 Cloudflare 後台網址列那串亂碼
    databaseId: "12bd1cc8-3276-4e33-80a2-4dbf528a6371",  // 在 D1 後台的 Database ID (一串 UUID)
    token: process.env.CLOUDFLARE_API_TOKEN    // 需有 D1 讀寫權限的 Token
  }
});