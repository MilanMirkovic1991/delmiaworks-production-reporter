import { ErrorRequestHandler, Request } from 'express';
import { logger } from '../logger.js';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const code = (err && typeof err === 'object' && 'code' in err) ? String((err as { code: unknown }).code) : 'INTERNAL';
  const requestId = (req as Request & { id?: string }).id ?? '';
  logger.error({ err, code, path: req.path, requestId }, 'request error');
  const statusByCode: Record<string, number> = {
    AUTH_FAILED: 401,
    AUTH_EXPIRED: 401,
    DW_UNREACHABLE: 503,
    DW_ERROR: 502,
    INVALID_QTY: 400,
  };
  const status = statusByCode[code] ?? 500;
  res.status(status).json({ error: code, message: err?.message ?? 'unknown error', requestId });
};
