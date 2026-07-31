import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { SuperAdminGuard } from '../admin/super-admin.guard';
import { HcbService, type GrantAdmin } from './hcb.service';

@Controller('api/admin/hcb')
@UseGuards(SuperAdminGuard)
export class HcbController {
  constructor(private readonly hcbService: HcbService) {}

  private admin(req: Request): GrantAdmin {
    const user = (req as any).user;
    const uid = user?.uid as string | undefined;
    const email = user?.email as string | undefined;
    if (!uid || !email) throw new BadRequestException('Not authenticated');
    return { uid, email };
  }

  @Get('status')
  status() {
    return this.hcbService.getStatus();
  }

  /** Begins the OAuth connect flow — returns the authorize URL + state for the frontend to cookie. */
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('connect')
  connect() {
    return this.hcbService.getAuthorizeUrl();
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('handle-callback')
  async handleCallback(
    @Req() req: Request,
    @Body() body: { code?: string; state?: string; storedState?: string },
  ) {
    if (!body.code) throw new BadRequestException('Authorization code is required');
    if (!body.state || !body.storedState) {
      throw new BadRequestException('State parameters are required');
    }
    return this.hcbService.handleCallback(body.code, body.state, body.storedState, this.admin(req));
  }

  @Get('prefill/:orderId')
  prefill(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.hcbService.buildPrefill(orderId);
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('card-grant')
  async createCardGrant(
    @Req() req: Request,
    @Body()
    body: {
      orderId?: string;
      amountCents?: number;
      email?: string;
      purpose?: string | null;
      merchantLock?: string | null;
      categoryLock?: string | null;
      keywordLock?: string | null;
      oneTimeUse?: boolean;
      preAuthorizationRequired?: boolean;
    },
  ) {
    if (!body.orderId || typeof body.orderId !== 'string') {
      throw new BadRequestException('orderId is required');
    }
    if (typeof body.amountCents !== 'number') {
      throw new BadRequestException('amountCents is required');
    }
    if (!body.email || typeof body.email !== 'string') {
      throw new BadRequestException('email is required');
    }
    return this.hcbService.createCardGrantForOrder(
      body.orderId,
      {
        amountCents: body.amountCents,
        email: body.email,
        purpose: body.purpose ?? null,
        merchantLock: body.merchantLock ?? null,
        categoryLock: body.categoryLock ?? null,
        keywordLock: body.keywordLock ?? null,
        oneTimeUse: body.oneTimeUse,
        preAuthorizationRequired: body.preAuthorizationRequired,
      },
      this.admin(req),
    );
  }
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('card-grant/bulk')
  async createBulkCardGrants(
    @Req() req: Request,
    @Body()
    body: {
      orderIds?: string[];
      oneTimeUse?: boolean;
    },
  ) {
    if (!Array.isArray(body.orderIds) || body.orderIds.length === 0) {
      throw new BadRequestException('orderIds is required and must be a non-empty array');
    }
    if (body.orderIds.length > 100 ){
      throw new BadRequestException('Cannot process more than 100 orderIds at once');
    }
    return this.hcbService.createGrantForOrders(
      body.orderIds,
      {
        oneTimeUse: body.oneTimeUse !== false
      },
      this.admin(req),
    );
  }
}
