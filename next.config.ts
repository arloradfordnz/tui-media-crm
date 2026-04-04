import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure Prisma Client works correctly in serverless environments (Vercel)
  outputFileTracingIncludes: {
    "/**/*": ["./app/generated/prisma/**/*"],
  },
};

export default nextConfig;
