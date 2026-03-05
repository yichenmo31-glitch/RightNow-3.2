import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { WeightService } from './weight.service';
import { CreateWeightDto } from './dto/create-weight.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Weight')
@ApiBearerAuth()
@Controller('weight')
export class WeightController {
  constructor(private weightService: WeightService) {}

  @Get()
  @ApiOperation({ summary: '查看体重记录列表' })
  @ApiQuery({ name: 'from', required: false, example: '2026-02-20' })
  @ApiQuery({ name: 'to', required: false, example: '2026-02-27' })
  findAll(
    @CurrentUser('id') userId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.weightService.findAll(userId, from, to);
  }

  @Post()
  @ApiOperation({ summary: '新增一条体重记录' })
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateWeightDto,
  ) {
    return this.weightService.create(userId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新体重记录' })
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: CreateWeightDto,
  ) {
    return this.weightService.update(userId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除体重记录' })
  remove(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.weightService.remove(userId, id);
  }
}
