import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Devlog } from '../entities/devlog.entity';
import { Project } from '../entities/project.entity';
import { fetchWithTimeout } from '../fetch.util';
import { AuditLogService } from '../audit-log/audit-log.service';
import { LookoutService, LookoutSessionDTO } from '../lookout/lookout.service';
import { CreateDevlogDto } from './create-devlog.dto';

const CDN_UPLOAD_URL = 'https://cdn.hackclub.com/api/v4/upload';

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

const IMAGE_SIGNATURES: { mime: string; b64Prefix: string }[] = [
  { mime: 'image/png', b64Prefix: 'iVBOR' },
  { mime: 'image/jpeg', b64Prefix: '/9j/' },
  { mime: 'image/gif', b64Prefix: 'R0lGOD' },
  { mime: 'image/webp', b64Prefix: 'UklGR' },
];

const MAX_IMAGES_PER_DEVLOG = 4;
const MAX_TITLE_LEN = 120;
const MAX_TEXT_LEN = 5000;

@Injectable()
export class DevlogsService {
  private readonly logger = new Logger(DevlogsService.name);
  private readonly cdnApiKey: string;

  constructor(
    private configService: ConfigService,
    private auditLogService: AuditLogService,
    private lookoutService: LookoutService,
    private dataSource: DataSource,
    @InjectRepository(Devlog) private devlogRepo: Repository<Devlog>,
    @InjectRepository(Project) private projectRepo: Repository<Project>,
  ) {
    this.cdnApiKey = this.configService.getOrThrow('CDN_API_KEY');
  }

  /* ---------------------------------------------------------------- */
  /*  Public API                                                       */
  /* ---------------------------------------------------------------- */

  async create(userId: string, dto: CreateDevlogDto) {
    const title = this.requireTitle(dto.title);
    const text = this.requireText(dto.text);
    const project = await this.requireProjectId(dto.projectId, userId);
    const projectId = project.id;

    const validated = this.validateImages(dto.images);
    const imageUrls = await this.uploadImages(validated);

    const devlog = this.devlogRepo.create({
      userId,
      projectId,
      title,
      text,
      imageUrls,
    });
    const saved = await this.devlogRepo.save(devlog);

    if (dto.lookoutSessionId) {
      await this.lookoutService.attachToDevlog(
        dto.lookoutSessionId,
        userId,
        projectId,
        saved.id,
      );
    }

    await this.auditLogService.log(
      userId,
      'devlog_created',
      `Created devlog "${title}" (${text.length} chars) on project ${project.name}`,
    );

    return this.toPublic(saved);
  }

  async findByUser(userId: string) {
    const rows = await this.devlogRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    const lookouts = await this.lookoutService.findForDevlogs(
      rows.map((d) => d.id),
    );
    return rows.map((d) => this.toPublic(d, lookouts.get(d.id) ?? null));
  }

  // `isSuperAdmin` defaults to false so this fails closed: non-Super-Admin
  // reviewers never see the builder's legal name, only their nickname (or Slack
  // ID as a fallback). Mirrors the redaction in AdminService.listAllProjects.
  async findByProject(projectId: string, isSuperAdmin = false) {
    const rows = await this.devlogRepo.find({
      where: { projectId },
      order: { createdAt: 'ASC' },
      relations: ['user'],
    });
    const lookouts = await this.lookoutService.findForDevlogs(
      rows.map((d) => d.id),
    );
    return rows.map((d) => ({
      id: d.id,
      projectId: d.projectId,
      userId: d.userId,
      userName: isSuperAdmin
        ? (d.user?.name ?? null)
        : (d.user?.nickname ?? d.user?.slackId ?? null),
      title: d.title,
      text: d.text,
      imageUrls: d.imageUrls ?? [],
      lookout: lookouts.get(d.id) ?? null,
      approved: d.approved,
      approvedHours: d.approvedHours,
      createdAt: d.createdAt,
    }));
  }

  async deleteOwn(userId: string, id: string) {
    const devlog = await this.devlogRepo.findOne({ where: { id } });
    if (!devlog) throw new NotFoundException('Devlog not found');
    if (devlog.userId !== userId) {
      throw new ForbiddenException('You can only delete your own devlogs');
    }
    await this.devlogRepo.delete({ id });
    await this.auditLogService.log(userId, 'devlog_deleted', `Deleted devlog ${id}`);
    return { ok: true };
  }

  /**
   * A reviewer approves (or un-approves) a devlog and sets its hours. Devlog
   * hours are treated exactly like normal project hours, but this only RECORDS
   * them on the devlog — it deliberately does NOT touch `project.overrideHours`
   * or mint pipes. Pipes are minted solely at fraud review by a Fraud Reviewer
   * or Super Admin, where the reconcile folds approved devlog hours into the
   * payout base (see FraudReviewService.completeApproval / AuditService). This
   * keeps the pipe-minting gate in one fraud-gated place and avoids a reviewer
   * side-channel into the balance.
   *
   * The devlog row is locked FOR UPDATE so two concurrent reviews of the same
   * devlog can't race on its approved state.
   */
  async reviewDevlog(
    devlogId: string,
    reviewerId: string,
    dto: { approved: boolean; approvedHours: number | null },
  ) {
    return this.dataSource.transaction(async (manager) => {
      const devlog = await manager.findOne(Devlog, {
        where: { id: devlogId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!devlog) throw new BadRequestException('Devlog not found');
      if (!devlog.projectId) throw new BadRequestException('Devlog is not linked to a project');

      const hours =
        dto.approved && typeof dto.approvedHours === 'number' && dto.approvedHours >= 0
          ? Math.round(Math.min(dto.approvedHours, 1000) * 10) / 10
          : 0;

      devlog.approved = dto.approved;
      devlog.approvedHours = dto.approved ? hours : null;
      devlog.approvedByReviewerId = reviewerId;
      devlog.approvedAt = new Date();
      await manager.save(Devlog, devlog);

      await this.auditLogService.log(
        reviewerId,
        'devlog_reviewed',
        `${dto.approved ? 'Approved' : 'Unapproved'} devlog "${devlog.title}" (${dto.approved ? hours : 0}h) on project ${devlog.projectId} — pipes mint at fraud review`,
      );
      return { id: devlog.id, approved: devlog.approved, approvedHours: devlog.approvedHours };
    });
  }
  
  async approvedHoursForProject(projectId: string): Promise<number> {
  const { sum } = await this.devlogRepo
    .createQueryBuilder('d')
    .select('COALESCE(SUM(d.approved_hours), 0)', 'sum')
    .where('d.project_id = :projectId', { projectId })
    .andWhere('d.approved = true')
    .getRawOne<{ sum: string }>() ?? { sum: '0' };
  return Math.round(parseFloat(sum) * 10) / 10;
  } 
  

  /* ---------------------------------------------------------------- */
  /*  Validation helpers                                               */
  /* ---------------------------------------------------------------- */

  /**
   * Strips characters that could be used for HTML / SQL / script injection.
   * Devlogs preserve newlines (unlike single-line project fields).
   */
  private sanitize(raw: string): string {
    return String(raw)
      .replace(/[<>"`\\]/g, '') // strip injection-relevant chars (keep & and ' for prose — Svelte escapes on render)
      .replace(/\0/g, '') // strip null bytes
      .replace(/\r\n/g, '\n')
      .trim();
  }

  private requireText(value: unknown): string {
    if (!value || typeof value !== 'string') {
      throw new BadRequestException('text is required');
    }
    const clean = this.sanitize(value).slice(0, MAX_TEXT_LEN);
    if (clean.length === 0) {
      throw new BadRequestException('text is required');
    }
    return clean;
  }

  private requireTitle(value: unknown): string {
    if (!value || typeof value !== 'string') {
      throw new BadRequestException('title is required');
    }
    // Titles are single-line — collapse any newlines that snuck in.
    const oneLine = String(value).replace(/[\r\n]+/g, ' ');
    const clean = this.sanitize(oneLine).slice(0, MAX_TITLE_LEN);
    if (clean.length === 0) {
      throw new BadRequestException('title is required');
    }
    return clean;
  }

  /**
   * Required: returns the project id if it exists and is owned by the user.
   * Throws BadRequest if missing, malformed, or not owned by the user.
   */
  private async requireProjectId(
    projectId: string | null | undefined,
    userId: string,
  ): Promise<{ id: string; name: string }> {
    if (!projectId || typeof projectId !== 'string') {
      throw new BadRequestException('projectId is required');
    }
    const trimmed = projectId.trim();
    if (trimmed.length === 0) {
      throw new BadRequestException('projectId is required');
    }

  // UUID format check
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      trimmed,
      )
    ) {
      throw new BadRequestException('projectId is not a valid id');
    }

    const project = await this.projectRepo.findOne({
      where: { id: trimmed, userId },
      select: ['id', 'name'],
    });
    if (!project) {
      throw new BadRequestException('projectId not found or not yours');
    }
    return { id: project.id, name: project.name };
  }


  private validateImages(
    images: string[] | undefined,
  ): { mime: string; buffer: Buffer }[] {
    if (!images || !Array.isArray(images)) return [];

    const items = images.slice(0, MAX_IMAGES_PER_DEVLOG);
    const results: { mime: string; buffer: Buffer }[] = [];

    for (let i = 0; i < items.length; i++) {
      const raw = items[i];
      if (!raw || typeof raw !== 'string') continue;

      const match = raw.match(
        /^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/,
      );
      if (!match) {
        throw new BadRequestException(
          `Image ${i + 1} must be a PNG, JPEG, GIF, or WebP image`,
        );
      }

      const declaredMime = match[1];
      const b64Data = match[2];

      const buffer = Buffer.from(b64Data, 'base64');

      const sig = IMAGE_SIGNATURES.find((s) => s.mime === declaredMime);
      if (!sig || !b64Data.startsWith(sig.b64Prefix)) {
        throw new BadRequestException(
          `Image ${i + 1} content does not match its declared type (${declaredMime})`,
        );
      }

      // 8 MB hard cap per image
      if (buffer.length > 8 * 1024 * 1024) {
        throw new BadRequestException(
          `Image ${i + 1} is too large (max 8 MB)`,
        );
      }

      results.push({ mime: declaredMime, buffer });
    }

    return results;
  }

  private async uploadImages(
    items: { mime: string; buffer: Buffer }[],
  ): Promise<string[]> {
    const urls: string[] = [];
    for (let i = 0; i < items.length; i++) {
      const { mime, buffer } = items[i];
      const ext = MIME_EXTENSIONS[mime] ?? 'bin';
      const filename = `devlog-${Date.now()}-${i + 1}.${ext}`;
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
        this.logger.error(`CDN upload network error for image ${i + 1}: ${err}`);
        throw new BadRequestException(
          `Image upload failed — the CDN is unreachable. Try again without images.`,
        );
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.error(`CDN upload failed (${res.status}): ${text}`);
        throw new BadRequestException(
          `Failed to upload image ${i + 1}. Please try again.`,
        );
      }

      const data = await res.json().catch(() => null);
      if (!data?.url) {
        this.logger.error(`CDN upload returned no URL for image ${i + 1}`);
        throw new BadRequestException(
          `Failed to upload image ${i + 1}. Please try again.`,
        );
      }
      urls.push(data.url as string);
    }
    return urls;
  }

  private toPublic(d: Devlog, lookout: LookoutSessionDTO | null = null) {
    return {
      id: d.id,
      projectId: d.projectId,
      title: d.title,
      text: d.text,
      imageUrls: d.imageUrls ?? [],
      lookout,
      createdAt: d.createdAt,
    };
  }
}
