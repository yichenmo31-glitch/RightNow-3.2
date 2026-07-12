import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Injectable,
  Module,
  Param,
  Patch,
  Post,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async updateProfile(
    userId: string,
    body: {
      name?: string;
      avatar?: string;
      gender?: string;
      height?: number;
      weight?: number;
      age?: number;
      bodyStyle?: string;
      userImage?: string | null;
      userFaceImage?: string | null;
      idealBodyImage?: string | null;
      currentPhase?: string;
      goalWeight?: number;
      activityLevel?: string;
    },
    isOnboarding = false,
  ) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: body.name?.trim() || undefined,
        avatar: body.avatar ?? undefined,
        gender: body.gender ?? undefined,
        height: this.toOptionalNumber(body.height),
        weight: this.toOptionalNumber(body.weight),
        age: this.toOptionalInteger(body.age),
        bodyStyle: body.bodyStyle ?? undefined,
        userImage: this.toOptionalStringOrNull(body.userImage),
        userFaceImage: this.toOptionalStringOrNull(body.userFaceImage),
        idealBodyImage: this.toOptionalStringOrNull(body.idealBodyImage),
        currentPhase: body.currentPhase ?? undefined,
        goalWeight: this.toOptionalNumber(body.goalWeight),
        activityLevel: body.activityLevel ?? undefined,
        isProfileComplete: isOnboarding ? true : undefined,
      },
    });

    return this.toUserProfile(user);
  }

  async getUser(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    return this.toUserProfile(user);
  }

  async requestAccountDeletion(userId: string, password: string, idempotencyKey: string) {
    if (typeof password !== 'string' || password.length < 6) {
      throw new BadRequestException('password is required');
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{15,127}$/.test(idempotencyKey)) {
      throw new BadRequestException('Idempotency-Key is invalid');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true, accountStatus: true },
    });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid password');
    }

    const job = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.accountDeletionJob.findUnique({ where: { userId } });
      if (existing) {
        if (existing.idempotencyKey !== idempotencyKey) {
          throw new ConflictException('Account deletion is already pending');
        }
        return existing;
      }
      if (user.accountStatus !== 'ACTIVE') {
        throw new ConflictException('Account deletion is already pending');
      }
      const frozen = await tx.user.updateMany({
        where: { id: userId, accountStatus: 'ACTIVE' },
        data: {
          accountStatus: 'DELETION_PENDING',
          deletionRequestedAt: new Date(),
          authVersion: { increment: 1 },
        },
      });
      if (frozen.count !== 1) throw new ConflictException('Account deletion is already pending');
      await tx.agentBindToken.deleteMany({ where: { userId } });
      await tx.agentChannelBinding.deleteMany({ where: { userId } });
      await tx.wechatBinding.deleteMany({ where: { userId } });
      await tx.wechatBindCode.deleteMany({ where: { userId } });
      return tx.accountDeletionJob.create({
        data: {
          userId,
          idempotencyKey,
          externalOperationId: `account-delete-${randomUUID()}`,
        },
      });
    });
    return { deletionId: job.id, status: job.status, requestedAt: job.requestedAt.toISOString() };
  }

  private toOptionalNumber(value: unknown): number | undefined {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private toOptionalInteger(value: unknown): number | undefined {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }

    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private toUserProfile(user: {
    id: string;
    email: string;
    name: string;
    avatar: string | null;
    gender: string | null;
    height: number | null;
    weight: number | null;
    age: number | null;
    bodyStyle: string | null;
    userImage: string | null;
    userFaceImage: string | null;
    currentPhase: string | null;
    goalWeight: number | null;
    activityLevel: string | null;
    idealBodyImage: string | null;
    isProfileComplete: boolean;
  }) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar ?? undefined,
      gender: user.gender ?? undefined,
      height: user.height ?? undefined,
      weight: user.weight ?? undefined,
      age: user.age ?? undefined,
      bodyStyle: user.bodyStyle ?? undefined,
      userImage: user.userImage ?? undefined,
      userFaceImage: user.userFaceImage ?? undefined,
      currentPhase: user.currentPhase ?? undefined,
      goalWeight: user.goalWeight ?? undefined,
      activityLevel: user.activityLevel ?? undefined,
      idealBodyImage: user.idealBodyImage ?? undefined,
      isProfileComplete: user.isProfileComplete,
    };
  }

  private toOptionalStringOrNull(value: unknown): string | null | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
}

@Controller('users')
@UseGuards(JwtAuthGuard)
class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Patch('profile')
  updateProfile(
    @CurrentUser() user: { sub: string },
    @Body()
    body: {
      name?: string;
      avatar?: string;
      gender?: string;
      height?: number;
      weight?: number;
      age?: number;
      bodyStyle?: string;
      userImage?: string | null;
      userFaceImage?: string | null;
      idealBodyImage?: string | null;
      currentPhase?: string;
      goalWeight?: number;
      activityLevel?: string;
    },
  ) {
    return this.usersService.updateProfile(user.sub, body);
  }

  @Post('onboarding')
  onboarding(
    @CurrentUser() user: { sub: string },
    @Body()
    body: {
      name?: string;
      avatar?: string;
      gender?: string;
      height?: number;
      weight?: number;
      age?: number;
      bodyStyle?: string;
      userImage?: string | null;
      userFaceImage?: string | null;
      idealBodyImage?: string | null;
      currentPhase?: string;
      goalWeight?: number;
      activityLevel?: string;
    },
  ) {
    return this.usersService.updateProfile(user.sub, body, true);
  }

  @Delete('me')
  @HttpCode(HttpStatus.ACCEPTED)
  requestAccountDeletion(
    @CurrentUser() user: { sub: string },
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: { password?: string; userId?: string },
  ) {
    if (Object.prototype.hasOwnProperty.call(body || {}, 'userId')) {
      throw new BadRequestException('userId is not accepted');
    }
    return this.usersService.requestAccountDeletion(
      user.sub,
      body?.password || '',
      idempotencyKey || '',
    );
  }

  @Get(':id')
  getUser(@Param('id') id: string) {
    return this.usersService.getUser(id);
  }
}

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
