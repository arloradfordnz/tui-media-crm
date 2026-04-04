import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Uses DIRECT_URL for migrations (bypasses connection pooler),
    // falls back to DATABASE_URL for general use
    url: process.env["DIRECT_URL"] || process.env["DATABASE_URL"],
  },
});
