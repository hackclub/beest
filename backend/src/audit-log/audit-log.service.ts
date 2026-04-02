import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, AuditAction } from '../entities/audit-log.entity';

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLog)
    private auditLogRepo: Repository<AuditLog>,
  ) {}

  async log(userId: string, action: AuditAction, label: string): Promise<void> {
    const entry = this.auditLogRepo.create({
      userId,
      action,
      label: label.replace(/[<>"'`&\\]/g, '').replace(/\0/g, '').trim().slice(0, 255),
    });
    await this.auditLogRepo.save(entry);
  }

  async getForUser(userId: string, limit = 50) {
    return this.auditLogRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
      select: ['id', 'action', 'label', 'createdAt'],
    });
  }
}
