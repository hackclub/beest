import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

/**
 * Authenticates server-to-server calls from Sidekick (the external review /
 * fulfillment console). Sidekick sends the static shared secret as
 * `Authorization: Bearer <secret>`; we constant-time compare it against
 * SIDEKICK_SECRET. This is NOT a user route — there is no JWT here, only the
 * shared secret. Leaving SIDEKICK_SECRET unset disables the endpoint
 * entirely (every call 401s).
 */
@Injectable()
export class SidekickAuthGuard implements CanActivate {
  private readonly logger = new Logger(SidekickAuthGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('SIDEKICK_SECRET');
    if (!expected) {
      this.logger.error('SIDEKICK_SECRET not set — refusing Sidekick calls');
      throw new UnauthorizedException({
        error: 'UNAUTHORIZED',
        message: 'Sidekick integration is not configured.',
      });
    }
    const req = context.switchToHttp().getRequest();
    const header = req.headers['authorization'];
    const provided =
      typeof header === 'string' && header.startsWith('Bearer ')
        ? header.slice('Bearer '.length)
        : null;
    if (!provided || !this.constantTimeEqual(provided, expected)) {
      throw new UnauthorizedException({
        error: 'UNAUTHORIZED',
        message: 'Invalid or missing secret key.',
      });
    }
    return true;
  }

  private constantTimeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    // timingSafeEqual throws on length mismatch — guard, but still spend the
    // comparison on a fixed-length buffer to avoid leaking length via timing.
    if (ab.length !== bb.length) {
      timingSafeEqual(bb, bb);
      return false;
    }
    return timingSafeEqual(ab, bb);
  }
}
