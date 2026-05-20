export type DwError = Error & { code: 'AUTH_FAILED' | 'DW_UNREACHABLE' | 'DW_ERROR' | 'AUTH_EXPIRED' };

export type LoginInput = { username: string; password: string; database: string; appName?: string };
export type LoginResult = { authToken: string; username: string };

export type DwClientConfig = { baseUrl: string };

export type DwResponseEnvelope<T> = { data: T } | T;
