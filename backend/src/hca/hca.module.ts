import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { HcaService } from './hca.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [HcaService],
  exports: [HcaService],
})
export class HcaModule {}
