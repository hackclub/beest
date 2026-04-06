import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ShopService } from './shop.service';

@Controller('api/shop')
export class ShopController {
  constructor(private readonly shopService: ShopService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async list() {
    return this.shopService.listActive();
  }

  @UseGuards(JwtAuthGuard)
  @Post('purchase')
  async purchase(
    @Req() req: Request,
    @Body() body: { shopItemId?: string; quantity?: number },
  ) {
    const userId = (req as any).user?.uid;
    if (!userId) throw new BadRequestException('Not authenticated');
    if (!body.shopItemId || typeof body.shopItemId !== 'string') {
      throw new BadRequestException('shopItemId is required');
    }
    if (body.quantity === undefined || !Number.isInteger(body.quantity) || body.quantity < 1) {
      throw new BadRequestException('quantity must be a positive integer');
    }
    return this.shopService.purchase(userId, body.shopItemId, body.quantity);
  }

  @UseGuards(JwtAuthGuard)
  @Get('pipes')
  async getPipes(@Req() req: Request) {
    const userId = (req as any).user?.uid;
    if (!userId) throw new BadRequestException('Not authenticated');
    const pipes = await this.shopService.getPipes(userId);
    return { pipes };
  }

  @UseGuards(JwtAuthGuard)
  @Get('orders')
  async getOrders(@Req() req: Request) {
    const userId = (req as any).user?.uid;
    if (!userId) throw new BadRequestException('Not authenticated');
    return this.shopService.getUserOrders(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('fulfillment')
  async getFulfillmentUpdates(@Req() req: Request) {
    const userId = (req as any).user?.uid;
    if (!userId) throw new BadRequestException('Not authenticated');
    return this.shopService.getUserFulfillmentUpdates(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('fulfillment/read')
  async markRead(@Req() req: Request) {
    const userId = (req as any).user?.uid;
    if (!userId) throw new BadRequestException('Not authenticated');
    await this.shopService.markUpdatesRead(userId);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('fulfillment/unread')
  async getUnreadCount(@Req() req: Request) {
    const userId = (req as any).user?.uid;
    if (!userId) throw new BadRequestException('Not authenticated');
    const count = await this.shopService.getUnreadCount(userId);
    return { count };
  }
}
