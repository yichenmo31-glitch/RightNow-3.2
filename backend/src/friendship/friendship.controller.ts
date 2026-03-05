import {
  Controller, Get, Post, Patch, Delete,
  Body, Param,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { FriendshipService } from './friendship.service';
import { CreateFriendshipDto } from './dto/create-friendship.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Friendships')
@ApiBearerAuth()
@Controller('friendships')
export class FriendshipController {
  constructor(private friendshipService: FriendshipService) {}

  @Get()
  @ApiOperation({ summary: '查看好友列表' })
  findAll(@CurrentUser('id') userId: string) {
    return this.friendshipService.findAll(userId);
  }

  @Post('request')
  @ApiOperation({ summary: '发送好友请求' })
  sendRequest(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateFriendshipDto,
  ) {
    return this.friendshipService.sendRequest(userId, dto.receiverId);
  }

  @Patch(':id/accept')
  @ApiOperation({ summary: '接受好友请求' })
  accept(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.friendshipService.accept(userId, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除好友' })
  remove(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.friendshipService.remove(userId, id);
  }
}
