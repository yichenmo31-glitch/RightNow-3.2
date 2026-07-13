import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { extname, join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { getModelPromptBinding, ModelPromptCode } from '../prompts/prompt-catalog';
import { resolveLocalUploadPath } from '../common/upload.util';

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
}

interface GeminiGenerationConfig {
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
}

interface PromptTemplateRow {
  content: string;
  enabled: boolean;
}

interface PromptTemplateDelegate {
  findUnique(args: {
    where: {
      key_scene: {
        key: string;
        scene: string;
      };
    };
    select: {
      content: true;
      enabled: true;
    };
  }): Promise<PromptTemplateRow | null>;
}

// ── Body-Fat Result Types ────────────────────────────────────────────

export interface BodyFatEstimateAggregate {
  final: number;
  median: number;
  spread: number;
  keptCount: number;
  totalCount: number;
  breakdown: Array<{
    provider: string;
    value: number;
    confidence: number | null;
    signals: string[];
    kept: boolean;
    rejectionReason: string | null;
  }>;
}

export interface BodyFatEstimateResult {
  value: number;
  aggregate: BodyFatEstimateAggregate;
}

export interface IdentityAnchors {
  hair?: string;
  skinTone?: string;
  faceShape?: string;
  glasses?: string;
  facialFeatures?: string;
  originalOutfit?: string;
}

export interface EvolutionImageValidationResult {
  identityMatch: boolean;
  skinToneMatch: boolean;
  bodyChangeVisible: boolean;
  estimatedBodyFat: number | null;
  confidence: number;
}

const MIN_PLAUSIBLE = 3;
const MAX_PLAUSIBLE = 60;

@Injectable()
export class AiService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async extractTrainingData(input: {
    description?: string;
    photoUrl?: string;
    rawInput?: unknown;
  }) {
    const prompt = await this.resolvePrompt('training.extract_data', {
      description: input.description || '',
      photoUrl: input.photoUrl || '',
      rawInputJson: JSON.stringify(input.rawInput ?? {}, null, 2),
    });

    const text = await this.requestGemini(prompt, {
      temperature: 0.2,
      topP: 0.8,
      maxOutputTokens: 1024,
    });

    return this.parseJsonResponse<any>(text);
  }

  async generateFeedback(
    payload: unknown,
    promptCode: ModelPromptCode = 'training.generate_feedback',
  ): Promise<any> {
    const variables =
      promptCode === 'training.daily_change_feedback'
        ? {
            recordsJson: JSON.stringify(
              (payload as { records?: unknown[] } | null | undefined)?.records ?? [],
              null,
              2,
            ),
            lastRecordJson: JSON.stringify(
              (payload as { lastRecord?: unknown } | null | undefined)?.lastRecord ?? null,
              null,
              2,
            ),
          }
        : {
            structuredDataJson: JSON.stringify(payload ?? {}, null, 2),
          };

    const prompt = await this.resolvePrompt(promptCode, variables);
    const text = await this.requestGemini(prompt, {
      temperature: 0.7,
      maxOutputTokens: 512,
    });

    return this.parseJsonResponse<any>(text);
  }

  async analyzeFoodPhoto(photoUrl: string) {
    const systemPrompt = await this.resolvePrompt('core.food_analysis_system', {});
    const userPrompt = await this.resolvePrompt('food.analyze_image_user_prompt', {
      photoUrl,
    });

    const text = await this.requestGemini(
      userPrompt,
      { temperature: 0.3, topP: 0.8, maxOutputTokens: 512 },
      systemPrompt,
    );

    return this.parseJsonResponse<{
      name: string;
      calories: number;
      protein: number;
      fat: number;
      carbs: number;
    }>(text);
  }

  async analyzeFoodText(name: string, description?: string) {
    const query = description ? `${name}, ${description}` : name;
    const systemPrompt = await this.resolvePrompt('core.food_analysis_system', {});
    const userPrompt = await this.resolvePrompt('food.analyze_text_user_prompt', { query });

    const text = await this.requestGemini(
      userPrompt,
      { temperature: 0.3, topP: 0.8, maxOutputTokens: 512 },
      systemPrompt,
    );

    return this.parseJsonResponse<{
      calories: number;
      protein: number;
      fat: number;
      carbs: number;
    }>(text);
  }

  // ── Body-Fat Estimation (Solo Model with Context) ──────────────────

  /**
   * Estimate body-fat percentage from a single photo using a solo vision model.
   * Accepts optional user context (gender, age, height, weight) to improve
   * prompt quality. Falls back from StepFun vision → Gemini text-only.
   *
   * Returns a structured result with an aggregate object that mirrors the
   * multi-model format (single-entry breakdown), keeping the schema compatible.
   */
  async estimateBodyFatFromImage(
    imageUrl: string,
    context?: {
      gender?: string | null;
      age?: number | null;
      height?: number | null;
      weight?: number | null;
    },
  ): Promise<BodyFatEstimateResult> {
    const dataUrl = await this.imageUrlToDataUrl(imageUrl);

    // Build context-aware prompts.
    const ctxLines: string[] = [];
    if (context?.gender) {
      ctxLines.push(`- 性别: ${context.gender === 'female' ? '女性' : '男性'}`);
    }
    if (context?.age != null && context.age > 0) {
      ctxLines.push(`- 年龄: ${context.age} 岁`);
    }
    if (context?.height != null && context.height > 0) {
      ctxLines.push(`- 身高: ${context.height} cm`);
    }
    if (context?.weight != null && context.weight > 0) {
      ctxLines.push(`- 体重: ${context.weight} kg`);
    }
    const ctxBlock = ctxLines.length > 0 ? `\n用户补充信息:\n${ctxLines.join('\n')}` : '';

    const systemPrompt =
      `你是一位资深运动科学评估专家。根据单张照片中可见的体型特征估算体脂率。${ctxBlock}\n` +
      `注意: 用户信息仅供参考，请以目视评估为主。\n` +
      '返回纯 JSON，格式: {"bodyFat": 18.5, "confidence": 0.8, "visibleSignals": ["腹部线条模糊","肩臂轮廓清晰"]}\n' +
      '不要加解释、markdown 或其他字段。';

    const userPrompt =
      '请从上传的照片中估算这个人的体脂率。返回 JSON only。';

    let rawValue: number | null = null;
    let confidence: number | null = null;
    let signals: string[] = [];
    let providerLabel = 'stepfun-vision';

    try {
      const text = await this.requestVision(userPrompt, dataUrl, {
        temperature: 0.2,
        maxOutputTokens: 256,
      }, systemPrompt);

      const parsed = this.parseJsonResponse<{
        bodyFat?: number;
        bodyFatEstimate?: number;
        confidence?: number;
        visibleSignals?: string[];
      }>(text);

      rawValue = Number(parsed?.bodyFat ?? parsed?.bodyFatEstimate);
      confidence = typeof parsed?.confidence === 'number' ? parsed.confidence : null;
      signals = Array.isArray(parsed?.visibleSignals) ? parsed.visibleSignals : [];
      providerLabel = 'stepfun-vision';
    } catch (error) {
      // StepFun failed → try Gemini fallback.
      const message = error instanceof Error ? error.message : 'unknown';
      try {
        const text = await this.requestGemini(
          `${userPrompt}\n(StepFun vision failed: ${message})\nImage data URL (truncated): ${dataUrl.slice(0, 500)}`,
          { temperature: 0.2, maxOutputTokens: 128 },
          systemPrompt,
        );
        const parsed = this.parseJsonResponse<{ bodyFat?: number; bodyFatEstimate?: number }>(text);
        rawValue = Number(parsed?.bodyFat ?? parsed?.bodyFatEstimate);
        providerLabel = 'gemini-text-fallback';
      } catch {
        // Both failed – will throw below.
      }
    }

    if (!Number.isFinite(rawValue)) {
      throw new Error('Model(s) returned invalid body fat percentage');
    }

    const normalizedValue = this.clampBodyFat(rawValue!);
    const safeConfidence = confidence != null ? confidence : 0.7;

    return {
      value: normalizedValue,
      aggregate: {
        final: normalizedValue,
        median: normalizedValue,
        spread: 0,
        keptCount: 1,
        totalCount: 1,
        breakdown: [
          {
            provider: providerLabel,
            value: normalizedValue,
            confidence: safeConfidence,
            signals,
            kept: true,
            rejectionReason: null,
          },
        ],
      },
    };
  }

  async extractIdentityAnchorsFromImage(imageUrl: string): Promise<IdentityAnchors> {
    const dataUrl = await this.imageUrlToDataUrl(imageUrl);
    const systemPrompt =
      '你是图像一致性辅助工具。只描述照片中直接可见、可用于后续保持同一人物的外观特征。' +
      '禁止推断种族、国籍、健康、疾病、体脂、年龄、性格或其他敏感属性。' +
      '返回纯 JSON，且只能包含 hair、skinTone、faceShape、glasses、facialFeatures、originalOutfit 六个字符串字段。' +
      'skinTone 只使用中性的可见明暗和冷暖描述；不确定的字段返回空字符串。';
    const text = await this.requestVision(
      '提取这张照片中稳定、直接可见的身份外观锚点。',
      dataUrl,
      { temperature: 0, maxOutputTokens: 320 },
      systemPrompt,
    );
    let parsed: Record<string, unknown>;
    try {
      parsed = this.parseJsonResponse<Record<string, unknown>>(text);
    } catch {
      throw new Error('Vision model returned invalid identity anchors');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Vision model returned invalid identity anchors');
    }

    const result: IdentityAnchors = {};
    const allowedKeys = [
      'hair',
      'skinTone',
      'faceShape',
      'glasses',
      'facialFeatures',
      'originalOutfit',
    ] as const;
    for (const key of allowedKeys) {
      const value = this.normalizeAnchorText(parsed[key]);
      if (value) result[key] = value;
    }
    if (Object.keys(result).length === 0) {
      throw new Error('Vision model returned empty identity anchors');
    }
    return result;
  }

  async validateEvolutionImage(
    sourceImage: string,
    generatedImage: string,
    expectedSourceFat?: number,
    targetFat?: number,
  ): Promise<EvolutionImageValidationResult> {
    const [sourceDataUrl, generatedDataUrl] = await Promise.all([
      this.imageUrlToDataUrl(sourceImage),
      this.imageUrlToDataUrl(generatedImage),
    ]);
    const expectedContext = [
      Number.isFinite(expectedSourceFat) ? `源图参考体脂为 ${expectedSourceFat}%。` : '',
      Number.isFinite(targetFat) ? `生成图目标体脂为 ${targetFat}%。` : '',
    ].filter(Boolean).join('');
    const systemPrompt =
      '你是健身进化图片质量检查器。第一张是源图，第二张是生成图。' +
      '只比较可见特征，不推断种族、健康或疾病。identityMatch 表示脸部、头发等身份特征是否仍为同一人；' +
      'skinToneMatch 判断人物的基础肤色是否仍一致；允许自然光照、曝光、白平衡和轻微色温造成的小幅差异，仅在明显美白、晒黑或基础肤色大幅改变时返回 false。' +
      'bodyChangeVisible 表示身体轮廓或脂肪分布变化是否清晰可见。' +
      'estimatedBodyFat 只能是对第二张图片的粗略视觉估计，无法估计则为 null。' +
      '返回纯 JSON，且只能包含 identityMatch、skinToneMatch、bodyChangeVisible、estimatedBodyFat、confidence。';
    const text = await this.requestVisionImages(
      `检查两张图片的一致性和阶段差异。${expectedContext}`,
      [sourceDataUrl, generatedDataUrl],
      { temperature: 0, maxOutputTokens: 192 },
      systemPrompt,
    );
    const parsed = this.parseJsonResponse<Record<string, unknown>>(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Vision model returned invalid evolution image validation');
    }

    const identityMatch = this.requireBoolean(parsed.identityMatch, 'identityMatch');
    const skinToneMatch = this.requireBoolean(parsed.skinToneMatch, 'skinToneMatch');
    const bodyChangeVisible = this.requireBoolean(parsed.bodyChangeVisible, 'bodyChangeVisible');
    const confidence = Number(parsed.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new Error('Vision model returned invalid validation confidence');
    }
    let estimatedBodyFat: number | null = null;
    if (parsed.estimatedBodyFat !== null && parsed.estimatedBodyFat !== undefined) {
      const value = Number(parsed.estimatedBodyFat);
      if (!Number.isFinite(value) || value < MIN_PLAUSIBLE || value > MAX_PLAUSIBLE) {
        throw new Error('Vision model returned invalid estimated body fat');
      }
      estimatedBodyFat = Number(value.toFixed(1));
    }
    return { identityMatch, skinToneMatch, bodyChangeVisible, estimatedBodyFat, confidence };
  }

  // ── Private Helpers ─────────────────────────────────────────────────

  private normalizeAnchorText(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const normalized = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!normalized) return null;
    const sensitivePattern = /\b(race|racial|ethnicity|ethnic|nationality|health|disease|diagnosis|body\s*fat|weight|age|personality)\b|种族|民族|国籍|健康|疾病|诊断|体脂|体重|年龄|性格/i;
    if (sensitivePattern.test(normalized)) return null;
    return normalized.slice(0, 160);
  }

  private requireBoolean(value: unknown, field: string): boolean {
    if (typeof value !== 'boolean') {
      throw new Error(`Vision model returned invalid ${field}`);
    }
    return value;
  }

  private clampBodyFat(value: number): number {
    const clamped = Math.max(MIN_PLAUSIBLE, Math.min(MAX_PLAUSIBLE, value));
    return Number(clamped.toFixed(1));
  }

  private async imageUrlToDataUrl(imageUrl: string): Promise<string> {
    if (imageUrl.startsWith('data:')) return imageUrl;

    let buffer: Buffer;
    let mime = 'image/jpeg';

    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error(`Failed to fetch image: ${imageUrl}`);
      buffer = Buffer.from(await response.arrayBuffer());
      const pathname = new URL(imageUrl).pathname;
      mime = this.mimeFromExtension(extname(pathname));
    } else {
      const localPath = resolveLocalUploadPath(imageUrl) || join(process.cwd(), imageUrl);
      buffer = readFileSync(localPath);
      mime = this.mimeFromExtension(extname(localPath));
    }

    return `data:${mime};base64,${buffer.toString('base64')}`;
  }

  private mimeFromExtension(extension: string): string {
    const ext = extension.toLowerCase();
    if (ext === '.png') return 'image/png';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.gif') return 'image/gif';
    return 'image/jpeg';
  }

  private async resolvePrompt(
    code: ModelPromptCode,
    variables: Record<string, unknown>,
  ): Promise<string> {
    const binding = getModelPromptBinding(code);

    const promptTemplateDelegate = (
      this.prisma as unknown as { promptTemplate?: PromptTemplateDelegate }
    ).promptTemplate;

    let dbTemplate: PromptTemplateRow | null = null;

    if (promptTemplateDelegate?.findUnique) {
      try {
        dbTemplate = await promptTemplateDelegate.findUnique({
          where: {
            key_scene: { key: binding.key, scene: binding.scene },
          },
          select: { content: true, enabled: true },
        });
      } catch {
        dbTemplate = null;
      }
    }

    const sourceTemplate =
      dbTemplate && dbTemplate.enabled && dbTemplate.content.trim()
        ? dbTemplate.content
        : binding.fallbackContent;

    return this.renderTemplate(sourceTemplate, variables);
  }

  private renderTemplate(template: string, variables: Record<string, unknown>): string {
    return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, variableName: string) => {
      const value = variables[variableName];
      if (value === undefined || value === null) return '';
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
      }
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    });
  }

  private async requestVision(
    prompt: string,
    imageDataUrl: string,
    generationConfig: GeminiGenerationConfig,
    systemPrompt?: string,
  ): Promise<string> {
    const apiKey =
      this.configService.get<string>('STEPFUN_API_KEY')?.trim() ||
      this.configService.get<string>('DIET_VISION_API_KEY')?.trim() ||
      '';

    if (apiKey) {
      const baseUrl = (
        this.configService.get<string>('STEPFUN_BASE_URL') ||
        this.configService.get<string>('DIET_VISION_BASE_URL') ||
        'https://api.stepfun.com/v1'
      )
        .trim()
        .replace(/\/+$/, '');

      const model = (
        this.configService.get<string>('BODY_FAT_VISION_MODEL') ||
        this.configService.get<string>('DIET_VISION_MODEL') ||
        'step-1o-turbo-vision'
      ).trim();

      const messages: Array<{
        role: string;
        content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
      }> = [];

      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }

      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ],
      });

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          response_format: { type: 'json_object' },
          temperature: generationConfig.temperature ?? 0.2,
          max_tokens: generationConfig.maxOutputTokens ?? 256,
        }),
      });

      let payload: any = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const remoteMessage = payload?.error?.message || `HTTP ${response.status}`;
        throw new Error(`Vision model request failed: ${remoteMessage}`);
      }

      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        throw new Error('Vision model returned empty response text');
      }

      return content;
    }

    // Fallback to Gemini text-only when no vision API key is configured.
    const text = await this.requestGemini(
      `${prompt}\nImage URL: ${imageDataUrl}`,
      generationConfig,
      systemPrompt,
    );
    return text;
  }

  private async requestVisionImages(
    prompt: string,
    imageDataUrls: string[],
    generationConfig: GeminiGenerationConfig,
    systemPrompt?: string,
  ): Promise<string> {
    if (imageDataUrls.length === 0 || imageDataUrls.length > 2) {
      throw new Error('Vision comparison requires one or two images');
    }
    const apiKey =
      this.configService.get<string>('STEPFUN_API_KEY')?.trim() ||
      this.configService.get<string>('DIET_VISION_API_KEY')?.trim() ||
      '';
    if (!apiKey) {
      throw new InternalServerErrorException('Vision API key is not configured');
    }
    const baseUrl = (
      this.configService.get<string>('STEPFUN_BASE_URL') ||
      this.configService.get<string>('DIET_VISION_BASE_URL') ||
      'https://api.stepfun.com/v1'
    ).trim().replace(/\/+$/, '');
    const model = (
      this.configService.get<string>('BODY_FAT_VISION_MODEL') ||
      this.configService.get<string>('DIET_VISION_MODEL') ||
      'step-1o-turbo-vision'
    ).trim();
    const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
      { type: 'text', text: prompt },
      ...imageDataUrls.map((url) => ({ type: 'image_url', image_url: { url } })),
    ];
    const messages: Array<{ role: string; content: string | typeof content }> = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content });
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        response_format: { type: 'json_object' },
        temperature: generationConfig.temperature ?? 0,
        max_tokens: generationConfig.maxOutputTokens ?? 192,
      }),
    });
    let payload: any = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const remoteMessage = payload?.error?.message || `HTTP ${response.status}`;
      throw new Error(`Vision model request failed: ${remoteMessage}`);
    }
    const text = payload?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) {
      throw new Error('Vision model returned empty response text');
    }
    return text;
  }

  private async requestGemini(
    prompt: string,
    generationConfig: GeminiGenerationConfig,
    systemPrompt?: string,
  ): Promise<string> {
    const deepseekBaseUrl = this.configService.get<string>('DEEPSEEK_BASE_URL', '');
    const deepseekApiKey = this.configService.get<string>('DEEPSEEK_API_KEY', '');

    if (deepseekBaseUrl && deepseekApiKey) {
      return this.requestDeepSeek(prompt, generationConfig, systemPrompt, deepseekBaseUrl, deepseekApiKey);
    }

    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey?.trim()) {
      throw new InternalServerErrorException('GEMINI_API_KEY is not configured');
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          ...(systemPrompt ? { system_instruction: { parts: [{ text: systemPrompt }] } } : {}),
          generationConfig,
        }),
      },
    );

    const data = (await response.json()) as GeminiResponse;

    if (!response.ok) {
      const remoteMessage = data.error?.message || `HTTP ${response.status}`;
      throw new Error(`Gemini request failed: ${remoteMessage}`);
    }

    const text = data.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === 'string')?.text;
    if (!text) {
      throw new Error('Gemini returned empty response text');
    }

    return text;
  }

  private async requestDeepSeek(
    prompt: string,
    generationConfig: GeminiGenerationConfig,
    systemPrompt: string | undefined,
    baseUrl: string,
    apiKey: string,
  ): Promise<string> {
    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const maxTokens = Math.max(generationConfig.maxOutputTokens || 1024, 2048);

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.configService.get<string>('DEEPSEEK_MODEL', 'deepseek-v4-flash'),
        messages,
        temperature: generationConfig.temperature,
        max_tokens: maxTokens,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const remoteMessage = data?.error?.message || `HTTP ${response.status}`;
      throw new Error(`DeepSeek request failed: ${remoteMessage}`);
    }

    const msg = data?.choices?.[0]?.message;
    const content = msg?.content;
    const reasoning = msg?.reasoning_content;
    const text = (typeof content === 'string' && content.trim())
      ? content
      : (typeof reasoning === 'string' ? reasoning : '');
    if (!text) {
      throw new Error('DeepSeek returned empty response');
    }

    return text;
  }

  private parseJsonResponse<T>(rawText: string): T {
    const cleaned = rawText
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      return JSON.parse(cleaned) as T;
    } catch {
      throw new Error('Model returned invalid JSON response');
    }
  }
}
