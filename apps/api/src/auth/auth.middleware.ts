import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service.js';
import type { Principal } from '../iam/principal.js';

declare module 'express-serve-static-core' {
  interface Request {
    principal?: Principal;
  }
}

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(private readonly auth: AuthService) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const principal = await this.auth.authenticate({ headers: req.headers });
    if (principal) req.principal = principal;
    next();
  }
}
