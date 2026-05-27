import 'dotenv/config';

export const config = {
  // Default 3001 (not 3000) to avoid colliding with the sibling 'Expected PO Receipts'
  // project that already uses 3000. Override with PORT env var if needed.
  port: Number(process.env.PORT ?? 3001),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  sessionTtlMs: 8 * 60 * 60 * 1000,
} as const;
