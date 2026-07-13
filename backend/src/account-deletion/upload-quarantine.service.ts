import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { UPLOADS_DIR, resolveLocalUploadPath } from '../common/upload.util';

type QuarantineEntry = {
  assetId: string;
  source: string;
  destination: string;
  moved: boolean;
};

type QuarantineManifest = {
  version: 1;
  operationId: string;
  userId: string;
  status: 'moving' | 'quarantined' | 'restored';
  entries: QuarantineEntry[];
};

@Injectable()
export class UploadQuarantineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  quarantineUserUploads(userId: string, operationId: string) {
    this.validateOperationId(operationId);
    return this.quarantine(userId, operationId);
  }

  restoreQuarantine(userId: string, operationId: string) {
    this.validateOperationId(operationId);
    const manifestPath = this.manifestPath(operationId);
    if (!existsSync(manifestPath)) return { restored: false, fileCount: 0 };
    const manifest = this.readManifest(manifestPath, userId, operationId);
    if (manifest.status === 'restored') return { restored: false, fileCount: manifest.entries.length };
    for (const entry of [...manifest.entries].reverse()) {
      if (!entry.moved || !existsSync(entry.destination)) continue;
      if (existsSync(entry.source)) throw new Error('UPLOAD_RESTORE_SOURCE_CONFLICT');
      mkdirSync(dirname(entry.source), { recursive: true });
      renameSync(entry.destination, entry.source);
      entry.moved = false;
      this.writeManifest(manifestPath, manifest);
    }
    manifest.status = 'restored';
    this.writeManifest(manifestPath, manifest);
    return { restored: true, fileCount: manifest.entries.length };
  }

  private async quarantine(userId: string, operationId: string) {
    const root = this.quarantineRoot();
    const operationDir = join(root, operationId);
    const manifestPath = this.manifestPath(operationId);
    if (existsSync(manifestPath)) {
      const manifest = this.readManifest(manifestPath, userId, operationId);
      if (manifest.status === 'quarantined') return { changed: false, fileCount: manifest.entries.length };
      if (manifest.status === 'restored') throw new Error('UPLOAD_QUARANTINE_ALREADY_RESTORED');
      return this.resumeMoving(manifestPath, manifest);
    }

    const assets = await this.prisma.uploadAsset.findMany({
      where: { userId },
      select: { id: true, url: true },
      orderBy: { id: 'asc' },
    });
    const unique = new Map<string, { assetId: string; source: string }>();
    for (const asset of assets) {
      const source = resolveLocalUploadPath(asset.url);
      if (!source) throw new Error('UPLOAD_QUARANTINE_EXTERNAL_ASSET_UNSUPPORTED');
      this.assertSafeSource(source);
      if (existsSync(source)) unique.set(source, { assetId: asset.id, source });
    }
    mkdirSync(operationDir, { recursive: true });
    const manifest: QuarantineManifest = {
      version: 1,
      operationId,
      userId,
      status: 'moving',
      entries: [...unique.values()].map((entry) => ({
        ...entry,
        destination: join(operationDir, basename(entry.source)),
        moved: false,
      })),
    };
    this.writeManifest(manifestPath, manifest);
    return this.resumeMoving(manifestPath, manifest);
  }

  private resumeMoving(manifestPath: string, manifest: QuarantineManifest) {
    try {
      for (const entry of manifest.entries) {
        if (entry.moved) continue;
        this.assertSafeSource(entry.source);
        if (!existsSync(entry.source)) {
          if (existsSync(entry.destination)) {
            entry.moved = true;
            this.writeManifest(manifestPath, manifest);
            continue;
          }
          throw new Error('UPLOAD_QUARANTINE_SOURCE_MISSING');
        }
        if (existsSync(entry.destination)) throw new Error('UPLOAD_QUARANTINE_DESTINATION_CONFLICT');
        renameSync(entry.source, entry.destination);
        entry.moved = true;
        this.writeManifest(manifestPath, manifest);
      }
      manifest.status = 'quarantined';
      this.writeManifest(manifestPath, manifest);
      return { changed: true, fileCount: manifest.entries.length };
    } catch (error) {
      for (const entry of [...manifest.entries].reverse()) {
        if (!entry.moved || !existsSync(entry.destination) || existsSync(entry.source)) continue;
        renameSync(entry.destination, entry.source);
        entry.moved = false;
      }
      this.writeManifest(manifestPath, manifest);
      throw error;
    }
  }

  private assertSafeSource(source: string) {
    const uploadRoot = resolve(UPLOADS_DIR);
    const canonical = resolve(source);
    const pathWithinRoot = relative(uploadRoot, canonical);
    if (!pathWithinRoot || pathWithinRoot.startsWith(`..${sep}`) || pathWithinRoot === '..' || isAbsolute(pathWithinRoot)) {
      throw new Error('UPLOAD_QUARANTINE_PATH_OUTSIDE_ROOT');
    }
    if (existsSync(canonical)) {
      const stat = lstatSync(canonical);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('UPLOAD_QUARANTINE_SOURCE_NOT_REGULAR');
    }
  }

  private quarantineRoot() {
    const configured = this.config.get<string>('ACCOUNT_DELETION_UPLOAD_QUARANTINE_ROOT')?.trim();
    const root = resolve(configured || join(process.cwd(), '..', '.work', 'account-deletion-upload-quarantine'));
    const uploadRoot = resolve(UPLOADS_DIR);
    if (root === uploadRoot || root.startsWith(`${uploadRoot}${sep}`)) throw new Error('UPLOAD_QUARANTINE_ROOT_INVALID');
    return root;
  }

  private manifestPath(operationId: string) {
    return join(this.quarantineRoot(), operationId, 'manifest.json');
  }

  private readManifest(path: string, userId: string, operationId: string): QuarantineManifest {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as QuarantineManifest;
    if (parsed.version !== 1 || parsed.userId !== userId || parsed.operationId !== operationId || !Array.isArray(parsed.entries)) {
      throw new Error('UPLOAD_QUARANTINE_MANIFEST_INVALID');
    }
    return parsed;
  }

  private writeManifest(path: string, manifest: QuarantineManifest) {
    mkdirSync(dirname(path), { recursive: true });
    const temp = `${path}.tmp`;
    writeFileSync(temp, JSON.stringify(manifest), { encoding: 'utf8', mode: 0o600 });
    renameSync(temp, path);
  }

  private validateOperationId(operationId: string) {
    if (!/^account-delete-[0-9a-f-]{36}$/.test(operationId)) throw new Error('UPLOAD_QUARANTINE_OPERATION_INVALID');
  }
}
