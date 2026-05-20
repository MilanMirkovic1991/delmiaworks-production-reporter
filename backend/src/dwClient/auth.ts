import { AxiosInstance } from 'axios';
import { LoginInput, LoginResult } from './types.js';
import { isDwError, makeError } from './http.js';

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
