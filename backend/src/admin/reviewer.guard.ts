import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { RsvpService } from '../rsvp/rsvp.service';

const REVIEWER_ROLES = ['Super Admin', 'Reviewer', 'Fraud Reviewer'];

/**
 * Guard that requires a valid JWT AND Reviewer-level+ Perms in Airtable.
 * Allows Super Admin, Reviewer, and Fraud Reviewer.
 */
@Injectable()
export class ReviewerGuard implements CanActivate {
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
    if (!perms || !REVIEWER_ROLES.includes(perms)) {
      throw new ForbiddenException();
    }

    request.user = user;
    return true;
  }
}
