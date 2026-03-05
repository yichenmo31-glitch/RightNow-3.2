import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CheckInService } from './checkin.service';
import { CreateCheckInDto } from './dto/create-checkin.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('CheckIns')
@ApiBearerAuth()
@Controller('checkins')
export class CheckInController {
  constructor(private checkInService: CheckInService) {}

  @Get()
  findAll(
    @CurrentUser('id') userId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.checkInService.findAll(userId, from, to);
  }

  @Post()
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateCheckInDto,
  ) {
    return this.checkInService.create(userId, dto);
  }

  @Get('latest')
  latest(@CurrentUser('id') userId: string) {
    return this.checkInService.latest(userId);
  }
}
