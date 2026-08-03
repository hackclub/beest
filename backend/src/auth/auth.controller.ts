import {
  Controller,
  Get,
  Post,
  Patch,
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
import { AuthService, ALLOWED_GENDERS, type Gender } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RsvpService } from '../rsvp/rsvp.service';
import { IdentityService } from '../identity/identity.service';

@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly rsvpService: RsvpService,
    private readonly identityService: IdentityService,
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
      attribution?: {
        utm_source?: string | null;
        utm_medium?: string | null;
        utm_campaign?: string | null;
        referrer?: string | null;
        landing_path?: string | null;
      };
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
        body.attribution,
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
  async me(@Req() req: Request) {
    const user = (req as any).user;
    // Check if user has been banned since the JWT was issued
    try {
      const perms = await this.rsvpService.getPerms(user.email);
      if (perms === 'Banned') {
        throw new UnauthorizedException('Account banned');
      }
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      // Airtable lookup failed — don't block the response
    }
    // Include impersonation context if present so the frontend can show it
    const result: Record<string, any> = { ...user };
    if (user.impersonator_uid) {
      result.impersonator_uid = user.impersonator_uid;
      result.impersonator_name = user.impersonator_name;
    }
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Get('shipping-eligibility')
  async shippingEligibility(@Req() req: Request) {
    const user = (req as any).user;
    const hasAddress = !!user.has_address;
    const hasBirthdate = !!user.has_birthdate;
    const identityStatus = await this.identityService.getStatus({
      userId: user.uid,
      slackId: user.slack_id,
      email: user.email,
    });
    const identityVerified = identityStatus !== 'unverified';
    const identityEligible = identityStatus === 'eligible';
    return {
      hasAddress,
      hasBirthdate,
      identityVerified,
      identityEligible,
      identityStatus,
      // Eligible to ship requires YSWS eligibility, not just a verified document:
      // a verified_ineligible user can never ship for rewards.
      eligible: hasAddress && hasBirthdate && identityEligible,
      addressPortalUrl: 'https://auth.hackclub.com/portal/address',
      identityPortalUrl: 'https://auth.hackclub.com/verifications/document',
    };
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

    const scopeRequirements: Record<string, string[]> = {
      admin: ['Super Admin'],
      reviewer: ['Super Admin', 'Reviewer', 'Fraud Reviewer', 'Fulfiller'],
      audit: ['Super Admin', 'Fraud Reviewer'],
      fulfillment: ['Super Admin', 'Fulfiller'],
    };

    const allowed = scopeRequirements[scope];
    if (!allowed || !perms || !allowed.includes(perms)) {
      throw new ForbiddenException();
    }

    return { allowed: true, perms };
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @Patch('nickname')
  async updateNickname(
    @Req() req: Request,
    @Body() body: { nickname?: string },
  ) {
    const uid = (req as any).user?.uid;
    if (!uid) throw new UnauthorizedException();
    const nickname = (body.nickname ?? '').trim();
    if (!nickname || nickname.length > 50) {
      throw new BadRequestException('Nickname must be 1–50 characters');
    }
    return this.authService.updateNickname(uid, nickname);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @Patch('gender')
  async updateGender(
    @Req() req: Request,
    @Body() body: { gender?: string },
  ) {
    const uid = (req as any).user?.uid;
    if (!uid) throw new UnauthorizedException();
    const gender = body.gender;
    if (!gender || !ALLOWED_GENDERS.includes(gender as Gender)) {
      throw new BadRequestException('Invalid gender value');
    }
    return this.authService.updateGender(uid, gender as Gender);
  }

  @UseGuards(JwtAuthGuard)
  @Get('intent')
  async getIntent(@Req() req: Request) {
    const uid = (req as any).user?.uid;
    if (!uid) throw new UnauthorizedException();
    return this.authService.getIntentStatus(uid);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @Post('intent')
  async setIntent(@Req() req: Request, @Body() body: { choice?: string }) {
    const uid = (req as any).user?.uid;
    if (!uid) throw new UnauthorizedException();
    const choice = body.choice;
    const allowed = ['Hackathon', 'Shop', 'Browsing', 'Both'];
    if (!choice || !allowed.includes(choice)) {
      throw new BadRequestException(`choice must be one of: ${allowed.join(', ')}`);
    }
    return this.authService.setIntent(uid, choice);
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
