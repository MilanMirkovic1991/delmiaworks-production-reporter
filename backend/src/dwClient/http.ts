import axios, { AxiosInstance, AxiosError } from 'axios';
import { DW_ERROR_CODES, DwError, DwErrorCode } from './types.js';
import { logger } from '../logger.js';

const DW_CODE_SET = new Set<string>(DW_ERROR_CODES);

export function isDwError(e: unknown): e is DwError {
  return !!e && typeof e === 'object' && 'code' in e && DW_CODE_SET.has(String((e as { code: unknown }).code));
}

export function makeError(code: DwErrorCode, message: string, cause?: unknown): DwError {
  const err = new Error(message) as DwError;
  err.code = code;
  if (cause !== undefined) (err as Error & { cause?: unknown }).cause = cause;
  return err;
}

/**
 * True when a thrown error is a DW authentication failure (expired/invalid
 * session). Used to stop batch operations immediately — every remaining call
 * would fail the same way. Checks the axios response status (or a status set
 * directly on the error).
 */
export function looksLikeAuthError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const status =
    (e as { response?: { status?: number } }).response?.status ??
    (e as { status?: number }).status;
  return status === 401 || status === 403;
}

/**
 * Pulls the human-readable error out of a failed DW response body. DW wraps
 * server-side errors as { iqmsServiceError: { FriendlyMessage, ExceptionMessage } }.
 * Returns undefined when the body is not in that shape (e.g. a plain network error),
 * so the caller can keep the original axios message in that case.
 */
export function extractDwFriendlyMessage(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const svc = (data as Record<string, unknown>).iqmsServiceError;
  if (!svc || typeof svc !== 'object') return undefined;
  const o = svc as Record<string, unknown>;
  const friendly = typeof o.FriendlyMessage === 'string' ? o.FriendlyMessage.trim() : '';
  const exception = typeof o.ExceptionMessage === 'string' ? o.ExceptionMessage.trim() : '';
  const msg = friendly || exception;
  return msg.length > 0 ? msg : undefined;
}

export function createHttp(baseUrl: string): AxiosInstance {
  const http = axios.create({
    baseURL: baseUrl,
    timeout: 15000,
    headers: { 'Content-Type': 'application/json' },
  });
  http.interceptors.request.use(req => {
    logger.info({ method: req.method, url: req.url, params: req.params }, 'dw call start');
    return req;
  });
  http.interceptors.response.use(
    r => {
      logger.info({ status: r.status, url: r.config.url }, 'dw call ok');
      return r;
    },
    (e: AxiosError) => {
      const url = e.config?.url;
      const status = e.response?.status;
      const data = e.response?.data;
      logger.error({ url, status, data, code: e.code, message: e.message }, 'dw call failed');
      if (e.code === 'ECONNREFUSED' || e.code === 'ECONNABORTED' || e.code === 'ENOTFOUND') {
        throw makeError('DW_UNREACHABLE', `Cannot reach DelmiaWorks at ${baseUrl}`, e);
      }
      // Surface DW's own error text to callers. Appended (not replaced) so the HTTP
      // status stays in the message — looksLikeAuthError() still detects 401/403.
      const friendly = extractDwFriendlyMessage(data);
      if (friendly && !e.message.includes(friendly)) {
        e.message = `${e.message} — ${friendly}`;
      }
      throw e;
    },
  );
  return http;
}
