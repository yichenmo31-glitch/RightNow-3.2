import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import { OpenClawClient } from './openclaw.client';

/**
 * OpenClawProvisioningService -- ensures a per-user agent exists in OpenClaw
 * before the user's first chat. agentId MUST be statically declared in
 * openclaw.json's agents.list (no dynamic routing -- see CONTRACT_A ´4).
 *
 * Provisioning mechanism is decided by OPENCLAW_PROVISION_MODE:
 *   - "verify"  (default, SAFESTRoet: do NOT create agents from backend; only
 *                verify the agent exists via /v1/models. If missing, throw a
 *                clear error. New users are pre-provisioned by an out-of-band
 *                ops step (or by the "agent-admin" sidecar below). This keeps
 *                the backend from needing host FS / docker-socket access.
 *   - "admin-http": POST to a tiny ops-side provisioner (the "agent-admin"
 *                endpoint) that runs `openclaw agents add` on the host. URL in
 *                OPENCLAW_ADMIN_URL, shared secret in OPENCLAW_ADMIN_TOKEN.
 *   - "config-file": Write directly to openclaw.json on the gateway (requires
 *                shared mount of the config directory).
 *
 * In-process cache avoids re-checking the gateway on every message.
 */
@Injectable()
export class OpenClawProvisioningService {
  private readonly logger = new Logger(OpenClawProvisioningService.name);
  private readonly known = new Set<string>();

  constructor(
    private readonly config: ConfigService,
    private readonly client: OpenClawClient,
  ) {}

  private mode(): 'verify' | 'admin-http' | 'config-file' {
    return (this.config.get<string>('OPENCLAW_PROVISION_MODE') || 'verify') as any;
  }

  private configPath(): string {
    return this.config.get<string>('OPENCLAW_CONFIG_PATH') || '/root/.openclaw/openclaw.json';
  }

  /** Ensure the agent for this userId is routable. Returns the agentId. */
  async ensureAgent(userId: string): Promise<string> {
    const agentId = this.client.toAgentId(userId);
    if (this.known.has(agentId)) return agentId;

    if (await this.agentExists(agentId)) {
      this.known.add(agentId);
      return agentId;
    }

    if (this.mode() === 'admin-http') {
      await this.provisionViaAdmin(agentId);
      if (!(await this.agentExists(agentId))) {
        throw new Error(`Agent ${agentId} was not ready after provisioning`);
      }
    } else if (this.mode() === 'config-file') {
      const configPath = this.configPath();
      this.logger.log(`[provision] auto-registering agent ${agentId} in ${configPath}`);
      const raw = fs.readFileSync(configPath, 'utf-8');
      const cfg = JSON.parse(raw);
      if (!cfg.agents) cfg.agents = {};
      if (!cfg.agents.list) cfg.agents.list = [];
      if (!cfg.agents.list.find((a: any) => a.id === agentId)) {
        cfg.agents.list.push({ id: agentId, workspace: `~/.openclaw/workspace-${agentId}` });
      }
      const tmpPath = configPath + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(cfg, null, 2), 'utf-8');
      fs.renameSync(tmpPath, configPath);
      this.logger.log(`[provision] agent ${agentId} written to config, waiting for hot-reload...`);
      await this.waitForAgent(agentId);
    } else {
      this.logger.error(
        `[provision] agent "${agentId}" not declared in openclaw.json agents.list ` +
          `(mode=${this.mode()}). Pre-provision it via: openclaw agents add ${agentId}`,
      );
      throw new Error(`OpenClaw agent not provisioned for user ${userId}`);
    }

    this.known.add(agentId);
    return agentId;
  }

  /** Check the server-owned Agent configuration and workspace via Provisioner. */
  private async agentExists(agentId: string): Promise<boolean> {
    if (this.mode() === 'config-file') {
      try {
        const cfg = JSON.parse(fs.readFileSync(this.configPath(), 'utf-8'));
        return cfg.agents?.list?.some((agent: any) => agent?.id === agentId) === true;
      } catch {
        return false;
      }
    }

    const base = (this.config.get<string>('OPENCLAW_ADMIN_URL') || '').trim().replace(/\/+$/, '');
    const token = (this.config.get<string>('OPENCLAW_ADMIN_TOKEN') || '').trim();
    if (!base || !token) return false;
    try {
      const res = await fetch(`${base}/agents/${encodeURIComponent(agentId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return false;
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) return false;
      const status: any = await res.json();
      return status.agentId === agentId && status.configured === true && status.workspaceReady === true;
    } catch {
      return false;
    }
  }

  async deprovisionUserAgent(userId: string, operationId: string): Promise<{ agentId: string; changed: boolean }> {
    if (this.mode() !== 'admin-http') throw new Error('OPENCLAW_DEPROVISION_MODE_UNSUPPORTED');
    if (!/^account-delete-[0-9a-f-]{36}$/.test(operationId)) throw new Error('OPENCLAW_DEPROVISION_OPERATION_INVALID');
    const agentId = this.client.toAgentId(userId);
    const base = (this.config.get<string>('OPENCLAW_ADMIN_URL') || '').trim().replace(/\/+$/, '');
    const token = (this.config.get<string>('OPENCLAW_ADMIN_TOKEN') || '').trim();
    if (!base || !token) throw new Error('OPENCLAW_DEPROVISION_NOT_CONFIGURED');
    let response: Response;
    try {
      response = await fetch(`${base}/agents/${encodeURIComponent(agentId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ operationId, reason: 'account-deletion' }),
      });
    } catch {
      throw new Error('OPENCLAW_DEPROVISION_UNAVAILABLE');
    }
    const contentType = response.headers.get('content-type') || '';
    const payload: any = contentType.includes('application/json') ? await response.json().catch(() => null) : null;
    if (!response.ok || !payload || payload.agentId !== agentId || payload.operationId !== operationId || payload.configured !== false || payload.gatewayReady !== true) {
      throw new Error('OPENCLAW_DEPROVISION_INVALID_RESPONSE');
    }
    this.known.delete(agentId);
    return { agentId, changed: payload.changed === true };
  }

  async listQuarantines(): Promise<Array<{ operationId: string; agentId: string; status: string; quarantinedAt: string; ageDays: number; resourceCount: number }>> {
    const { base, token } = this.adminConnection('OPENCLAW_QUARANTINE_LIST');
    const response = await fetch(`${base}/quarantine`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
    if (!response?.ok || !(response.headers.get('content-type') || '').includes('application/json')) throw new Error('OPENCLAW_QUARANTINE_LIST_INVALID_RESPONSE');
    const payload: any = await response.json().catch(() => null);
    if (!Array.isArray(payload?.quarantines)) throw new Error('OPENCLAW_QUARANTINE_LIST_INVALID_RESPONSE');
    return payload.quarantines.map((item: any) => {
      if (!item || !/^account-delete-[0-9a-f-]{36}$/.test(item.operationId) || !/^rightnow-[a-z0-9][a-z0-9_-]*$/.test(item.agentId) || item.status !== 'quarantined' || !Number.isInteger(item.ageDays) || !Number.isInteger(item.resourceCount)) {
        throw new Error('OPENCLAW_QUARANTINE_LIST_INVALID_RESPONSE');
      }
      return { operationId: item.operationId, agentId: item.agentId, status: item.status, quarantinedAt: String(item.quarantinedAt), ageDays: item.ageDays, resourceCount: item.resourceCount };
    });
  }

  async purgeQuarantine(operationId: string, retentionDays: number, dryRun: boolean) {
    if (!/^account-delete-[0-9a-f-]{36}$/.test(operationId)) throw new Error('OPENCLAW_QUARANTINE_PURGE_OPERATION_INVALID');
    if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) throw new Error('OPENCLAW_QUARANTINE_PURGE_RETENTION_INVALID');
    if (typeof dryRun !== 'boolean') throw new Error('OPENCLAW_QUARANTINE_PURGE_MODE_INVALID');
    const { base, token } = this.adminConnection('OPENCLAW_QUARANTINE_PURGE');
    const response = await fetch(`${base}/quarantine/purge`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ operationId, retentionDays, dryRun }),
    }).catch(() => null);
    if (!response?.ok || !(response.headers.get('content-type') || '').includes('application/json')) throw new Error('OPENCLAW_QUARANTINE_PURGE_INVALID_RESPONSE');
    const payload: any = await response.json().catch(() => null);
    if (!payload || payload.operationId !== operationId || payload.dryRun !== dryRun || typeof payload.eligible !== 'boolean' || typeof payload.purged !== 'boolean' || typeof payload.alreadyPurged !== 'boolean') {
      throw new Error('OPENCLAW_QUARANTINE_PURGE_INVALID_RESPONSE');
    }
    return { operationId, dryRun, eligible: payload.eligible, purged: payload.purged, alreadyPurged: payload.alreadyPurged };
  }

  private adminConnection(errorPrefix: string) {
    if (this.mode() !== 'admin-http') throw new Error(`${errorPrefix}_MODE_UNSUPPORTED`);
    const base = (this.config.get<string>('OPENCLAW_ADMIN_URL') || '').trim().replace(/\/+$/, '');
    const token = (this.config.get<string>('OPENCLAW_ADMIN_TOKEN') || '').trim();
    if (!base || !token) throw new Error(`${errorPrefix}_NOT_CONFIGURED`);
    return { base, token };
  }

  private async waitForAgent(agentId: string, tries = 20, delayMs = 500): Promise<void> {
    for (let i = 0; i < tries; i++) {
      if (await this.agentExists(agentId)) return;
      await new Promise((r) => setTimeout(r, delayMs));
    }
    throw new Error(`Agent ${agentId} did not become routable after provisioning`);
  }

  /** Call the ops-side admin provisioner that runs `openclaw agents add`. */
  private async provisionViaAdmin(agentId: string): Promise<void> {
    const url = (this.config.get<string>('OPENCLAW_ADMIN_URL') || '').trim();
    const token = (this.config.get<string>('OPENCLAW_ADMIN_TOKEN') || '').trim();
    if (!url) throw new Error('OPENCLAW_ADMIN_URL @is not configured for admin-http provisioning');
    const res = await fetch(`${url.replace(/\/+$/, '')}/provision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ agentId }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`admin provisioning failed: HTTP ${res.status} ${t}`.trim());
    }
    this.logger.log(`[provision] requested admin provisioning for agent=${agentId}`);
  }
}
