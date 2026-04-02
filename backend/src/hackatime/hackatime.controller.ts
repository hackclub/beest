import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  UseGuards,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { HackatimeService } from './hackatime.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('api/hackatime')
export class HackatimeController {
  constructor(private readonly hackatimeService: HackatimeService) {}

  /**
   * Generates Hackatime OAuth state and authorization URL.
   * Requires an authenticated user (must be logged in via HCA first).
   */
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @Post('start')
  start() {
    return this.hackatimeService.startAuth();
  }

  /**
   * Handles the Hackatime OAuth callback: state verification, code exchange,
   * and storing the connection for the authenticated user.
   */
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @Post('callback')
  async handleCallback(
    @Req() req: Request,
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

    const userId = (req as any).user?.sub;
    if (!userId) {
      throw new UnauthorizedException('No user identity');
    }

    try {
      return await this.hackatimeService.handleCallback(
        body.code,
        body.state,
        body.storedState,
        userId,
      );
    } catch {
      throw new UnauthorizedException('Hackatime authentication failed');
    }
  }

  /**
   * Returns the authenticated user's Hackatime project names.
   * Only project name strings are returned — no other Hackatime data.
   */
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @Get('projects')
  async getProjects(@Req() req: Request) {
    const userId = (req as any).user?.sub;
    if (!userId) throw new UnauthorizedException('No user identity');

    const names = await this.hackatimeService.getProjectNames(userId);
    return { projects: names };
  }
}
