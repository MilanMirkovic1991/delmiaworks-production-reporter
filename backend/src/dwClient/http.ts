import axios, { AxiosInstance, AxiosError } from 'axios';
import { DwError } from './types.js';

function makeError(code: DwError['code'], message: string, cause?: unknown): DwError {
  const err = new Error(message) as DwError;
  err.code = code;
  if (cause) (err as Error & { cause?: unknown }).cause = cause;
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

export { makeError };
