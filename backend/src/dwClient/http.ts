import axios, { AxiosInstance, AxiosError } from 'axios';
import { DW_ERROR_CODES, DwError, DwErrorCode } from './types.js';

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

export function createHttp(baseUrl: string): AxiosInstance {
  const http = axios.create({
    baseURL: baseUrl,
    timeout: 15000,
    headers: { 'Content-Type': 'application/json' },
  });
  http.interceptors.response.use(
    r => r,
    (e: AxiosError) => {
      if (e.code === 'ECONNREFUSED' || e.code === 'ECONNABORTED' || e.code === 'ENOTFOUND') {
        throw makeError('DW_UNREACHABLE', `Cannot reach DelmiaWorks at ${baseUrl}`, e);
      }
      throw e;
    },
  );
  return http;
}
