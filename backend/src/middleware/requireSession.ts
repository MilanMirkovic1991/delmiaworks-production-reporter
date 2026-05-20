import { Request, Response, NextFunction } from 'express';
import { SessionData, SessionStore } from '../session.js';
import { createDwClient, DwClient } from '../dwClient/index.js';

declare module 'express-serve-static-core' {
  interface Request {
    session?: SessionData & { id: string };
    dw?: DwClient;
  }
}

export function makeRequireSession(store: SessionStore) {
  return function requireSession(req: Request, res: Response, next: NextFunction) {
    const id = req.cookies?.sessionId as string | undefined;
    const data = id ? store.get(id) : null;
    if (!id || !data) {
      res.status(401).json({ error: 'NOT_AUTHENTICATED' });
      return;
    }
    store.touch(id);
    req.session = { id, ...data };
    const dw = createDwClient({ baseUrl: data.baseUrl });
    dw.setAuthToken(data.authToken);
    req.dw = dw;
    next();
  };
}
