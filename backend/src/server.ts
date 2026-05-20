import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { fileURLToPath } from 'node:url';
import { logger } from './logger.js';
import { config } from './config.js';
import { createSessionStore } from './session.js';
import { makeAuthRouter } from './routes/auth.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp(): Express {
  const app = express();
  app.use(pinoHttp({ logger }));
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  const sessionStore = createSessionStore({ ttlMs: config.sessionTtlMs });

  app.get('/healthz', (_req, res) => { res.json({ status: 'ok' }); });
  app.use('/api/auth', makeAuthRouter(sessionStore));

  app.use(errorHandler);
  return app;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const app = createApp();
  app.listen(config.port, () => {
    logger.info({ port: config.port }, 'backend listening');
  });
}
