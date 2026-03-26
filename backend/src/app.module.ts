import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RsvpModule } from './rsvp/rsvp.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    RsvpModule,
    AuthModule,
  ],
})
export class AppModule {}
