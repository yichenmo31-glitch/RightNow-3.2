import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
class FriendshipsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const records = await this.prisma.friendship.findMany({
      where: {
        OR: [{ requesterId: userId }, { receiverId: userId }],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        requester: true,
        receiver: true,
      },
    });

    return records.map((record) => this.mapRecord(record, userId));
  }

  async request(userId: string, receiverId: string) {
    const targetId = receiverId.trim();
    if (!targetId) {
      throw new BadRequestException('receiverId is required');
    }
    if (targetId === userId) {
      throw new BadRequestException('Cannot add yourself');
    }

    let receiver = await this.prisma.user.findUnique({
      where: { id: targetId },
    });

    if (!receiver) {
      const passwordHash = await bcrypt.hash('password123', 10);
      receiver = await this.prisma.user.create({
        data: {
          id: targetId,
          email: `${targetId}@placeholder.rightnow.local`,
          passwordHash,
          name: `Buddy ${targetId.slice(0, 6)}`,
          isProfileComplete: true,
        },
      });
    }

    const existing = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: userId, receiverId: receiver.id },
          { requesterId: receiver.id, receiverId: userId },
        ],
      },
      include: {
        requester: true,
        receiver: true,
      },
    });

    if (existing) {
      if (
        existing.status === 'pending' &&
        existing.receiverId === userId &&
        existing.requesterId === receiver.id
      ) {
        const accepted = await this.prisma.friendship.update({
          where: { id: existing.id },
          data: { status: 'accepted' },
          include: {
            requester: true,
            receiver: true,
          },
        });
        return this.mapRecord(accepted, userId);
      }

      return this.mapRecord(existing, userId);
    }

    const record = await this.prisma.friendship.create({
      data: {
        requesterId: userId,
        receiverId: receiver.id,
        status: 'pending',
      },
      include: {
        requester: true,
        receiver: true,
      },
    });

    return this.mapRecord(record, userId);
  }

  async accept(userId: string, id: string) {
    const existing = await this.prisma.friendship.findUnique({
      where: { id },
      include: {
        requester: true,
        receiver: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Friendship not found');
    }

    if (existing.requesterId !== userId && existing.receiverId !== userId) {
      throw new ForbiddenException('Not allowed to accept this request');
    }

    const record = await this.prisma.friendship.update({
      where: { id },
      data: { status: 'accepted' },
      include: {
        requester: true,
        receiver: true,
      },
    });

    return this.mapRecord(record, userId);
  }

  async remove(userId: string, id: string) {
    const existing = await this.prisma.friendship.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Friendship not found');
    }

    if (existing.requesterId !== userId && existing.receiverId !== userId) {
      throw new ForbiddenException('Not allowed to remove this friendship');
    }

    await this.prisma.friendship.delete({
      where: { id },
    });

    return { deleted: true };
  }

  private mapRecord(
    record: {
      id: string;
      status: string;
      createdAt: Date;
      requesterId: string;
      receiverId: string;
      requester: { id: string; name: string; avatar: string | null };
      receiver: { id: string; name: string; avatar: string | null };
    },
    currentUserId: string,
  ) {
    const otherUser =
      record.requesterId === currentUserId ? record.receiver : record.requester;

    return {
      id: record.id,
      user: {
        id: otherUser.id,
        name: otherUser.name,
        avatar: otherUser.avatar ?? undefined,
      },
      status: record.status as 'pending' | 'accepted',
      createdAt: record.createdAt.toISOString(),
    };
  }
}

@Controller('friendships')
@UseGuards(JwtAuthGuard)
class FriendshipsController {
  constructor(private readonly friendshipsService: FriendshipsService) {}

  @Get()
  list(@CurrentUser() user: { sub: string }) {
    return this.friendshipsService.list(user.sub);
  }

  @Post('request')
  request(
    @CurrentUser() user: { sub: string },
    @Body() body: { receiverId: string },
  ) {
    return this.friendshipsService.request(user.sub, body.receiverId);
  }

  @Patch(':id/accept')
  accept(@CurrentUser() user: { sub: string }, @Param('id') id: string) {
    return this.friendshipsService.accept(user.sub, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: { sub: string }, @Param('id') id: string) {
    return this.friendshipsService.remove(user.sub, id);
  }
}

@Module({
  controllers: [FriendshipsController],
  providers: [FriendshipsService],
})
export class FriendshipsModule {}
