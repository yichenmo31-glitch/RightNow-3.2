import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';
import { CreateCommentDto } from './dto/create-comment.dto';

@Injectable()
export class CommunityService {
  constructor(private prisma: PrismaService) {}

  async findAllPosts(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const posts = await this.prisma.post.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, avatar: true } },
        _count: { select: { likes: true, comments: true } },
        likes: { where: { userId }, select: { id: true } },
      },
    });
    return posts.map((p) => ({
      ...p,
      likesCount: p._count.likes,
      commentsCount: p._count.comments,
      isLikedByMe: p.likes.length > 0,
      _count: undefined,
      likes: undefined,
    }));
  }

  async getPost(userId: string, id: string) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, avatar: true } },
        _count: { select: { likes: true, comments: true } },
        likes: { where: { userId }, select: { id: true } },
      },
    });
    if (!post) throw new NotFoundException('Post not found');
    return {
      ...post,
      likesCount: post._count.likes,
      commentsCount: post._count.comments,
      isLikedByMe: post.likes.length > 0,
      _count: undefined,
      likes: undefined,
    };
  }

  async createPost(userId: string, dto: CreatePostDto) {
    return this.prisma.post.create({
      data: { ...dto, userId },
      include: { user: { select: { id: true, name: true, avatar: true } } },
    });
  }

  async deletePost(userId: string, id: string) {
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.userId !== userId) throw new ForbiddenException();
    return this.prisma.post.delete({ where: { id } });
  }

  async toggleLike(userId: string, postId: string) {
    const existing = await this.prisma.postLike.findUnique({
      where: { userId_postId: { userId, postId } },
    });
    if (existing) {
      await this.prisma.postLike.delete({ where: { id: existing.id } });
      return { liked: false };
    }
    await this.prisma.postLike.create({ data: { userId, postId } });
    return { liked: true };
  }

  async getComments(postId: string) {
    return this.prisma.comment.findMany({
      where: { postId },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, name: true, avatar: true } } },
    });
  }

  async createComment(userId: string, postId: string, dto: CreateCommentDto) {
    return this.prisma.comment.create({
      data: { content: dto.content, userId, postId },
      include: { user: { select: { id: true, name: true, avatar: true } } },
    });
  }

  async deleteComment(userId: string, commentId: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.userId !== userId) throw new ForbiddenException();
    return this.prisma.comment.delete({ where: { id: commentId } });
  }
}
