import { createHash, timingSafeEqual } from 'node:crypto';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../core/database/prisma.service.js';
import { KitchenAuthService } from '../kitchen-auth/kitchen-auth.service.js';
import { ErrorCode, NotFoundError } from '../../core/errors/app-error.js';

/**
 * Who may read or change one specific order.
 *
 * **This closes a live data leak.** Every per-order endpoint was unauthenticated: `GET /orders`
 * returned the fifty most recent orders — names, phone numbers and full delivery addresses — to
 * anybody who asked, and `PATCH /orders/:id` let anyone holding an id rewrite somebody else's
 * basket. Order ids are cuids, which is obscurity, not access control.
 *
 * There is no customer identity yet (audit A3), so authorisation cannot be "is this your order?".
 * Instead it is a **capability**: placing an order mints a random secret, returns it to that device
 * exactly once, and every later read or write must present it. That is the ordinary guest-checkout
 * pattern, it needs no accounts, and it is what the identity module will replace rather than
 * something it will have to unpick.
 *
 * Staff bypass it with their signed session, because the kitchen legitimately reads every order.
 *
 * **404, never 403.** A 403 confirms the order exists, which turns this endpoint back into the
 * enumeration oracle it used to be — the same reasoning `NotFoundError` already carries for
 * object-level authorisation (09-deployment.md §7).
 */
@Injectable()
export class OrderAccessGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: KitchenAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const orderId = request.params['id'];
    if (typeof orderId !== 'string' || orderId.length === 0) {
      throw new NotFoundError('Order not found.');
    }

    // Staff first: a signed session outranks the per-order token, and the kitchen must be able to
    // open any ticket without the customer's secret.
    const header = request.headers.authorization;
    if (header?.startsWith('Bearer ') === true) {
      try {
        this.auth.verifyToken(header.slice(7));
        return true;
      } catch {
        // A bad staff token falls through to the customer path rather than short-circuiting — a
        // stale kitchen tab must not make a customer's own order unreadable.
      }
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { accessTokenHash: true },
    });
    // Same answer for "no such order" and "wrong token", deliberately.
    if (order?.accessTokenHash == null) throw new NotFoundError('Order not found.');

    const supplied = readToken(request);
    if (supplied === undefined) throw new NotFoundError('Order not found.');

    const a = Buffer.from(sha256(supplied));
    const b = Buffer.from(order.accessTokenHash);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new NotFoundError('Order not found.');
    }

    return true;
  }
}

/**
 * The token, from a header or — for navigations only — the query string.
 *
 * The header is the real channel. The query fallback exists because the payment screen can be
 * opened from a link, and a token in a URL lands in access logs and `Referer` headers; it is
 * accepted rather than preferred for exactly that reason.
 */
function readToken(request: Request): string | undefined {
  const header = request.headers['x-order-token'];
  if (typeof header === 'string' && header.length > 0) return header;
  const query = request.query['t'];
  return typeof query === 'string' && query.length > 0 ? query : undefined;
}

export const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

export { ErrorCode };
