import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RsvpModule } from './rsvp/rsvp.module';
import { AuthModule } from './auth/auth.module';
import { HackatimeModule } from './hackatime/hackatime.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { User } from './entities/user.entity';
import { Session } from './entities/session.entity';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.getOrThrow('DATABASE_URL'),
        entities: [User, Session],
        synchronize: config.get('NODE_ENV') !== 'production',
      }),
    }),
    RsvpModule,
    AuthModule,
    HackatimeModule,
    OnboardingModule,
  ],
})
export class AppModule {}
