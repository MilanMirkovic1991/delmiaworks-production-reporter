import { AxiosInstance } from 'axios';
import { LoginInput, LoginResult, DwError } from './types.js';
import { makeError } from './http.js';

const DW_CODES = new Set<string>(['AUTH_FAILED', 'DW_UNREACHABLE', 'DW_ERROR', 'AUTH_EXPIRED']);

function isDwError(e: unknown): e is DwError {
  return e instanceof Error && 'code' in e && DW_CODES.has((e as DwError).code);
}

export function makeAuthApi(http: AxiosInstance) {
  return {
    async login(input: LoginInput): Promise<LoginResult> {
      try {
        const res = await http.post('/User/Login', {
          UserName: input.username,
          Password: input.password,
          Database: input.database,
          ApplicationName: input.appName ?? 'delmiaworks-production-reporter',
        });
        const body = res.data;
        const token = body?.AuthToken ?? body?.authToken ?? body?.data?.AuthToken;
        if (!token) throw makeError('AUTH_FAILED', 'No token in login response');
        return { authToken: token, username: body?.UserName ?? input.username };
      } catch (e: unknown) {
        if (isDwError(e)) throw e;
        throw makeError('AUTH_FAILED', 'Login failed', e);
      }
    },
  };
}
