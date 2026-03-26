import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  UseGuards,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Generates OAuth state and authorization URL.
   * The proxy layer stores `state` in an httpOnly cookie and redirects to `url`.
   */
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('start')
  start(@Body() body: { email?: string }) {
    return this.authService.startAuth(body.email);
  }

  /**
   * Handles the full OAuth callback: state verification, code exchange,
   * RSVP submission, JWT issuance, and redirect target.
   * The proxy layer stores `token` in an httpOnly cookie and redirects to `redirectTo`.
   */
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
   * Returns the authenticated user's claims from their JWT.
   */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: Request) {
    return (req as any).user;
  }

  /**
   * Clears the auth session. The proxy layer should delete the auth_token cookie.
   */
  @Post('logout')
  logout() {
    return { success: true };
  }
}
