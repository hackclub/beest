import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ShopService } from './shop.service';

@Controller('api/shop')
export class ShopController {
  constructor(private readonly shopService: ShopService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@Req() req: Request) {
    const userId = (req as any).user?.uid;
    if (!userId) throw new BadRequestException('Not authenticated');
    return this.shopService.listActive(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('purchase')
  async purchase(
    @Req() req: Request,
    @Body() body: { shopItemId?: string; quantity?: number; note?: string },
  ) {
    const userId = (req as any).user?.uid;
    if (!userId) throw new BadRequestException('Not authenticated');
    if (!body.shopItemId || typeof body.shopItemId !== 'string') {
      throw new BadRequestException('shopItemId is required');
    }
    if (body.quantity === undefined || !Number.isInteger(body.quantity) || body.quantity < 1) {
      throw new BadRequestException('quantity must be a positive integer');
    }
    const note =
      typeof body.note === 'string' && body.note.trim()
        ? body.note.trim().slice(0, 500)
        : null;
    return this.shopService.purchase(userId, body.shopItemId, body.quantity, note);
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
  @Post('orders/:id/refund')
  async refundOwnOrder(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const userId = (req as any).user?.uid;
    if (!userId) throw new BadRequestException('Not authenticated');
    return this.shopService.refundOrder(id, {
      requireUserId: userId,
      requirePending: true,
    });
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

  // ── Shop suggestions ──

  @UseGuards(JwtAuthGuard)
  @Get('suggestions')
  async listSuggestions(@Req() req: Request) {
    const userId = (req as any).user?.uid;
    if (!userId) throw new BadRequestException('Not authenticated');
    return this.shopService.listSuggestions(userId);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @Post('suggestions')
  async createSuggestion(
    @Req() req: Request,
    @Body() body: { text?: string },
  ) {
    const userId = (req as any).user?.uid;
    if (!userId) throw new BadRequestException('Not authenticated');
    if (!body?.text || typeof body.text !== 'string') {
      throw new BadRequestException('text is required');
    }
    return this.shopService.createSuggestion(userId, body.text);
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @Post('suggestions/:id/vote')
  async voteSuggestion(@Req() req: Request, @Param('id') id: string) {
    const userId = (req as any).user?.uid;
    if (!userId) throw new BadRequestException('Not authenticated');
    return this.shopService.toggleSuggestionVote(userId, id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('suggestions/:id')
  async deleteSuggestion(@Req() req: Request, @Param('id') id: string) {
    const userId = (req as any).user?.uid;
    if (!userId) throw new BadRequestException('Not authenticated');
    return this.shopService.deleteSuggestion(userId, id);
  }
}
