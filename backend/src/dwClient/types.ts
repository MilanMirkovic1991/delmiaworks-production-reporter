export const DW_ERROR_CODES = ['AUTH_FAILED', 'DW_UNREACHABLE', 'DW_ERROR', 'AUTH_EXPIRED'] as const;
export type DwErrorCode = typeof DW_ERROR_CODES[number];
export type DwError = Error & { code: DwErrorCode };

export type LoginInput = { username: string; password: string; database: string; appName?: string };
export type LoginResult = { authToken: string; username: string };

export type DwClientConfig = { baseUrl: string };

export type DwResponseEnvelope<T> = { data: T } | T;
