import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { DietService } from './diet.service';
import { CreateDietDto } from './dto/create-diet.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Diet')
@ApiBearerAuth()
@Controller('diet')
export class DietController {
  constructor(private dietService: DietService) {}

  @Get()
  @ApiOperation({ summary: '按日期查看饮食记录' })
  @ApiQuery({ name: 'date', required: false, example: '2026-02-27' })
  findByDate(
    @CurrentUser('id') userId: string,
    @Query('date') date?: string,
  ) {
    return this.dietService.findByDate(userId, date);
  }

  @Get('summary')
  @ApiOperation({ summary: '查看某日饮食摘要（总热量等）' })
  @ApiQuery({ name: 'date', required: true, example: '2026-02-27' })
  summary(
    @CurrentUser('id') userId: string,
    @Query('date') date: string,
  ) {
    return this.dietService.summary(userId, date);
  }

  @Post()
  @ApiOperation({ summary: '新增一条饮食记录' })
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateDietDto,
  ) {
    return this.dietService.create(userId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新饮食记录' })
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: CreateDietDto,
  ) {
    return this.dietService.update(userId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除饮食记录' })
  remove(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.dietService.remove(userId, id);
  }
}
