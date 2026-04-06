import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  BadRequestException,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { SuperAdminGuard } from './super-admin.guard';
import { ReviewerGuard } from './reviewer.guard';
import { AdminService } from './admin.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthService } from '../auth/auth.service';
import { ShopService } from '../shop/shop.service';

@Controller('api/admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly auditLogService: AuditLogService,
    private readonly authService: AuthService,
    private readonly shopService: ShopService,
  ) {}

  @UseGuards(SuperAdminGuard)
  @Get('users')
  listUsers() {
    return this.adminService.listUsers();
  }

  @UseGuards(SuperAdminGuard)
  @Get('users/:id')
  getUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getUser(id);
  }

  @UseGuards(SuperAdminGuard)
  @Post('users/:id/ban')
  async banUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const adminId = (req as any).user?.uid;
    await this.adminService.banUser(id, adminId);
    return { success: true };
  }

  @UseGuards(SuperAdminGuard)
  @Patch('users/:id/perms')
  async updatePerms(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { perms?: string },
    @Req() req: Request,
  ) {
    if (!body.perms || typeof body.perms !== 'string') {
      throw new BadRequestException('perms is required');
    }
    const adminId = (req as any).user?.uid;
    await this.adminService.updatePerms(id, body.perms, adminId);
    return { success: true };
  }

  @UseGuards(SuperAdminGuard)
  @Post('users/:id/impersonate')
  async impersonateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const admin = (req as any).user;
    const adminUid = admin?.uid as string;
    const adminName = admin?.name as string ?? 'Admin';

    // Log impersonation on both accounts
    await this.auditLogService.log(adminUid, 'admin_impersonate', `Started impersonating user ${id}`);
    await this.auditLogService.log(id, 'admin_impersonate', `Admin ${adminName} started impersonating this account`);

    return this.authService.issueImpersonationToken(id, adminUid, adminName);
  }

  // ── Projects ──

  @UseGuards(ReviewerGuard)
  @Get('projects')
  listProjects() {
    return this.adminService.listAllProjects();
  }

  @UseGuards(ReviewerGuard)
  @Get('projects/:id/hackatime')
  getProjectHackatime(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getProjectHackatime(id);
  }

  @UseGuards(ReviewerGuard)
  @Post('projects/:id/review')
  async reviewProject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: {
      status?: string;
      feedback?: string;
      internalNote?: string;
      overrideJustification?: string;
      overrideHours?: number;
      internalHours?: number;
    },
    @Req() req: Request,
  ) {
    const validStatuses = ['approved', 'changes_needed', 'ban'];
    if (!body.status || !validStatuses.includes(body.status)) {
      throw new BadRequestException(`status must be one of: ${validStatuses.join(', ')}`);
    }
    const reviewerId = (req as any).user?.uid;

    if (body.status === 'ban') {
      return this.adminService.banAndRejectProject(
        id,
        reviewerId,
        body.feedback ?? null,
        body.internalNote ?? null,
        body.overrideJustification ?? null,
      );
    }

    return this.adminService.reviewProject(
      id,
      reviewerId,
      body.status,
      body.feedback ?? null,
      body.internalNote ?? null,
      body.overrideJustification ?? null,
      body.overrideHours ?? null,
      body.internalHours ?? null,
    );
  }

  @UseGuards(ReviewerGuard)
  @Get('projects/:id/reviews')
  getProjectReviews(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getProjectReviews(id, true);
  }

  // ── News CRUD ──

  @UseGuards(SuperAdminGuard)
  @Get('news')
  listNews() {
    return this.adminService.listNews();
  }

  @UseGuards(SuperAdminGuard)
  @Post('news')
  async createNews(@Body() body: { text?: string; displayDate?: string }) {
    if (!body.text || !body.displayDate) {
      throw new BadRequestException('text and displayDate are required');
    }
    return this.adminService.createNews(body.text, body.displayDate);
  }

  @UseGuards(SuperAdminGuard)
  @Patch('news/:id')
  async updateNews(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { text?: string; displayDate?: string },
  ) {
    return this.adminService.updateNews(id, body);
  }

  @UseGuards(SuperAdminGuard)
  @Delete('news/:id')
  async deleteNews(@Param('id', ParseUUIDPipe) id: string) {
    await this.adminService.deleteNews(id);
    return { success: true };
  }

  // ── Shop CRUD ──

  @UseGuards(SuperAdminGuard)
  @Get('shop')
  listShopItems() {
    return this.adminService.listShopItems();
  }

  @UseGuards(SuperAdminGuard)
  @Post('shop')
  async createShopItem(@Body() body: {
    name?: string;
    description?: string;
    imageUrl?: string;
    priceHours?: number;
    stock?: number | null;
    estimatedShip?: string | null;
    isActive?: boolean;
  }) {
    if (!body.name || !body.description || !body.imageUrl || body.priceHours == null) {
      throw new BadRequestException('name, description, imageUrl, and priceHours are required');
    }
    if (!Number.isInteger(body.priceHours) || body.priceHours < 1) {
      throw new BadRequestException('priceHours must be a positive integer');
    }
    if (body.stock !== undefined && body.stock !== null) {
      if (!Number.isInteger(body.stock) || body.stock < 0) {
        throw new BadRequestException('stock must be a non-negative integer or null');
      }
    }
    return this.adminService.createShopItem({
      name: body.name,
      description: body.description,
      imageUrl: body.imageUrl,
      priceHours: body.priceHours,
      stock: body.stock,
      estimatedShip: body.estimatedShip,
      isActive: body.isActive,
    });
  }

  @UseGuards(SuperAdminGuard)
  @Patch('shop/reorder')
  async reorderShopItems(@Body() body: { items?: { id: string; sortOrder: number }[] }) {
    if (!Array.isArray(body.items) || body.items.length === 0) {
      throw new BadRequestException('items array is required');
    }
    for (const item of body.items) {
      if (!item.id || typeof item.sortOrder !== 'number' || !Number.isInteger(item.sortOrder) || item.sortOrder < 0) {
        throw new BadRequestException('each item must have a valid id and non-negative integer sortOrder');
      }
    }
    await this.adminService.reorderShopItems(body.items);
    return { success: true };
  }

  @UseGuards(SuperAdminGuard)
  @Patch('shop/:id')
  async updateShopItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: {
      name?: string;
      description?: string;
      imageUrl?: string;
      priceHours?: number;
      stock?: number | null;
      estimatedShip?: string | null;
      isActive?: boolean;
    },
  ) {
    if (body.priceHours !== undefined) {
      if (!Number.isInteger(body.priceHours) || body.priceHours < 1) {
        throw new BadRequestException('priceHours must be a positive integer');
      }
    }
    if (body.stock !== undefined && body.stock !== null) {
      if (!Number.isInteger(body.stock) || body.stock < 0) {
        throw new BadRequestException('stock must be a non-negative integer or null');
      }
    }
    return this.adminService.updateShopItem(id, body);
  }

  @UseGuards(SuperAdminGuard)
  @Delete('shop/:id')
  async deleteShopItem(@Param('id', ParseUUIDPipe) id: string) {
    await this.adminService.deleteShopItem(id);
    return { success: true };
  }

  // ── Orders / Fulfillment ──

  @UseGuards(SuperAdminGuard)
  @Get('orders')
  listOrders(@Req() req: Request) {
    const query = (req as any).query ?? {};
    return this.shopService.listAllOrders({
      shopItemId: query.shopItemId,
      status: query.status,
      sortBy: query.sortBy,
    });
  }

  @UseGuards(SuperAdminGuard)
  @Post('orders/:id/fulfill')
  async fulfillOrder(@Param('id', ParseUUIDPipe) id: string) {
    return this.shopService.fulfillOrder(id);
  }

  @UseGuards(SuperAdminGuard)
  @Post('orders/:id/message')
  async sendFulfillmentMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { message?: string },
  ) {
    if (!body.message || typeof body.message !== 'string') {
      throw new BadRequestException('message is required');
    }
    return this.shopService.sendFulfillmentMessage(id, body.message);
  }
}
