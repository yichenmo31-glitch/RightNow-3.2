import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { extname, join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { getModelPromptBinding, ModelPromptCode } from '../prompts/prompt-catalog';

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
      {
        temperature: 0.3,
        topP: 0.8,
        maxOutputTokens: 512,
      },
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
      {
        temperature: 0.3,
        topP: 0.8,
        maxOutputTokens: 512,
      },
      systemPrompt,
    );

    return this.parseJsonResponse<{
      calories: number;
      protein: number;
      fat: number;
      carbs: number;
    }>(text);
  }

  async estimateBodyFatFromImage(imageUrl: string): Promise<number> {
    const dataUrl = await this.imageUrlToDataUrl(imageUrl);
    const systemPrompt =
      'You are a body composition estimation assistant. Analyze the visible physique in the photo and estimate the body fat percentage. Return only a JSON object in the format {"bodyFat": 18.5}. Do not include explanation, markdown, or any other fields.';
    const userPrompt =
      'Estimate this person\'s body fat percentage from the uploaded photo. Return JSON only.';

    const text = await this.requestVision(userPrompt, dataUrl, {
      temperature: 0.2,
      maxOutputTokens: 128,
    }, systemPrompt);

    const parsed = this.parseJsonResponse<{ bodyFat?: number }>(text);
    const value = Number(parsed?.bodyFat);
    if (!Number.isFinite(value)) {
      throw new Error('Model returned invalid body fat percentage');
    }
    return value;
  }

  private async imageUrlToDataUrl(imageUrl: string): Promise<string> {
    if (imageUrl.startsWith('data:')) {
      return imageUrl;
    }

    let buffer: Buffer;
    let mime = 'image/jpeg';

    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${imageUrl}`);
      }
      buffer = Buffer.from(await response.arrayBuffer());
      const pathname = new URL(imageUrl).pathname;
      mime = this.mimeFromExtension(extname(pathname));
    } else {
      const localPath = imageUrl.startsWith('/uploads/')
        ? join(process.cwd(), 'uploads', imageUrl.replace('/uploads/', ''))
        : join(process.cwd(), imageUrl);
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
            key_scene: {
              key: binding.key,
              scene: binding.scene,
            },
          },
          select: {
            content: true,
            enabled: true,
          },
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
      if (value === undefined || value === null) {
        return '';
      }
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
          max_tokens: generationConfig.maxOutputTokens ?? 128,
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

    // DeepSeek reasoning model needs extra tokens for internal reasoning
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
