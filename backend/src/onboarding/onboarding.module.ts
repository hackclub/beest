import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { HackatimeModule } from '../hackatime/hackatime.module';
import { SlackModule } from '../slack/slack.module';
import { ProjectsModule } from '../projects/projects.module';
import { User } from '../entities/user.entity';
import { OnboardingController } from './onboarding.controller';

@Module({
  imports: [AuthModule, HackatimeModule, SlackModule, ProjectsModule, TypeOrmModule.forFeature([User])],
  controllers: [OnboardingController],
})
export class OnboardingModule {}
