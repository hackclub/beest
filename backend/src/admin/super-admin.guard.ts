import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { RsvpService } from '../rsvp/rsvp.service';

/**
 * Guard that requires a valid JWT AND Super Admin Perms in Airtable.
 * Checks Airtable on every request — no caching, so revocations are instant.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly rsvpService: RsvpService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException();
    }

    let user: Record<string, unknown>;
    try {
      const token = authHeader.split(' ')[1];
      user = this.authService.verifyToken(token);
    } catch {
      throw new UnauthorizedException();
    }

    const email = user?.email as string;
    if (!email) throw new ForbiddenException();

    const perms = await this.rsvpService.getPerms(email);
    if (perms !== 'Super Admin') {
      throw new ForbiddenException();
    }

    request.user = user;
    return true;
  }
}
