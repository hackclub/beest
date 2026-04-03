import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Req,
  UseGuards,
  BadRequestException,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { SuperAdminGuard } from './super-admin.guard';
import { AdminService } from './admin.service';
import { AuditLogService } from '../audit-log/audit-log.service';

@Controller('api/admin')
@UseGuards(SuperAdminGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get('users')
  listUsers() {
    return this.adminService.listUsers();
  }

  @Get('users/:id')
  getUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getUser(id);
  }

  @Post('users/:id/ban')
  async banUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const adminUid = (req as any).user?.uid;
    await this.adminService.banUser(id);
    await this.auditLogService.log(
      adminUid,
      'admin_ban',
      `Banned user ${id}`,
    );
    return { success: true };
  }

  @Patch('users/:id/perms')
  async updatePerms(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { perms?: string },
    @Req() req: Request,
  ) {
    if (!body.perms || typeof body.perms !== 'string') {
      throw new BadRequestException('perms is required');
    }
    const adminUid = (req as any).user?.uid;
    await this.adminService.updatePerms(id, body.perms);
    await this.auditLogService.log(
      adminUid,
      'admin_perms_change',
      `Changed user ${id} perms to ${body.perms}`,
    );
    return { success: true };
  }
}
