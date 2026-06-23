import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { readFileSync, writeFileSync } from 'fs';
import { extname, join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { ImageGenService } from '../image-gen/image-gen.module';
import { UPLOADS_DIR, buildUploadUrl } from '../common/upload.util';

export interface StageItem {
  stageIndex: number;
  targetBodyFat: number;
  title: string;
  previewImageUrl?: string;
  isUnlocked: boolean;
  actualImageUrl?: string;
  qualifiedCount: number;
}

export interface PredictionResult {
  days: number;
  predictedDate: string;
  targetStageIndex: number;
  targetBodyFat: number;
  currentBodyFat: number;
  scenario: string;
}

type UserSnapshot = {
  gender: string | null;
  weight: number | null;
  height: number | null;
  age: number | null;
};

const STAGE_COUNT = 7;
const QUALIFIED_REQUIRED = 2;
const QUALIFIED_INTERVAL_HOURS = 24;

const STAGE_TITLES = [
  '当前状态',
  '初始进展',
  '持续进步',
  '变化可见',
  '接近目标',
  '冲刺阶段',
  '目标身材',
] as const;

@Injectable()
export class EvolutionStageService {
  private readonly logger = new Logger(EvolutionStageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly imageGenService?: ImageGenService,
  ) {}

  async getStages(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        gender: true,
        weight: true,
        height: true,
        age: true,
      },
    });

    if (!user) {
      return { stages: [], currentBodyFat: 0 };
    }

    await this.initializeStages(userId, user.gender);

    const [stages, latestAssessment] = await Promise.all([
      this.prisma.evolutionStage.findMany({
        where: { userId },
        orderBy: { stageIndex: 'asc' },
      }),
      this.prisma.evolutionAssessment.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { bodyFatEstimate: true },
      }),
    ]);

    const currentBodyFat =
      latestAssessment?.bodyFatEstimate ?? this.calculateBodyFatFromUser(user);

    const stageItems: StageItem[] = stages.map((stage) => ({
      stageIndex: stage.stageIndex,
      targetBodyFat: stage.targetBodyFat,
      title: stage.title,
      previewImageUrl: this.normalizeImageUrl(stage.previewImageUrl),
      isUnlocked: stage.isUnlocked,
      actualImageUrl: this.normalizeImageUrl(stage.actualImageUrl),
      qualifiedCount: stage.qualifiedCount,
    }));

    return { stages: stageItems, currentBodyFat };
  }

  async assessUpload(userId: string, recordId: string) {
    const [record, user] = await Promise.all([
      this.prisma.evolutionRecord.findFirst({
        where: { id: recordId, userId },
        select: {
          id: true,
          imageUrl: true,
        },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          gender: true,
          weight: true,
          height: true,
          age: true,
        },
      }),
    ]);

    if (!record) {
      throw new NotFoundException('Evolution record not found');
    }

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.initializeStages(userId, user.gender);

    const existingAssessment = await this.prisma.evolutionAssessment.findUnique({
      where: { recordId: record.id },
      select: {
        bodyFatEstimate: true,
        isGeminiCalibrated: true,
      },
    });

    if (existingAssessment) {
      return {
        bodyFat: existingAssessment.bodyFatEstimate,
        isGeminiCalibrated: existingAssessment.isGeminiCalibrated,
      };
    }

    const assessmentCount =
      (await this.prisma.evolutionAssessment.count({ where: { userId } })) + 1;

    // Try real AI vision estimation first, fall back to BMI-based formula.
    let bodyFat = this.calculateBodyFatFromUser(user);
    let aiBodyFat: number | null = null;
    let isGeminiCalibrated = false;

    try {
      const estimated = await this.aiService.estimateBodyFatFromImage(record.imageUrl);
      if (Number.isFinite(estimated)) {
        aiBodyFat = this.normalizeBodyFat(estimated);
        bodyFat = aiBodyFat;
        isGeminiCalibrated = true;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`AI body-fat estimation failed for ${record.id}: ${message}`);
    }

    const normalizedBodyFat = this.normalizeBodyFat(bodyFat);

    try {
      const assessment = await this.prisma.evolutionAssessment.create({
        data: {
          userId,
          recordId: record.id,
          bodyFatEstimate: normalizedBodyFat,
          geminiBodyFat: aiBodyFat,
          isGeminiCalibrated,
          assessmentCount,
        },
        select: {
          createdAt: true,
        },
      });

      await this.checkUnlock(userId, normalizedBodyFat, record.imageUrl, assessment.createdAt);

      // Generate next-stage preview image asynchronously (fire-and-forget).
      this.generateNextStagePreview(userId, record.imageUrl).catch((error) => {
        const message = error instanceof Error ? error.message : 'unknown error';
        this.logger.warn(`Stage preview generation failed for record ${record.id}: ${message}`);
      });

      return { bodyFat: normalizedBodyFat, isGeminiCalibrated };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const duplicate = await this.prisma.evolutionAssessment.findUnique({
          where: { recordId: record.id },
          select: {
            bodyFatEstimate: true,
            isGeminiCalibrated: true,
          },
        });

        if (duplicate) {
          return {
            bodyFat: duplicate.bodyFatEstimate,
            isGeminiCalibrated: duplicate.isGeminiCalibrated,
          };
        }
      }

      throw error;
    }
  }

  async getPrediction(
    userId: string,
    scenario: { proteinChangePercent?: number } = {},
  ): Promise<PredictionResult> {
    const since = new Date();
    since.setDate(since.getDate() - 7);

    const [assessments, stages, user, dietRecords] = await Promise.all([
      this.prisma.evolutionAssessment.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: { bodyFatEstimate: true, createdAt: true },
      }),
      this.prisma.evolutionStage.findMany({
        where: { userId },
        orderBy: { stageIndex: 'asc' },
        select: { stageIndex: true, targetBodyFat: true, isUnlocked: true },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { gender: true, weight: true, height: true, age: true },
      }),
      this.prisma.dietRecord.findMany({
        where: {
          userId,
          createdAt: { gte: since },
        },
        select: { protein: true, createdAt: true },
      }),
    ]);

    const currentBodyFat = assessments.length
      ? assessments[assessments.length - 1].bodyFatEstimate
      : this.calculateBodyFatFromUser(user);

    const nextLockedStage = stages.find((s) => s.stageIndex > 0 && !s.isUnlocked);
    const targetStage = nextLockedStage ?? stages.find((s) => s.stageIndex === 6);
    const targetBodyFat =
      targetStage?.targetBodyFat ?? this.calculateTargetBodyFat(user?.gender ?? null);

    // Compute real body-fat change slope (% per day) from the most recent assessments.
    let slopePerDay = -0.04;
    if (assessments.length >= 2) {
      const recent = assessments.slice(-7);
      const first = recent[0];
      const last = recent[recent.length - 1];
      const days = Math.max(
        1,
        (last.createdAt.getTime() - first.createdAt.getTime()) / (1000 * 60 * 60 * 24),
      );
      slopePerDay = (last.bodyFatEstimate - first.bodyFatEstimate) / days;
    }

    // Adjust speed based on the requested protein change scenario.
    const proteinChangePercent = scenario.proteinChangePercent ?? 0;
    const avgProtein =
      dietRecords.reduce((sum, record) => sum + (record.protein ?? 0), 0) /
      Math.max(1, dietRecords.length || 1);
    const proteinFactor =
      proteinChangePercent && avgProtein > 0 ? 1 + proteinChangePercent * 1.5 : 1;

    let adjustedSlope = slopePerDay * proteinFactor;
    if (adjustedSlope >= 0 || Math.abs(adjustedSlope) < 0.001) {
      adjustedSlope = -0.04 * proteinFactor;
    }

    const diff = currentBodyFat - targetBodyFat;
    const daysNeeded = diff > 0 ? Math.ceil(diff / Math.abs(adjustedSlope)) : 0;
    const predictedDate = new Date();
    predictedDate.setDate(predictedDate.getDate() + daysNeeded);
    const predictedDateStr = `${predictedDate.getMonth() + 1}月${predictedDate.getDate()}日`;

    return {
      days: daysNeeded,
      predictedDate: predictedDateStr,
      targetStageIndex: targetStage?.stageIndex ?? 1,
      targetBodyFat: Number(targetBodyFat.toFixed(1)),
      currentBodyFat: Number(currentBodyFat.toFixed(1)),
      scenario:
        proteinChangePercent > 0
          ? `蛋白质摄入 +${Math.round(proteinChangePercent * 100)}%`
          : '当前轨迹',
    };
  }

  private async generateNextStagePreview(userId: string, recordImageUrl: string) {
    if (!this.imageGenService) {
      return;
    }

    try {
      const nextStage = await this.prisma.evolutionStage.findFirst({
        where: { userId, isUnlocked: false },
        orderBy: { stageIndex: 'asc' },
      });

      if (!nextStage) {
        return;
      }

      // Don't regenerate if a user photo preview already exists for this stage.
      if (nextStage.previewImageUrl && this.isGenStageUrl(nextStage.previewImageUrl)) {
        return;
      }

      const dataUrl = await this.imageUrlToDataUrl(recordImageUrl);

      const prompt = [
        'Transform this fitness progress photo to show the same person at exactly',
        `${nextStage.targetBodyFat}% body fat.`,
        'Keep everything else identical: face, skin tone, hair, clothing, posture,',
        'background, and lighting.',
        'The only change is body composition — reduce body fat to',
        `${nextStage.targetBodyFat}%.`,
        'Photorealistic. No face distortion. No background changes.',
      ].join(' ');

      const result = await this.imageGenService.generateIdealBody(userId, {
        prompt,
        currentImageBase64: dataUrl,
      });

      if (!result.image) {
        return;
      }

      const savedUrl = this.saveBase64Image(result.image);

      await this.prisma.evolutionStage.update({
        where: { id: nextStage.id },
        data: { previewImageUrl: savedUrl },
      });

      this.logger.log(
        `Generated stage preview for stage ${nextStage.stageIndex} (user ${userId})`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      this.logger.warn(`Stage preview generation failed: ${message}`);
    }
  }

  private async imageUrlToDataUrl(imageUrl: string): Promise<string> {
    if (imageUrl.startsWith('data:')) {
      return imageUrl;
    }

    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${imageUrl}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const pathname = new URL(imageUrl).pathname;
      const mime = this.mimeFromExt(extname(pathname));
      return `data:${mime};base64,${buffer.toString('base64')}`;
    }

    const localPath = imageUrl.startsWith('/uploads/')
      ? join(process.cwd(), 'uploads', imageUrl.replace('/uploads/', ''))
      : join(process.cwd(), imageUrl);

    const buffer = readFileSync(localPath);
    const mime = this.mimeFromExt(extname(localPath));
    return `data:${mime};base64,${buffer.toString('base64')}`;
  }

  private mimeFromExt(extension: string): string {
    const ext = extension.toLowerCase();
    if (ext === '.png') return 'image/png';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.gif') return 'image/gif';
    return 'image/jpeg';
  }

  private saveBase64Image(dataUrl: string): string {
    let base64Data = dataUrl;
    if (dataUrl.startsWith('data:')) {
      const commaIndex = dataUrl.indexOf(',');
      base64Data = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
    }

    const filename = `gen-stage-${Date.now()}-${Math.round(Math.random() * 1e9)}.png`;
    const filepath = join(UPLOADS_DIR, filename);
    writeFileSync(filepath, Buffer.from(base64Data.replace(/\s/g, ''), 'base64'));
    return buildUploadUrl(filename);
  }

  private isGenStageUrl(url: string): boolean {
    return url.includes('/gen-stage-');
  }

  private async initializeStages(userId: string, gender: string | null) {
    const { start, target } = await this.resolveStageEndpoints(userId, gender);
    const targets = this.buildStageTargets(gender, start, target);
    const stageZeroPreviewImage = await this.getLatestGeneratedIdealImage(userId);

    await Promise.all(
      targets.map((targetBodyFat, stageIndex) =>
        this.prisma.evolutionStage.upsert({
          where: { userId_stageIndex: { userId, stageIndex } },
          create: {
            userId,
            stageIndex,
            targetBodyFat,
            title: STAGE_TITLES[stageIndex] ?? `Stage ${stageIndex + 1}`,
            previewImageUrl:
              stageIndex === 0 ? stageZeroPreviewImage ?? null : null,
            isUnlocked: stageIndex === 0,
            unlockedAt: stageIndex === 0 ? new Date() : null,
            qualifiedCount: stageIndex === 0 ? QUALIFIED_REQUIRED : 0,
          },
          update: {
            targetBodyFat,
            title: STAGE_TITLES[stageIndex] ?? `Stage ${stageIndex + 1}`,
          },
        }),
      ),
    );

    await this.prisma.evolutionStage.updateMany({
      where: {
        userId,
        stageIndex: 0,
        isUnlocked: false,
      },
      data: {
        isUnlocked: true,
        unlockedAt: new Date(),
      },
    });

    await this.prisma.evolutionStage.updateMany({
      where: {
        userId,
        stageIndex: 0,
        qualifiedCount: { lt: QUALIFIED_REQUIRED },
      },
      data: {
        qualifiedCount: QUALIFIED_REQUIRED,
      },
    });

    if (stageZeroPreviewImage) {
      await this.prisma.evolutionStage.updateMany({
        where: {
          userId,
          stageIndex: 0,
          NOT: {
            previewImageUrl: stageZeroPreviewImage,
          },
        },
        data: {
          previewImageUrl: stageZeroPreviewImage,
        },
      });
    }
  }

  private async resolveStageEndpoints(
    userId: string,
    gender: string | null,
  ): Promise<{ start: number; target: number }> {
    const latestAssessment = await this.prisma.evolutionAssessment.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { bodyFatEstimate: true },
    });

    const start = latestAssessment?.bodyFatEstimate
      ? this.normalizeBodyFat(latestAssessment.bodyFatEstimate)
      : gender === 'female'
        ? 35
        : 25;

    const coachGoal = await this.prisma.aiCoachAssessment.findUnique({
      where: { userId },
      select: { targetBodyFatEstimate: true },
    });

    const target = coachGoal?.targetBodyFatEstimate
      ? this.normalizeBodyFat(coachGoal.targetBodyFatEstimate)
      : this.calculateTargetBodyFat(gender);

    return { start: Math.max(start, target), target };
  }

  private async checkUnlock(
    userId: string,
    bodyFat: number,
    latestImageUrl: string | null,
    assessedAt: Date,
  ) {
    const stage = await this.prisma.evolutionStage.findFirst({
      where: {
        userId,
        isUnlocked: false,
      },
      orderBy: {
        stageIndex: 'asc',
      },
    });

    if (!stage) {
      return;
    }

    if (bodyFat > stage.targetBodyFat) {
      if (stage.qualifiedCount > 0 || stage.lastQualifiedAt) {
        await this.prisma.evolutionStage.update({
          where: { id: stage.id },
          data: {
            qualifiedCount: 0,
            lastQualifiedAt: null,
          },
        });
      }
      return;
    }

    const qualifiedCount = Math.max(0, stage.qualifiedCount);

    if (!stage.lastQualifiedAt) {
      await this.prisma.evolutionStage.update({
        where: { id: stage.id },
        data: {
          qualifiedCount: Math.max(1, qualifiedCount),
          lastQualifiedAt: assessedAt,
        },
      });
      return;
    }

    const elapsedHours =
      (assessedAt.getTime() - stage.lastQualifiedAt.getTime()) / (1000 * 60 * 60);

    if (elapsedHours < QUALIFIED_INTERVAL_HOURS) {
      if (qualifiedCount < 1) {
        await this.prisma.evolutionStage.update({
          where: { id: stage.id },
          data: {
            qualifiedCount: 1,
          },
        });
      }
      return;
    }

    const nextQualifiedCount = Math.min(QUALIFIED_REQUIRED, qualifiedCount + 1);
    const data: Prisma.EvolutionStageUpdateInput = {
      qualifiedCount: nextQualifiedCount,
      lastQualifiedAt: assessedAt,
    };

    if (nextQualifiedCount >= QUALIFIED_REQUIRED) {
      data.isUnlocked = true;
      data.unlockedAt = assessedAt;
      const normalizedImageUrl = this.normalizeImageUrl(latestImageUrl);
      if (normalizedImageUrl) {
        data.actualImageUrl = normalizedImageUrl;
      }
    }

    await this.prisma.evolutionStage.update({
      where: { id: stage.id },
      data,
    });
  }

  private buildStageTargets(
    gender: string | null,
    start?: number,
    target?: number,
  ): number[] {
    const safeStart = start ?? (gender === 'female' ? 35 : 25);
    const safeTarget = target ?? this.calculateTargetBodyFat(gender);

    return Array.from({ length: STAGE_COUNT }, (_, index) => {
      if (index === 0) {
        return Number(safeStart.toFixed(1));
      }

      if (index === STAGE_COUNT - 1) {
        return Number(safeTarget.toFixed(1));
      }

      const interval = (safeStart - safeTarget) / (STAGE_COUNT - 1);
      return Number((safeStart - interval * index).toFixed(1));
    });
  }

  private calculateTargetBodyFat(gender: string | null): number {
    return gender === 'female' ? 20 : 12;
  }

  private async getLatestGeneratedIdealImage(userId: string): Promise<string | undefined> {
    const task = await this.prisma.imageGenTask.findFirst({
      where: {
        userId,
        status: 'completed',
        resultImageUrl: { not: null },
      },
      orderBy: { updatedAt: 'desc' },
      select: { resultImageUrl: true },
    });

    return this.normalizeImageUrl(task?.resultImageUrl);
  }

  private normalizeImageUrl(imageUrl: string | null | undefined): string | undefined {
    if (!imageUrl) {
      return undefined;
    }

    const normalized = imageUrl.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private normalizeBodyFat(value: number): number {
    return Number(Math.max(3, Math.min(60, value)).toFixed(1));
  }

  private calculateBodyFatFromUser(user: UserSnapshot | null | undefined): number {
    if (!user) {
      return 25;
    }

    if (
      !user.weight ||
      !user.height ||
      user.weight <= 0 ||
      user.height <= 0
    ) {
      return user.gender === 'female' ? 35 : 25;
    }

    const bmi = user.weight / Math.pow(user.height / 100, 2);
    if (!Number.isFinite(bmi)) {
      return user.gender === 'female' ? 35 : 25;
    }

    const age = user.age && user.age > 0 ? user.age : 30;
    const estimated =
      user.gender === 'female'
        ? 1.2 * bmi + 0.23 * age - 5.4
        : 1.2 * bmi + 0.23 * age - 16.2;

    return this.normalizeBodyFat(estimated);
  }
}
