import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project, VALID_PROJECT_TYPES } from '../entities/project.entity';
import { fetchWithTimeout } from '../fetch.util';
import { AuditLogService } from '../audit-log/audit-log.service';
import { HackatimeService } from '../hackatime/hackatime.service';
import { CreateProjectDto } from './create-project.dto';
import { UpdateProjectDto } from './update-project.dto';

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

    // --- optional hackatime project names (validated against real projects) ---
    const hackatimeProjectName: string[] = [];
    if (dto.hackatimeProjectName && Array.isArray(dto.hackatimeProjectName) && dto.hackatimeProjectName.length > 0) {
      const realProjects = await this.hackatimeService.getProjectNames(hcaSub);
      for (const raw of dto.hackatimeProjectName) {
        if (typeof raw !== 'string') continue;
        const cleaned = this.sanitize(raw).slice(0, 255);
        if (!cleaned) continue;
        if (!realProjects.includes(cleaned)) {
          throw new BadRequestException(
            `Hackatime project "${cleaned}" was not found on your account`,
          );
        }
        hackatimeProjectName.push(cleaned);
      }
    }

    const isUpdate = dto.isUpdate === true;
    const otherHcProgram = this.validateOptionalString(dto.otherHcProgram, 'otherHcProgram', 255);
    const aiUse = this.validateOptionalString(dto.aiUse, 'aiUse', 200);

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
      isUpdate,
      otherHcProgram,
      aiUse,
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
        'status',
        'isUpdate',
        'otherHcProgram',
        'aiUse',
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

  async update(
    projectId: string,
    dto: UpdateProjectDto,
    userId: string,
    hcaSub: string,
  ) {
    const project = await this.projectRepo.findOne({
      where: { id: projectId, userId },
    });
    if (!project) throw new NotFoundException('Project not found');

    if (dto.name !== undefined) {
      project.name = this.requireString(dto.name, 'name', 50);
    }
    if (dto.description !== undefined) {
      project.description = this.requireString(dto.description, 'description', 300);
    }
    if (dto.projectType !== undefined) {
      project.projectType = this.validateProjectType(dto.projectType);
    }
    if (dto.codeUrl !== undefined) {
      project.codeUrl = dto.codeUrl === null ? null : this.validateUrl(dto.codeUrl, 'codeUrl');
    }
    if (dto.readmeUrl !== undefined) {
      project.readmeUrl = dto.readmeUrl === null ? null : this.validateUrl(dto.readmeUrl, 'readmeUrl');
    }
    if (dto.demoUrl !== undefined) {
      project.demoUrl = dto.demoUrl === null ? null : this.validateUrl(dto.demoUrl, 'demoUrl');
    }
    if (dto.screenshots !== undefined) {
      const validated = this.validateScreenshots(dto.screenshots);
      const screenshotUrls = await this.uploadScreenshots(validated);
      project.screenshot1Url = screenshotUrls[0];
      project.screenshot2Url = screenshotUrls[1];
    }
    if (dto.hackatimeProjectName !== undefined) {
      if (dto.hackatimeProjectName === null || (Array.isArray(dto.hackatimeProjectName) && dto.hackatimeProjectName.length === 0)) {
        project.hackatimeProjectName = [];
      } else if (Array.isArray(dto.hackatimeProjectName)) {
        const realProjects = await this.hackatimeService.getProjectNames(hcaSub);
        const validated: string[] = [];
        for (const raw of dto.hackatimeProjectName) {
          if (typeof raw !== 'string') continue;
          const cleaned = this.sanitize(raw).slice(0, 255);
          if (!cleaned) continue;
          if (!realProjects.includes(cleaned)) {
            throw new BadRequestException(
              `Hackatime project "${cleaned}" was not found on your account`,
            );
          }
          validated.push(cleaned);
        }
        project.hackatimeProjectName = validated;
      }
    }
    if (dto.isUpdate !== undefined) {
      project.isUpdate = dto.isUpdate === true;
    }
    if (dto.otherHcProgram !== undefined) {
      project.otherHcProgram = dto.otherHcProgram === null ? null : this.validateOptionalString(dto.otherHcProgram, 'otherHcProgram', 255);
    }
    if (dto.aiUse !== undefined) {
      project.aiUse = dto.aiUse === null ? null : this.validateOptionalString(dto.aiUse, 'aiUse', 200);
    }
    if (dto.status !== undefined) {
      if (dto.status !== 'unreviewed') {
        throw new BadRequestException('You can only submit a project for review');
      }
      project.status = 'unreviewed';
    }

    const saved = await this.projectRepo.save(project);

    if (dto.status === 'unreviewed') {
      await this.auditLogService.log(
        userId,
        'project_submitted',
        `Submitted "${project.name}" for review`,
      );
    } else {
      await this.auditLogService.log(
        userId,
        'project_updated',
        `Updated project "${project.name}"`,
      );
    }

    const { userId: _uid, user: _user, ...safe } = saved;
    return safe;
  }

  async delete(projectId: string, userId: string) {
    const project = await this.projectRepo.findOne({
      where: { id: projectId, userId },
    });
    if (!project) throw new NotFoundException('Project not found');

    const name = project.name;
    await this.projectRepo.remove(project);

    await this.auditLogService.log(
      userId,
      'project_deleted',
      `Deleted project "${name}"`,
    );
  }

  /* ------------------------------------------------------------------ */
  /*  Sanitisation helpers                                               */
  /* ------------------------------------------------------------------ */

  /**
   * Strips characters that could be used for HTML/SQL/script injection.
   * The result is treated as a plain-text string.
   */
  private sanitize(raw: string): string {
    return String(raw)
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

  private validateOptionalString(
    value: unknown,
    field: string,
    maxLen: number,
  ): string | null {
    if (!value || typeof value !== 'string') return null;
    const clean = this.sanitize(value).slice(0, maxLen);
    return clean.length === 0 ? null : clean;
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

      let res: Response;
      try {
        res = await fetchWithTimeout(CDN_UPLOAD_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.cdnApiKey}` },
          body: formData,
        });
      } catch (err) {
        this.logger.error(`CDN upload network error for screenshot ${i + 1}: ${err}`);
        throw new BadRequestException(
          `Screenshot upload failed — the CDN is unreachable. Try again without a screenshot.`,
        );
      }

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
