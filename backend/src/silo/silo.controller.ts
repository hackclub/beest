import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { SuperAdminGuard } from '../admin/super-admin.guard';
import { SiloService, type GrantAdmin } from './silo.service';

@Controller('api/admin/silo')
@UseGuards(SuperAdminGuard)
export class SiloController {
  constructor(private readonly siloService: SiloService) {}

  private admin(req: Request): GrantAdmin {
    const user = (req as any).user;
    const uid = user?.uid as string | undefined;
    const email = user?.email as string | undefined;
    if (!uid || !email) throw new BadRequestException('Not authenticated');
    return { uid, email };
  }

  @Get('status')
  status() {
    return { configured: this.siloService.isConfigured };
  }

  @Get('prefill/:orderId')
  prefill(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.siloService.buildPrefill(orderId);
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('grant')
  async createGrant(
    @Req() req: Request,
    @Body('orderId') orderId?: string,
  ) {
    if (!orderId || typeof orderId !== 'string') {
      throw new BadRequestException('orderId is required');
    }
    return this.siloService.createSiloGrantForOrder(orderId, this.admin(req));
  }
}
