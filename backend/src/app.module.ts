import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { UploadModule } from './upload/upload.module';
import { WeightModule } from './weight/weight.module';
import { EvolutionModule } from './evolution/evolution.module';
import { DietModule } from './diet/diet.module';
import { TodoModule } from './todo/todo.module';
import { TrainingModule } from './training/training.module';
import { CheckInModule } from './checkin/checkin.module';
import { CommunityModule } from './community/community.module';
import { ChatModule } from './chat/chat.module';
import { FriendshipModule } from './friendship/friendship.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UserModule,
    UploadModule,
    WeightModule,
    EvolutionModule,
    DietModule,
    TodoModule,
    TrainingModule,
    CheckInModule,
    CommunityModule,
    ChatModule,
    FriendshipModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
