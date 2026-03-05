import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('password123', 10);

  const user = await prisma.user.upsert({
    where: { email: 'test@rightnow.com' },
    update: {},
    create: {
      email: 'test@rightnow.com',
      password,
      name: 'Test User',
      gender: 'male',
      height: 175,
      weight: 75,
      age: 28,
      bodyStyle: 'athletic',
      currentPhase: 'cutting',
      goalWeight: 70,
      activityLevel: 'moderate',
      isProfileComplete: true,
    },
  });

  console.log('Created test user:', user.email);

  // Sample weight records
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    await prisma.weightRecord.create({
      data: {
        date,
        weight: 75 - i * 0.2,
        waist: 80 - i * 0.1,
        userId: user.id,
      },
    });
  }
  console.log('Created 7 weight records');

  // Sample food entries
  await prisma.foodEntry.create({
    data: {
      name: 'Chicken Breast',
      calories: 350,
      protein: 40,
      fat: 8,
      carbs: 5,
      date: today,
      mealType: 'lunch',
      userId: user.id,
    },
  });
  console.log('Created sample food entry');

  // Sample todo items
  const categories = ['diet', 'water', 'training'];
  for (const category of categories) {
    await prisma.todoItem.create({
      data: {
        title: `Complete ${category} goal`,
        category,
        date: today,
        userId: user.id,
      },
    });
  }
  console.log('Created 3 todo items');

  // Sample check-in
  await prisma.checkIn.create({
    data: {
      type: 'strength',
      note: 'Upper body day',
      userId: user.id,
    },
  });
  console.log('Created sample check-in');

  // Sample post
  await prisma.post.create({
    data: {
      content: 'Just finished my first week of training!',
      tags: ['fitness', 'progress'],
      userId: user.id,
    },
  });
  console.log('Created sample post');

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
