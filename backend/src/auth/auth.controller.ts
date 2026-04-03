import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Query,
  UseGuards,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RsvpService } from '../rsvp/rsvp.service';

@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly rsvpService: RsvpService,
  ) {}

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('start')
  start(@Body() body: { email?: string }) {
    return this.authService.startAuth(body.email);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('handle-callback')
  async handleCallback(
    @Body()
    body: {
      code: string;
      state: string;
      storedState: string;
    },
  ) {
    if (!body.code) {
      throw new BadRequestException('Authorization code is required');
    }
    if (!body.state || !body.storedState) {
      throw new BadRequestException('State parameters are required');
    }
    try {
      return await this.authService.handleCallback(
        body.code,
        body.state,
        body.storedState,
      );
    } catch {
      throw new UnauthorizedException('Authentication failed');
    }
  }

  /**
   * Exchange a refresh token for a new JWT + rotated refresh token.
   */
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('refresh')
  async refresh(@Body() body: { refreshToken: string }) {
    if (!body.refreshToken) {
      throw new BadRequestException('Refresh token is required');
    }
    try {
      return await this.authService.refreshAuth(body.refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: Request) {
    return (req as any).user;
  }

  @UseGuards(JwtAuthGuard)
  @Post('rsvp')
  async rsvpFromSession(@Req() req: Request) {
    const email = (req as any).user?.email;
    if (!email) {
      throw new BadRequestException('No email in token');
    }
    return this.rsvpService.createRsvp(email);
  }

  @UseGuards(JwtAuthGuard)
  @Get('scope')
  async checkScope(
    @Req() req: Request,
    @Query('scope') scope: string,
  ) {
    const email = (req as any).user?.email;
    if (!email) throw new ForbiddenException();

    const perms = await this.rsvpService.getPerms(email);

    const scopeRequirements: Record<string, string> = {
      admin: 'Super Admin',
    };

    const required = scopeRequirements[scope];
    if (!required || perms !== required) {
      throw new ForbiddenException();
    }

    return { allowed: true };
  }

  /**
   * Invalidates the session's refresh token. The proxy clears cookies.
   */
  @Post('logout')
  async logout(@Body() body: { refreshToken?: string }) {
    if (body.refreshToken) {
      await this.authService.invalidateSession(body.refreshToken);
    }
    return { success: true };
  }
}
