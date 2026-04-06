import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { RsvpModule } from '../rsvp/rsvp.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { User } from '../entities/user.entity';
import { Session } from '../entities/session.entity';
import { Project } from '../entities/project.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { NewsItem } from '../entities/news-item.entity';
import { ProjectReview } from '../entities/project-review.entity';
import { ShopItem } from '../entities/shop-item.entity';
import { Order } from '../entities/order.entity';
import { ShopModule } from '../shop/shop.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { SuperAdminGuard } from './super-admin.guard';
import { ReviewerGuard } from './reviewer.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Session, Project, AuditLog, NewsItem, ProjectReview, ShopItem, Order]),
    AuthModule,
    RsvpModule,
    AuditLogModule,
    ShopModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, SuperAdminGuard, ReviewerGuard],
})
export class AdminModule {}
