import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('password123', 10);

  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@rightnow.fit' },
    update: {},
    create: {
      email: 'demo@rightnow.fit',
      passwordHash,
      name: 'Demo User',
      isProfileComplete: true,
      currentPhase: 'B',
    },
  });

  const buddyUser = await prisma.user.upsert({
    where: { email: 'buddy@rightnow.fit' },
    update: {},
    create: {
      email: 'buddy@rightnow.fit',
      passwordHash,
      name: 'Gym Buddy',
      isProfileComplete: true,
      currentPhase: 'C',
    },
  });

  const friendship = await prisma.friendship.findFirst({
    where: {
      requesterId: demoUser.id,
      receiverId: buddyUser.id,
    },
  });

  if (!friendship) {
    await prisma.friendship.create({
      data: {
        requesterId: demoUser.id,
        receiverId: buddyUser.id,
        status: 'accepted',
      },
    });
  }

  const postCount = await prisma.post.count({
    where: { userId: buddyUser.id },
  });

  if (postCount === 0) {
    await prisma.post.create({
      data: {
        userId: buddyUser.id,
        content: 'Completed a full-body workout today. Energy was solid and recovery felt better than last week.',
        tags: ['strength', 'consistency'],
      },
    });
  }
}

main()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
