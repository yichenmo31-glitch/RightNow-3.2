import { Module } from '@nestjs/common';
import { CheckInService } from './checkin.service';
import { CheckInController } from './checkin.controller';

@Module({
  controllers: [CheckInController],
  providers: [CheckInService],
})
export class CheckInModule {}
