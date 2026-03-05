import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { TrainingService } from './training.service';
import { CreateTrainingDto } from './dto/create-training.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Training')
@ApiBearerAuth()
@Controller('training')
export class TrainingController {
  constructor(private trainingService: TrainingService) {}

  @Get()
  @ApiOperation({ summary: '按日期查看训练记录' })
  @ApiQuery({ name: 'date', required: false, example: '2026-02-27' })
  findByDate(
    @CurrentUser('id') userId: string,
    @Query('date') date?: string,
  ) {
    return this.trainingService.findByDate(userId, date);
  }

  @Post()
  @ApiOperation({ summary: '新增训练记录' })
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateTrainingDto,
  ) {
    return this.trainingService.create(userId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新训练记录' })
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: CreateTrainingDto,
  ) {
    return this.trainingService.update(userId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除训练记录' })
  remove(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.trainingService.remove(userId, id);
  }
}
