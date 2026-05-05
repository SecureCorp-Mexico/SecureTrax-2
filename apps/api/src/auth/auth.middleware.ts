import { Injectable, NestMiddleware } from '@nestjs/common';
import type { AuthRequest } from '@securetrax/core';
import type { Response, NextFunction } from 'express';
import { AuthService } from './auth.service.js';

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(private readonly auth: AuthService) {}

  async use(req: AuthRequest, _res: Response, next: NextFunction): Promise<void> {
    const principal = await this.auth.authenticate({ headers: req.headers });
    if (principal) req.principal = principal;
    next();
  }
}
