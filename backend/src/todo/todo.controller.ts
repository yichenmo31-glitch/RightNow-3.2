import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { TodoService } from './todo.service';
import { CreateTodoDto, UpdateTodoDto } from './dto/create-todo.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Todos')
@ApiBearerAuth()
@Controller('todos')
export class TodoController {
  constructor(private todoService: TodoService) {}

  @Get()
  @ApiOperation({ summary: '按日期查看待办事项' })
  @ApiQuery({ name: 'date', required: false, example: '2026-02-27' })
  findByDate(
    @CurrentUser('id') userId: string,
    @Query('date') date?: string,
  ) {
    return this.todoService.findByDate(userId, date);
  }

  @Post()
  @ApiOperation({ summary: '新增待办事项' })
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateTodoDto,
  ) {
    return this.todoService.create(userId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新待办事项' })
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTodoDto,
  ) {
    return this.todoService.update(userId, id, dto);
  }

  @Patch(':id/toggle')
  @ApiOperation({ summary: '切换待办完成状态' })
  toggle(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.todoService.toggle(userId, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除待办事项' })
  remove(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.todoService.remove(userId, id);
  }
}
