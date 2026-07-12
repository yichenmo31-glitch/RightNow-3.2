import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenClawClient } from '../openclaw/openclaw.client';
import { PrismaService } from '../prisma/prisma.service';

interface MemoryProfileContent {
  facts?: Array<{ category?: unknown; content?: unknown }>;
}

@Injectable()
export class MemorySyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly openClaw: OpenClawClient,
  ) {}

  async synchronize(userId: string): Promise<void> {
    const profile = await this.prisma.agentMemoryProfile.findUnique({ where: { userId } });
    const content = this.serialize(profile?.content);
    const base = (this.config.get<string>('OPENCLAW_ADMIN_URL') || '').trim().replace(/\/+$/, '');
    const token = (this.config.get<string>('OPENCLAW_ADMIN_TOKEN') || '').trim();
    if (!base || !token) throw new Error('OpenClaw admin Memory sync is not configured');
    const agentId = this.openClaw.toAgentId(userId);
    const configuredTimeout = Number(this.config.get<string>('OPENCLAW_ADMIN_TIMEOUT_MS'));
    const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0
      ? configuredTimeout
      : 5_000;
    let response: Response;
    try {
      response = await fetch(`${base}/agents/${encodeURIComponent(agentId)}/memory`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const reason = error instanceof Error && error.name === 'TimeoutError' ? 'timed out' : 'failed';
      throw new Error(`OpenClaw Memory sync ${reason}`);
    }
    if (!response.ok) throw new Error(`OpenClaw Memory sync failed: HTTP ${response.status}`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error('OpenClaw Memory sync returned a non-JSON response');
    }
    const result: unknown = await response.json().catch(() => null);
    if (!result || typeof result !== 'object' || (result as { agentId?: unknown }).agentId !== agentId) {
      throw new Error('OpenClaw Memory sync returned an invalid agent identity');
    }
  }

  serialize(content: unknown): string {
    const facts = this.factsFrom(content)
      .map((fact) => ({
        category: this.clean(String(fact.category)),
        content: this.clean(String(fact.content)),
      }))
      .filter((fact) => fact.category && fact.content)
      .sort((left, right) =>
        left.category.localeCompare(right.category) || left.content.localeCompare(right.content),
      );

    if (facts.length === 0) {
      return '# Durable Preferences\n\nNo durable preferences confirmed yet.\n';
    }

    const lines = facts.map(
      (fact) => `- **${this.escapeMarkdown(fact.category)}**: ${this.escapeMarkdown(fact.content)}`,
    );
    return `# Durable Preferences\n\n${lines.join('\n')}\n`;
  }

  private factsFrom(content: unknown): Array<{ category: unknown; content: unknown }> {
    if (!content || typeof content !== 'object') return [];
    const facts = (content as MemoryProfileContent).facts;
    if (!Array.isArray(facts)) return [];
    return facts.filter(
      (fact): fact is { category: unknown; content: unknown } =>
        Boolean(fact) && typeof fact === 'object' && 'category' in fact && 'content' in fact,
    );
  }

  private clean(value: string): string {
    return value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private escapeMarkdown(value: string): string {
    return value.replace(/[\\`*_[\]{}()#+.!|>\-]/g, '\\$&');
  }
}
