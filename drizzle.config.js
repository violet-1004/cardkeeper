/** @type { import("drizzle-kit").Config } */
export default {
  schema: "./schema.js", 
  out: "./drizzle",      
  dialect: "sqlite"      // 只要保留這行就好，刪除 driver 和 dbCredentials
};