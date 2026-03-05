import {
  Controller, Get, Post, Delete,
  Body, Param, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { CommunityService } from './community.service';
import { CreatePostDto } from './dto/create-post.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Community')
@ApiBearerAuth()
@Controller()
export class CommunityController {
  constructor(private communityService: CommunityService) {}

  @Get('posts')
  @ApiOperation({ summary: '查看社区帖子列表' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  findAllPosts(
    @CurrentUser('id') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.communityService.findAllPosts(userId, page, limit);
  }

  @Post('posts')
  @ApiOperation({ summary: '发布新帖子' })
  createPost(
    @CurrentUser('id') userId: string,
    @Body() dto: CreatePostDto,
  ) {
    return this.communityService.createPost(userId, dto);
  }

  @Get('posts/:id')
  @ApiOperation({ summary: '查看帖子详情' })
  getPost(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.communityService.getPost(userId, id);
  }

  @Delete('posts/:id')
  @ApiOperation({ summary: '删除帖子' })
  deletePost(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.communityService.deletePost(userId, id);
  }

  @Post('posts/:id/like')
  @ApiOperation({ summary: '点赞/取消点赞帖子' })
  toggleLike(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.communityService.toggleLike(userId, id);
  }

  @Get('posts/:id/comments')
  @ApiOperation({ summary: '查看帖子评论' })
  getComments(@Param('id') id: string) {
    return this.communityService.getComments(id);
  }

  @Post('posts/:id/comments')
  @ApiOperation({ summary: '发表评论' })
  createComment(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.communityService.createComment(userId, id, dto);
  }

  @Delete('comments/:id')
  @ApiOperation({ summary: '删除评论' })
  deleteComment(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.communityService.deleteComment(userId, id);
  }
}
