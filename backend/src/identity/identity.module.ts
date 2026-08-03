import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { IdentityService } from './identity.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [IdentityService],
  exports: [IdentityService],
})
export class IdentityModule {}
