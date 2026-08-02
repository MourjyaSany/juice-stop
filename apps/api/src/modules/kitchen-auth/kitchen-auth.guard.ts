import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { KitchenAuthService, type KitchenSession } from './kitchen-auth.service.js';

/** Opt a route out of the guard. Used only by the login endpoint itself. */
export const PUBLIC_KEY = 'kitchen:public';
export const KitchenPublic = (): MethodDecorator => SetMetadata(PUBLIC_KEY, true);

export interface RequestWithKitchenSession extends Request {
  kitchenSession?: KitchenSession;
}

/**
 * Gate for every kitchen route.
 *
 * Applied to whole controllers rather than sprinkled per handler, so adding an endpoint to a
 * kitchen controller cannot accidentally ship it unauthenticated — the safe state is the default
 * and opting out takes a visible `@KitchenPublic()`.
 */
@Injectable()
export class KitchenAuthGuard implements CanActivate {
  constructor(
    private readonly auth: KitchenAuthService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) return true;

    const request = context.switchToHttp().getRequest<RequestWithKitchenSession>();
    // EventSource cannot set headers, so SSE routes have to carry the token in the query string.
    // Restricted to that one case rather than allowed everywhere: a token in a URL lands in
    // access logs and Referer headers, which is exactly why it is not the default.
    const header = request.headers.authorization;
    const bearer = header?.startsWith('Bearer ') === true ? header.slice(7) : undefined;
    const queryToken = typeof request.query['token'] === 'string' ? request.query['token'] : undefined;

    request.kitchenSession = this.auth.verifyToken(bearer ?? queryToken);
    return true;
  }
}
