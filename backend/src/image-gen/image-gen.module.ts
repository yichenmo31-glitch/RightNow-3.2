import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  InternalServerErrorException,
  Module,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AiModule } from '../ai/ai.module';
import { AiService } from '../ai/ai.service';
import sharp from 'sharp';
import { createHash, randomUUID } from 'crypto';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { buildUploadUrl, UPLOADS_DIR } from '../common/upload.util';

interface IdealBodyGenerateInput {
  prompt?: string;
  currentImageBase64?: string;
  referenceImageBase64?: string;
  size?: string;
  variant?: string;
  targetStyle?: string;
  gender?: string;
  expectedSourceFat?: number;
  targetBodyFat?: number;
  batchId?: string;
}

const IDEAL_VARIANTS = new Set(['lean', 'athletic', 'strong']);
const IDEAL_PROMPT_VERSION = 'ideal-v2';

interface ImageProviderConfig {
  /** Provider label for tagging / logging (e.g. "L0:gpt-image-2", "L1:ark-seedream"). */
  label: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  fallbackModel?: string;
  /** Per-provider proxy URL override. Falls back to global IMAGE_GEN_PROXY_URL. */
  proxyUrl?: string;
  size: string;
}

interface ArkImageProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  proxyUrl?: string;
  size: string;
}

interface LegacyImageProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  proxyUrl?: string;
  size: string;
}

interface GeneratedProviderResult {
  image: string;
  provider: string;
  model: string;
}

@Injectable()
export class ImageGenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly aiService: AiService,
  ) {}

  async create(userId: string, data: {
    sourceImageUrl?: string;
    targetStyle?: string;
    prompt?: string;
  }) {
    return this.prisma.imageGenTask.create({
      data: { userId, ...data, status: 'pending' },
    });
  }

  async findByUser(userId: string) {
    return this.prisma.imageGenTask.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  }

  async findOne(id: string, userId: string) {
    return this.prisma.imageGenTask.findFirst({
      where: { id, userId },
    });
  }

  async updateStatus(id: string, data: {
    status: string;
    resultImageUrl?: string;
    errorMessage?: string;
  }, userId: string) {
    return this.prisma.imageGenTask.updateMany({
      where: { id, userId },
      data,
    });
  }

  async generateIdealBody(userId: string, data: IdealBodyGenerateInput) {
    const variant = data.variant?.trim();
    if (variant && !IDEAL_VARIANTS.has(variant)) throw new BadRequestException('Invalid ideal-body variant');
    const profile = variant ? await this.prisma.evolutionImageProfile.findUnique({ where: { userId }, select: { identityAnchors: true, activeBatchId: true } }) : null;
    if (variant && (!data.batchId || data.batchId !== profile?.activeBatchId)) throw new BadRequestException('Invalid ideal-body generation batch');
    const prompt = variant ? this.buildIdealVariantPrompt(variant, data.targetStyle, data.gender, profile?.identityAnchors) : data.prompt?.trim();
    if (!prompt) {
      throw new BadRequestException('Image prompt is required');
    }

    // Collect tier-0 (primary) + tier-1 (ark) + tier-2 (legacy) configs.
    const [primary, ark, legacy] = this.getImageProviderConfigs(data.size);
    const task = await this.createTaskSafely(userId, prompt, variant, data.batchId);

    try {
      const normalizedData: IdealBodyGenerateInput = {
        ...data,
        currentImageBase64: data.currentImageBase64 ? await this.normalizeImagePayload(data.currentImageBase64) : undefined,
        referenceImageBase64: data.referenceImageBase64 ? await this.normalizeImagePayload(data.referenceImageBase64) : undefined,
      };
      let generated = await this.requestWithDegradeChain(
        primary,
        ark,
        legacy,
        prompt,
        normalizedData,
      );
      let image = await this.normalizeImagePayload(generated.image);
      if (normalizedData.currentImageBase64?.trim()) {
        let validation = await this.aiService.validateEvolutionImage(normalizedData.currentImageBase64, image, data.expectedSourceFat, data.targetBodyFat);
        const requiresStageDifference = Number.isFinite(data.targetBodyFat);
        const isRejected = () =>
          (validation.confidence >= 0.7 && !validation.identityMatch) ||
          (validation.confidence >= 0.9 && !validation.skinToneMatch) ||
          (requiresStageDifference && validation.confidence >= 0.9 && !validation.bodyChangeVisible);
        if (isRejected()) {
          generated = await this.requestWithDegradeChain(primary, ark, legacy,
            `${prompt} CORRECTION: match the input person's skin color exactly. Do not change skin brightness, undertone, saturation, warmth, tanning level, exposure, white balance or lighting color. Preserve the exact same identity. Make only the requested body-composition difference visible and change no other feature.`, normalizedData);
          image = await this.normalizeImagePayload(generated.image);
          validation = await this.aiService.validateEvolutionImage(normalizedData.currentImageBase64, image, data.expectedSourceFat, data.targetBodyFat);
          if (isRejected()) {
            throw new Error('Generated image failed identity or body-change validation');
          }
        }
      }

      const resultImageUrl = await this.persistGeneratedImage(userId, image, {
        provider: generated.provider,
        model: generated.model,
        promptVersion: variant ? IDEAL_PROMPT_VERSION : 'stage-v2',
      });

      // Persist resultImageUrl so stage preview lookup works.
      if (task?.id) {
        await this.updateTaskSafely(task.id, {
          status: 'completed',
          resultImageUrl,
          provider: generated.provider,
          model: generated.model,
        });
      } else {
        // Even without a task record, try to keep a completed row.
        const fallbackTask = await this.prisma.imageGenTask.findFirst({
          where: { userId, prompt, status: 'processing' },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });
        if (fallbackTask) {
          await this.updateTaskSafely(fallbackTask.id, {
            status: 'completed',
            resultImageUrl,
            provider: generated.provider,
            model: generated.model,
          });
        }
      }

      return { image: resultImageUrl, taskId: task?.id ?? null };
    } catch (error) {
      await this.updateTaskSafely(task?.id, {
        status: 'failed',
        errorMessage: this.toSafeErrorMessage(error),
      });
      throw new InternalServerErrorException('Image generation failed. Please try again later.');
    }
  }

  private buildIdealVariantPrompt(variant: string, targetStyle?: string, gender?: string, identityAnchors?: unknown): string {
    const physique = variant === 'lean'
      ? 'LEAN: gently reduce visible subcutaneous fat, slightly narrow the waist and clean up limb contours; preserve current muscle size and natural curves; no pronounced abs, vascularity or added muscle mass'
      : variant === 'strong'
        ? 'STRONG: keep a healthy athletic body-fat level and add only moderate, anatomically plausible muscle fullness to shoulders, upper arms, glutes and thighs; limit muscle-volume increase to roughly 5-10%; preserve the original skeleton, height, joints and natural curves; never replace the body or create bodybuilding proportions'
        : 'ATHLETIC: create a balanced trained physique between LEAN and STRONG; moderately flatter waist, firmer arms and legs, subtle shoulder and core definition, natural muscle volume, no extreme leanness or hypertrophy';
    const anchorText = identityAnchors ? `Locked identity anchors: ${JSON.stringify(identityAnchors)}.` : '';
    return `Create one photorealistic fitness edit of the exact person in the input image. ${anchorText} ${physique}. User preference: ${targetStyle || 'athletic'}; gender context: ${gender || 'unspecified'}. HARD IDENTITY INVARIANTS: keep the same face, facial geometry, hairstyle, age appearance and personal identity. HARD SKIN-COLOR INVARIANTS: the output skin color must match the input image exactly; do not change skin brightness, undertone, saturation, warmth, tanning level, exposure, white balance or lighting color. Fitness changes may affect body shape only and must never be expressed by darkening, lightening, warming or recoloring the skin. HARD SCENE INVARIANTS: keep the same clothing, pose, hand and foot placement, body frame, camera angle, crop, background and lighting direction. Edit only body composition and the explicitly permitted muscle definition. Do not swap the face or body, change ethnicity, alter garments, retouch the face, or redesign the scene. Keep natural skin texture and believable long-term fitness progress. Output one full-body realistic photograph.`;
  }

  private async normalizeImagePayload(dataUrlOrBase64: string): Promise<string> {
    const trimmed = dataUrlOrBase64.trim();
    const commaIndex = trimmed.startsWith('data:') ? trimmed.indexOf(',') : -1;
    const base64 = commaIndex >= 0 ? trimmed.slice(commaIndex + 1) : trimmed;
    const output = await sharp(Buffer.from(base64.replace(/\s/g, ''), 'base64'))
      .rotate()
      .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 8 })
      .toBuffer();
    return `data:image/png;base64,${output.toString('base64')}`;
  }

  // ── Provider Config ─────────────────────────────────────────────────

  /**
   * Build the 3-tier degradation chain: Primary → Ark → Legacy.
   * Each tier can have its own proxy URL via env vars,
   * falling back to the global IMAGE_GEN_PROXY_URL.
   */
  private getImageProviderConfigs(size?: string): [
    ImageProviderConfig,
    ArkImageProviderConfig | undefined,
    LegacyImageProviderConfig | undefined,
  ] {
    const globalProxy = this.configService.get<string>('IMAGE_GEN_PROXY_URL')?.trim() || undefined;

    // ── Tier 0: Primary (OpenAI-compatible) ──
    const apiKey = (
      this.configService.get<string>('IMAGE_GEN_API_KEY')
      || this.configService.get<string>('CODEX_API_KEY')
      || ''
    ).trim();

    if (!apiKey) {
      throw new InternalServerErrorException('IMAGE_GEN_API_KEY is not configured');
    }

    const baseUrl = (
      this.configService.get<string>('IMAGE_GEN_BASE_URL')
      || this.configService.get<string>('CODEX_BASE_URL')
      || 'https://api.openai.com/v1'
    ).trim().replace(/\/+$/, '');

    const model = (
      this.configService.get<string>('IMAGE_GEN_MODEL')
      || this.configService.get<string>('CODEX_IMAGE_MODEL')
      || 'gpt-image-2'
    ).trim();

    const fallbackModel = this.configService.get<string>('IMAGE_GEN_FALLBACK_MODEL')?.trim();
    const primaryProxy = this.configService.get<string>('IMAGE_GEN_PRIMARY_PROXY_URL')?.trim()
      || globalProxy;

    // ── Tier 1: Ark (豆包 Seedream) ──
    const arkApiKey = this.configService.get<string>('ARK_IMAGE_API_KEY')?.trim();
    const arkBaseUrl = (
      this.configService.get<string>('ARK_IMAGE_BASE_URL')
      || 'https://ark.cn-beijing.volces.com/api/v3'
    ).trim().replace(/\/+$/, '');
    const arkModel = (
      this.configService.get<string>('ARK_IMAGE_MODEL')
      || 'doubao-seedream-5-0-260128'
    ).trim();
    const arkProxy = this.configService.get<string>('ARK_IMAGE_PROXY_URL')?.trim()
      || globalProxy;

    // ── Tier 2: Legacy ──
    const legacyApiKey = this.configService.get<string>('LEGACY_IMAGE_GEN_API_KEY')?.trim();
    const legacyBaseUrl = (
      this.configService.get<string>('LEGACY_IMAGE_GEN_BASE_URL')
      || ''
    ).trim().replace(/\/+$/, '');
    const legacyModel = (
      this.configService.get<string>('LEGACY_IMAGE_GEN_MODEL')
      || 'gpt-image-2'
    ).trim();
    const legacyProxy = this.configService.get<string>('LEGACY_IMAGE_GEN_PROXY_URL')?.trim()
      || globalProxy;

    return [
      {
        label: 'L0:gpt-image-2',
        apiKey,
        baseUrl,
        model,
        fallbackModel: fallbackModel && fallbackModel !== model ? fallbackModel : undefined,
        proxyUrl: primaryProxy,
        size: this.normalizeSize(size),
      },
      arkApiKey
        ? {
            apiKey: arkApiKey,
            baseUrl: arkBaseUrl,
            model: arkModel,
            proxyUrl: arkProxy,
            size: this.normalizeArkSize(size),
          }
        : undefined,
      legacyApiKey && legacyBaseUrl
        ? {
            apiKey: legacyApiKey,
            baseUrl: legacyBaseUrl,
            model: legacyModel,
            proxyUrl: legacyProxy,
            size: this.normalizeSize(size),
          }
        : undefined,
    ];
  }

  // ── Degradation Chain ────────────────────────────────────────────────

  private async requestWithDegradeChain(
    primary: ImageProviderConfig,
    ark: ArkImageProviderConfig | undefined,
    legacy: LegacyImageProviderConfig | undefined,
    prompt: string,
    data: IdealBodyGenerateInput,
  ): Promise<GeneratedProviderResult> {
    // Tier 0: Primary
    try {
      this.logProviderAttempt(primary.label);
      const image = data.currentImageBase64?.trim()
        ? await this.requestImageEdit(primary, prompt, data.currentImageBase64, data.referenceImageBase64)
        : await this.requestImageGeneration(primary, prompt);
      return { image, provider: primary.label, model: primary.model };
    } catch (err) {
      this.logProviderFail(primary.label, err);
      if (!this.shouldTryFallback(err)) throw err;
    }

    // Tier 1: Ark
    if (ark) {
      try {
        this.logProviderAttempt('L1:ark-seedream');
        const image = await this.requestArkImageGeneration(ark, prompt, [
          data.currentImageBase64,
          data.referenceImageBase64,
        ]);
        return { image, provider: 'L1:ark-seedream', model: ark.model };
      } catch (err) {
        this.logProviderFail('L1:ark-seedream', err);
        if (!this.shouldTryFallback(err)) throw err;
      }
    }

    // Tier 2: Legacy
    if (legacy) {
      try {
        this.logProviderAttempt('L2:legacy');
        const image = await this.requestLegacyImageGeneration(legacy, prompt, data);
        return { image, provider: 'L2:legacy', model: legacy.model };
      } catch (err) {
        this.logProviderFail('L2:legacy', err);
        throw err;
      }
    }

    throw new Error('All image generation providers exhausted');
  }

  private logProviderAttempt(label: string) {
    console.log(`[ImageGen] Trying ${label}...`);
  }

  private logProviderFail(label: string, error: unknown) {
    console.warn(`[ImageGen] ${label} failed: ${this.toImageErrorCode(error)}`);
  }

  // ── Primary Provider (OpenAI-compatible) ────────────────────────────

  private async requestImageGeneration(config: ImageProviderConfig, prompt: string): Promise<string> {
    try {
      return await this.requestImageGenerationOnce(config, prompt, config.model);
    } catch (error) {
      if (!config.fallbackModel || !this.shouldTryFallbackModel(error)) throw error;
      return this.requestImageGenerationOnce(config, prompt, config.fallbackModel);
    }
  }

  private async requestImageGenerationOnce(
    config: ImageProviderConfig,
    prompt: string,
    model: string,
  ): Promise<string> {
    const response = await this.proxyFetch(
      config.proxyUrl,
      `${config.baseUrl}/images/generations`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt,
          n: 1,
          size: config.size,
          response_format: 'b64_json',
        }),
      },
    );

    return this.extractProviderImage(response, config.label);
  }

  // ── Image Edit ───────────────────────────────────────────────────────

  private async requestImageEdit(
    config: ImageProviderConfig,
    prompt: string,
    currentImageBase64: string,
    referenceImageBase64?: string,
  ): Promise<string> {
    try {
      return await this.requestImageEditWithFallback(
        config,
        prompt,
        currentImageBase64,
        referenceImageBase64,
      );
    } catch (error) {
      // Retry without the optional reference image.
      if (!referenceImageBase64?.trim()) throw error;
      return this.requestImageEditWithFallback(config, prompt, currentImageBase64);
    }
  }

  private async requestImageEditWithFallback(
    config: ImageProviderConfig,
    prompt: string,
    currentImageBase64: string,
    referenceImageBase64?: string,
  ): Promise<string> {
    try {
      return await this.requestImageEditOnce(
        config,
        prompt,
        currentImageBase64,
        referenceImageBase64,
        config.model,
      );
    } catch (error) {
      if (!config.fallbackModel || !this.shouldTryFallbackModel(error)) throw error;
      return this.requestImageEditOnce(
        config,
        prompt,
        currentImageBase64,
        referenceImageBase64,
        config.fallbackModel,
      );
    }
  }

  private async requestImageEditOnce(
    config: ImageProviderConfig,
    prompt: string,
    currentImageBase64: string,
    referenceImageBase64?: string,
    model = config.model,
  ): Promise<string> {
    const formData = new FormData();
    formData.append('image', this.toImageBlob(currentImageBase64), 'body.png');
    if (referenceImageBase64?.trim()) {
      formData.append('image', this.toImageBlob(referenceImageBase64), 'reference.png');
    }
    formData.append('prompt', prompt);
    formData.append('model', model);
    formData.append('n', '1');
    formData.append('size', config.size);
    formData.append('response_format', 'b64_json');

    const response = await this.proxyFetch(
      config.proxyUrl,
      `${config.baseUrl}/images/edits`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${config.apiKey}` },
        body: formData,
      },
    );

    return this.extractProviderImage(response, config.label);
  }

  // ── Ark (豆包 Seedream) ─────────────────────────────────────────────

  private async requestArkImageGeneration(
    config: ArkImageProviderConfig,
    prompt: string,
    images: Array<string | undefined>,
  ): Promise<string> {
    const imageInputs = images
      .map((img) => img?.trim())
      .filter((img): img is string => !!img);

    const response = await this.proxyFetch(
      config.proxyUrl,
      `${config.baseUrl}/images/generations`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model,
          prompt,
          ...(imageInputs.length ? { image: imageInputs } : {}),
          size: config.size,
          response_format: 'b64_json',
          watermark: false,
        }),
      },
    );

    return this.extractProviderImage(response, 'L1:ark-seedream');
  }

  // ── Legacy Provider ─────────────────────────────────────────────────

  private async requestLegacyImageGeneration(
    config: LegacyImageProviderConfig,
    prompt: string,
    data: IdealBodyGenerateInput,
  ): Promise<string> {
    const openAIConfig: ImageProviderConfig = {
      label: 'L2:legacy',
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      proxyUrl: config.proxyUrl,
      size: config.size,
    };

    return data.currentImageBase64?.trim()
      ? this.requestImageEdit(openAIConfig, prompt, data.currentImageBase64, data.referenceImageBase64)
      : this.requestImageGeneration(openAIConfig, prompt);
  }

  // ── Shared Helpers ───────────────────────────────────────────────────

  private toImageBlob(dataUrlOrBase64: string): Blob {
    const trimmed = dataUrlOrBase64.trim();
    if (!trimmed) throw new BadRequestException('Image payload is empty');

    let mimeType = 'image/png';
    let base64Data = trimmed;

    if (trimmed.startsWith('data:')) {
      const commaIndex = trimmed.indexOf(',');
      if (commaIndex < 0) throw new BadRequestException('Invalid image data URL');
      const meta = trimmed.slice(5, commaIndex);
      mimeType = meta.split(';')[0] || mimeType;
      base64Data = trimmed.slice(commaIndex + 1);
    }

    const bytes = Buffer.from(base64Data.replace(/\s/g, ''), 'base64');
    if (!bytes.byteLength) throw new BadRequestException('Invalid image payload');
    return new Blob([bytes], { type: mimeType });
  }

  private async extractProviderImage(response: Response, label?: string): Promise<string> {
    let payload: any = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const remoteMessage = payload?.error?.message || payload?.message || `HTTP ${response.status}`;
      throw new Error(`[${label ?? 'unknown'}] Image provider request failed (HTTP ${response.status}): ${remoteMessage}`);
    }

    const first = payload?.data?.[0];
    if (typeof first?.b64_json === 'string' && first.b64_json.trim()) {
      return `data:image/png;base64,${first.b64_json}`;
    }
    if (typeof first?.url === 'string' && first.url.trim()) {
      return first.url;
    }

    throw new Error(`[${label ?? 'unknown'}] Image provider returned no image payload`);
  }

  private shouldTryFallbackModel(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    return /\b(429|503|524)\b/i.test(error.message);
  }

  private shouldTryFallback(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    return /\b(429|500|502|503|504|524)\b/i.test(error.message);
  }

  private normalizeSize(size?: string): string {
    const value = size?.trim();
    const allowed = new Set(['1024x1024', '1024x1536', '1536x1024', 'auto']);
    return value && allowed.has(value) ? value : '1024x1024';
  }

  private normalizeArkSize(size?: string): string {
    const value = size?.trim();
    return value && /^\d+x\d+$/.test(value) ? value : '2K';
  }

  // ── Proxy Fetch ─────────────────────────────────────────────────────

  private async proxyFetch(
    proxyUrl: string | undefined,
    url: string,
    options: RequestInit,
  ): Promise<Response> {
    if (proxyUrl) {
      // undici is bundled with Node.js 18+; require bypasses TS module resolution
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { ProxyAgent } = require('undici') as { ProxyAgent: new (url: string) => unknown };
      return fetch(url, { ...options, dispatcher: new ProxyAgent(proxyUrl) } as RequestInit);
    }
    return fetch(url, options);
  }

  // ── Task Bookkeeping ─────────────────────────────────────────────────

  private async createTaskSafely(userId: string, prompt: string, variant?: string, batchId?: string): Promise<{ id: string } | null> {
    try {
      return await this.prisma.imageGenTask.create({
        data: { userId, prompt, targetStyle: 'ideal-body', status: 'processing', variant, batchId, promptVersion: variant ? IDEAL_PROMPT_VERSION : undefined },
        select: { id: true },
      });
    } catch {
      return null;
    }
  }

  private async updateTaskSafely(
    id: string | undefined,
    data: { status: string; errorMessage?: string; resultImageUrl?: string; provider?: string; model?: string },
  ) {
    if (!id) return;
    try {
      await this.prisma.imageGenTask.update({ where: { id }, data });
    } catch {
      // The generated image is still returned even if task bookkeeping fails.
    }
  }

  private async persistGeneratedImage(
    userId: string,
    normalizedDataUrl: string,
    metadata: { provider: string; model: string; promptVersion: string },
  ): Promise<string> {
    const commaIndex = normalizedDataUrl.indexOf(',');
    if (!normalizedDataUrl.startsWith('data:image/png;base64,') || commaIndex < 0) {
      throw new Error('Generated image has an unsupported format');
    }
    const buffer = Buffer.from(normalizedDataUrl.slice(commaIndex + 1), 'base64');
    if (buffer.length === 0 || buffer.length > 12 * 1024 * 1024) {
      throw new Error('Generated image exceeds the storage size limit');
    }
    const imageMetadata = await sharp(buffer).metadata();
    if (!imageMetadata.width || !imageMetadata.height || imageMetadata.width > 2048 || imageMetadata.height > 2048) {
      throw new Error('Generated image dimensions are invalid');
    }

    if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });
    const filename = `generated-${randomUUID()}.png`;
    const filepath = join(UPLOADS_DIR, filename);
    const url = buildUploadUrl(filename);
    writeFileSync(filepath, buffer, { flag: 'wx' });
    try {
      await this.prisma.uploadAsset.create({
        data: {
          userId,
          url,
          kind: 'generated-evolution-image',
          sha256: createHash('sha256').update(buffer).digest('hex'),
          mimeType: 'image/png',
          byteSize: buffer.length,
          provider: metadata.provider,
          model: metadata.model,
          promptVersion: metadata.promptVersion,
        },
      });
      return url;
    } catch (error) {
      if (existsSync(filepath)) unlinkSync(filepath);
      throw error;
    }
  }

  private toSafeErrorMessage(error: unknown): string {
    return this.toImageErrorCode(error);
  }

  private toImageErrorCode(error: unknown): string {
    const message = error instanceof Error ? error.message : '';
    if (/429|rate.?limit|too many requests/i.test(message)) return 'IMAGE_PROVIDER_RATE_LIMITED';
    if (/401|403|api key|unauthori[sz]ed|forbidden/i.test(message)) return 'IMAGE_PROVIDER_AUTH_FAILED';
    if (/timeout|timed out|524/i.test(message)) return 'IMAGE_PROVIDER_TIMEOUT';
    if (/identity|body-change validation/i.test(message)) return 'IMAGE_VALIDATION_REJECTED';
    if (/format|dimension|size limit|unsupported/i.test(message)) return 'IMAGE_STORAGE_VALIDATION_FAILED';
    if (/500|502|503|504|fetch failed|provider request/i.test(message)) return 'IMAGE_PROVIDER_UNAVAILABLE';
    return 'IMAGE_GENERATION_FAILED';
  }
}

// ── Controller ────────────────────────────────────────────────────────

@Controller('image-gen')
@UseGuards(JwtAuthGuard)
class ImageGenController {
  constructor(private readonly service: ImageGenService) {}

  @Post()
  create(
    @CurrentUser() user: { sub: string },
    @Body() body: { sourceImageUrl?: string; targetStyle?: string; prompt?: string },
  ) {
    return this.service.create(user.sub, body);
  }

  @Post('ideal-body')
  generateIdealBody(
    @CurrentUser() user: { sub: string },
    @Body() body: IdealBodyGenerateInput,
  ) {
    return this.service.generateIdealBody(user.sub, body);
  }

  @Get()
  list(@CurrentUser() user: { sub: string }) {
    return this.service.findByUser(user.sub);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
  ) {
    return this.service.findOne(id, user.sub);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
    @Body() body: { status: string; resultImageUrl?: string; errorMessage?: string },
  ) {
    return this.service.updateStatus(id, body, user.sub);
  }
}

// ── Module ────────────────────────────────────────────────────────────

@Module({
  imports: [AiModule],
  controllers: [ImageGenController],
  providers: [ImageGenService],
  exports: [ImageGenService],
})
export class ImageGenModule {}
