import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FriendshipService {
  constructor(private prisma: PrismaService) {}

  async sendRequest(senderId: string, receiverId: string) {
    const existing = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { senderId, receiverId },
          { senderId: receiverId, receiverId: senderId },
        ],
      },
    });
    if (existing) throw new ConflictException('Friendship already exists');
    return this.prisma.friendship.create({
      data: { senderId, receiverId },
      include: {
        receiver: { select: { id: true, name: true, avatar: true } },
      },
    });
  }

  async accept(userId: string, id: string) {
    const f = await this.prisma.friendship.findUnique({ where: { id } });
    if (!f || f.receiverId !== userId)
      throw new NotFoundException('Request not found');
    return this.prisma.friendship.update({
      where: { id },
      data: { status: 'accepted' },
    });
  }

  async remove(userId: string, id: string) {
    const f = await this.prisma.friendship.findUnique({ where: { id } });
    if (!f || (f.senderId !== userId && f.receiverId !== userId))
      throw new NotFoundException('Friendship not found');
    return this.prisma.friendship.delete({ where: { id } });
  }

  async findAll(userId: string) {
    const friendships = await this.prisma.friendship.findMany({
      where: {
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      include: {
        sender: { select: { id: true, name: true, avatar: true } },
        receiver: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const friends = friendships.filter((f) => f.status === 'accepted');
    const pending = friendships.filter(
      (f) => f.status === 'pending' && f.receiverId === userId,
    );
    return { friends, pending };
  }
}
