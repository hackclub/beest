import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RsvpModule } from './rsvp/rsvp.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    RsvpModule,
  ],
})
export class AppModule {}
