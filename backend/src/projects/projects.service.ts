import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project, VALID_PROJECT_TYPES } from '../entities/project.entity';
import { fetchWithTimeout } from '../fetch.util';
import { AuditLogService } from '../audit-log/audit-log.service';
import { HackatimeService } from '../hackatime/hackatime.service';
import { CreateProjectDto } from './create-project.dto';

/** Max raw image size in bytes (5 MB). */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const CDN_UPLOAD_URL = 'https://cdn.hackclub.com/api/v4/upload';

/** MIME → file extension mapping for uploaded screenshots. */
const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

/** PNG, JPEG, GIF, WEBP magic-byte prefixes (base64-encoded first bytes). */
const IMAGE_SIGNATURES: { mime: string; b64Prefix: string }[] = [
  { mime: 'image/png', b64Prefix: 'iVBOR' },
  { mime: 'image/jpeg', b64Prefix: '/9j/' },
  { mime: 'image/gif', b64Prefix: 'R0lGOD' },
  { mime: 'image/webp', b64Prefix: 'UklGR' },
];

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);
  private readonly cdnApiKey: string;

  constructor(
    private configService: ConfigService,
    private auditLogService: AuditLogService,
    private hackatimeService: HackatimeService,
    @InjectRepository(Project)
    private projectRepo: Repository<Project>,
  ) {
    this.cdnApiKey = this.configService.getOrThrow('CDN_API_KEY');
  }

  /* ------------------------------------------------------------------ */
  /*  Public                                                             */
  /* ------------------------------------------------------------------ */

  async create(
    dto: CreateProjectDto,
    userId: string,
    hcaSub: string,
  ) {
    // --- required fields ---
    const name = this.requireString(dto.name, 'name', 50);
    const description = this.requireString(dto.description, 'description', 300);
    const projectType = this.validateProjectType(dto.projectType);

    // --- optional URLs ---
    const codeUrl = this.validateUrl(dto.codeUrl, 'codeUrl');
    const readmeUrl = this.validateUrl(dto.readmeUrl, 'readmeUrl');
    const demoUrl = this.validateUrl(dto.demoUrl, 'demoUrl');

    // --- optional screenshots (max 2) — validate then upload to CDN ---
    const validated = this.validateScreenshots(dto.screenshots);
    const screenshotUrls = await this.uploadScreenshots(validated);

    // --- optional hackatime project name (validated against real projects) ---
    let hackatimeProjectName: string | null = null;
    if (dto.hackatimeProjectName && typeof dto.hackatimeProjectName === 'string') {
      const cleaned = this.sanitize(dto.hackatimeProjectName).slice(0, 255);
      if (cleaned) {
        const realProjects =
          await this.hackatimeService.getProjectNames(hcaSub);
        if (!realProjects.includes(cleaned)) {
          throw new BadRequestException(
            'That Hackatime project was not found on your account',
          );
        }
        hackatimeProjectName = cleaned;
      }
    }

    const project = this.projectRepo.create({
      userId,
      name,
      description,
      projectType,
      codeUrl,
      readmeUrl,
      demoUrl,
      screenshot1Url: screenshotUrls[0],
      screenshot2Url: screenshotUrls[1],
      hackatimeProjectName,
    });

    const saved = await this.projectRepo.save(project);

    await this.auditLogService.log(
      userId,
      'project_created',
      `Created project "${name}"`,
    );

    // Strip internal fields before returning to frontend
    const { userId: _uid, user: _user, ...safe } = saved;
    return safe;
  }

  async findByUser(userId: string) {
    const projects = await this.projectRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      select: [
        'id',
        'name',
        'description',
        'projectType',
        'codeUrl',
        'readmeUrl',
        'demoUrl',
        'screenshot1Url',
        'screenshot2Url',
        'hackatimeProjectName',
        'createdAt',
        'updatedAt',
      ],
    });
    return projects;
  }

  async userHasProjects(userId: string): Promise<boolean> {
    const count = await this.projectRepo.count({ where: { userId } });
    return count > 0;
  }

  /* ------------------------------------------------------------------ */
  /*  Sanitisation helpers                                               */
  /* ------------------------------------------------------------------ */

  /**
   * Strips characters that could be used for HTML/SQL/script injection.
   * The result is treated as a plain-text string.
   */
  private sanitize(raw: string): string {
    return raw
      .replace(/[<>"'`&\\]/g, '') // strip injection-relevant chars
      .replace(/\0/g, '') // strip null bytes
      .trim();
  }

  private requireString(
    value: unknown,
    field: string,
    maxLen: number,
  ): string {
    if (!value || typeof value !== 'string') {
      throw new BadRequestException(`${field} is required`);
    }
    const clean = this.sanitize(value).slice(0, maxLen);
    if (clean.length === 0) {
      throw new BadRequestException(`${field} is required`);
    }
    return clean;
  }

  private validateProjectType(value: unknown): string {
    if (!value || typeof value !== 'string') {
      throw new BadRequestException('projectType is required');
    }
    const v = value.trim().toLowerCase();
    if (!(VALID_PROJECT_TYPES as readonly string[]).includes(v)) {
      throw new BadRequestException(
        `projectType must be one of: ${VALID_PROJECT_TYPES.join(', ')}`,
      );
    }
    return v;
  }

  /* ------------------------------------------------------------------ */
  /*  URL validation                                                     */
  /* ------------------------------------------------------------------ */

  /** Matches private/reserved IP ranges and localhost. */
  private static readonly BLOCKED_HOSTS =
    /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|::1$|fc|fd|\[::1\])/i;

  private validateUrl(
    value: string | undefined,
    field: string,
  ): string | null {
    if (!value || typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;

    if (!trimmed.startsWith('https://')) {
      throw new BadRequestException(
        `${field} must start with https:// — please prepend it to your link`,
      );
    }

    if (trimmed.length > 2048) {
      throw new BadRequestException(`${field} is too long (max 2048 chars)`);
    }

    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'https:') {
        throw new Error();
      }
      if (ProjectsService.BLOCKED_HOSTS.test(parsed.hostname)) {
        throw new Error('Internal URL');
      }
    } catch {
      throw new BadRequestException(`${field} is not a valid URL`);
    }

    return trimmed;
  }

  /* ------------------------------------------------------------------ */
  /*  Screenshot validation & CDN upload                                 */
  /* ------------------------------------------------------------------ */

  /**
   * Validates base64 data URIs: checks MIME type, magic bytes, and size.
   * Returns an array of { mime, buffer } for valid screenshots.
   */
  private validateScreenshots(
    screenshots: string[] | undefined,
  ): { mime: string; buffer: Buffer }[] {
    if (!screenshots || !Array.isArray(screenshots)) return [];

    const items = screenshots.slice(0, 2);
    const results: { mime: string; buffer: Buffer }[] = [];

    for (let i = 0; i < items.length; i++) {
      const raw = items[i];
      if (!raw || typeof raw !== 'string') continue;

      // Expect data URI format: data:image/...;base64,...
      const match = raw.match(
        /^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/,
      );
      if (!match) {
        throw new BadRequestException(
          `Screenshot ${i + 1} must be a PNG, JPEG, GIF, or WebP image`,
        );
      }

      const declaredMime = match[1];
      const b64Data = match[2];

      // Decode to check real size and magic bytes
      const buffer = Buffer.from(b64Data, 'base64');

      if (buffer.length > MAX_IMAGE_BYTES) {
        throw new BadRequestException(
          `Screenshot ${i + 1} exceeds 5 MB limit`,
        );
      }

      // Verify magic bytes match declared MIME type
      const sig = IMAGE_SIGNATURES.find((s) => s.mime === declaredMime);
      if (!sig || !b64Data.startsWith(sig.b64Prefix)) {
        throw new BadRequestException(
          `Screenshot ${i + 1} content does not match its declared type (${declaredMime})`,
        );
      }

      results.push({ mime: declaredMime, buffer });
    }

    return results;
  }

  /**
   * Uploads validated screenshot buffers to the Hack Club CDN.
   * Returns [url1 | null, url2 | null].
   */
  private async uploadScreenshots(
    items: { mime: string; buffer: Buffer }[],
  ): Promise<[string | null, string | null]> {
    const urls: [string | null, string | null] = [null, null];

    for (let i = 0; i < items.length; i++) {
      const { mime, buffer } = items[i];
      const ext = MIME_EXTENSIONS[mime] ?? 'bin';
      const filename = `screenshot-${Date.now()}-${i + 1}.${ext}`;

      const blob = new Blob([new Uint8Array(buffer)], { type: mime });
      const formData = new FormData();
      formData.append('file', blob, filename);

      const res = await fetchWithTimeout(CDN_UPLOAD_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.cdnApiKey}` },
        body: formData,
      });

      if (!res.ok) {
        const err = await res.text().catch(() => '');
        this.logger.error(`CDN upload failed (${res.status}): ${err}`);
        throw new BadRequestException(
          `Failed to upload screenshot ${i + 1}. Please try again.`,
        );
      }

      const data = await res.json().catch(() => null);
      if (!data?.url) {
        this.logger.error(`CDN upload returned no URL for screenshot ${i + 1}`);
        throw new BadRequestException(
          `Failed to upload screenshot ${i + 1}. Please try again.`,
        );
      }
      urls[i] = data.url;
    }

    return urls;
  }
}
