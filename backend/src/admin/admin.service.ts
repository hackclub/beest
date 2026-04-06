import {
  Injectable,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { Session } from '../entities/session.entity';
import { Project } from '../entities/project.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { NewsItem } from '../entities/news-item.entity';
import { ProjectReview } from '../entities/project-review.entity';
import { ShopItem } from '../entities/shop-item.entity';
import { Order } from '../entities/order.entity';
import { RsvpService } from '../rsvp/rsvp.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { fetchWithTimeout } from '../fetch.util';

const VALID_PERMS = [
  'User',
  'Helper',
  'Reviewer',
  'Fraud Reviewer',
  'Super Admin',
  'Banned',
] as const;

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private readonly hackatimeBaseUrl: string;
  private readonly hackatimeAdminKey: string | undefined;
  private readonly unifiedApiKey: string | undefined;
  private readonly unifiedBaseId = 'app3A5kJwYqxMLOgh';

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
    @InjectRepository(Project) private readonly projectRepo: Repository<Project>,
    @InjectRepository(AuditLog) private readonly auditLogRepo: Repository<AuditLog>,
    @InjectRepository(NewsItem) private readonly newsRepo: Repository<NewsItem>,
    @InjectRepository(ProjectReview) private readonly reviewRepo: Repository<ProjectReview>,
    @InjectRepository(ShopItem) private readonly shopRepo: Repository<ShopItem>,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    private readonly rsvpService: RsvpService,
    private readonly auditLogService: AuditLogService,
  ) {
    this.hackatimeBaseUrl = this.configService.get(
      'HACKATIME_BASE_URL',
      'https://hackatime.hackclub.com',
    );
    this.hackatimeAdminKey = this.configService.get('HACKATIME_ADMIN_API_KEY');
    if (!this.hackatimeAdminKey) {
      this.logger.warn('HACKATIME_ADMIN_API_KEY not set — admin Hackatime lookups disabled');
    }
    this.unifiedApiKey = this.configService.get('UNIFIED_API_KEY');
  }

  async listUsers(): Promise<any[]> {
    const [users, permsMap] = await Promise.all([
      this.userRepo.find({ order: { createdAt: 'DESC' } }),
      this.rsvpService.getAllPerms(),
    ]);
    return users.map((u) => ({
      id: u.id,
      hcaSub: u.hcaSub,
      name: u.name,
      nickname: u.nickname,
      slackId: u.slackId,
      email: u.email,
      hackatimeConnected: !!u.hackatimeToken,
      perms: (u.email ? permsMap.get(u.email.toLowerCase()) : null) ?? null,
      createdAt: u.createdAt,
    }));
  }

  async getUser(userId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User not found');

    const projects = await this.projectRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      select: ['id', 'name', 'status', 'projectType', 'createdAt'],
    });

    const orders = await this.orderRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      select: ['id', 'itemName', 'quantity', 'pipesSpent', 'status', 'createdAt'],
    });

    const sessions = await this.sessionRepo.count({ where: { userId } });

    const auditLogs = await this.auditLogRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 50,
      select: ['id', 'action', 'label', 'createdAt'],
    });

    let perms: string | null = null;
    try {
      if (user.email) {
        perms = await this.rsvpService.getPerms(user.email);
      }
    } catch {
      // Airtable lookup failed — don't block the response
    }

    return {
      id: user.id,
      hcaSub: user.hcaSub,
      name: user.name,
      nickname: user.nickname,
      slackId: user.slackId,
      email: user.email,
      hackatimeConnected: !!user.hackatimeToken,
      twoEmails: user.twoEmails,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      pipes: user.pipes ?? 0,
      perms,
      projects,
      orders,
      activeSessions: sessions,
      auditLogs,
    };
  }

  async banUser(userId: string, adminId?: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // 1. Update Airtable perms to Banned
    await this.rsvpService.updatePerms(user.email, 'Banned');

    // 2. Revoke all sessions for this user
    await this.sessionRepo.delete({ userId });

    // 3. Audit log on the banned user's record
    const identifier = user.name || user.slackId || user.hcaSub;
    await this.auditLogService.log(userId, 'admin_ban', `Banned user ${identifier}`);

    // 4. Audit log on the admin's record
    if (adminId) {
      await this.auditLogService.log(adminId, 'admin_ban', `Banned user ${identifier}`);
    }
  }

  async banAndRejectProject(
    projectId: string,
    reviewerId: string,
    feedback: string | null,
    internalNote: string | null,
    overrideJustification: string | null,
  ) {
    const project = await this.projectRepo.findOne({
      where: { id: projectId },
      relations: ['user'],
    });
    if (!project) throw new NotFoundException('Project not found');

    // 1. Reject the project
    project.status = 'changes_needed';
    await this.projectRepo.save(project);

    // 2. Save review record
    const review = this.reviewRepo.create({
      projectId,
      reviewerId,
      status: 'ban',
      feedback: feedback || null,
      internalNote: internalNote || null,
      overrideJustification: overrideJustification || null,
    });
    await this.reviewRepo.save(review);

    // 3. Ban the user
    await this.banUser(project.userId);

    // 4. Audit logs
    await this.auditLogService.log(project.userId, 'project_reviewed', `Project "${project.name}" was rejected`);
    await this.auditLogService.log(project.userId, 'admin_ban', `Banned via project review of "${project.name}"`);

    return { success: true };
  }

  async updatePerms(userId: string, perms: string, adminId?: string): Promise<void> {
    if (!VALID_PERMS.includes(perms as any)) {
      throw new BadRequestException(
        `Invalid perms value. Must be one of: ${VALID_PERMS.join(', ')}`,
      );
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    await this.rsvpService.updatePerms(user.email, perms);

    const identifier = user.name || user.slackId || user.hcaSub;
    await this.auditLogService.log(userId, 'admin_perms_change', `Changed ${identifier} perms to ${perms}`);

    if (adminId) {
      await this.auditLogService.log(adminId, 'admin_perms_change', `Changed ${identifier} perms to ${perms}`);
    }
  }

  // ── Projects ──

  async listAllProjects() {
    const projects = await this.projectRepo.find({
      order: { createdAt: 'DESC' },
      relations: ['user'],
    });

    const statusCounts = {
      unshipped: 0,
      unreviewed: 0,
      changes_needed: 0,
      approved: 0,
    };

    const mapped = projects.map((p) => {
      if (p.status in statusCounts) {
        statusCounts[p.status as keyof typeof statusCounts]++;
      }
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        projectType: p.projectType,
        status: p.status,
        codeUrl: p.codeUrl,
        demoUrl: p.demoUrl,
        readmeUrl: p.readmeUrl,
        screenshot1Url: p.screenshot1Url,
        screenshot2Url: p.screenshot2Url,
        hackatimeProjectName: p.hackatimeProjectName,
        isUpdate: p.isUpdate,
        otherHcProgram: p.otherHcProgram,
        aiUse: p.aiUse,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        user: {
          id: p.user?.id,
          name: p.user?.name,
          slackId: p.user?.slackId,
        },
      };
    });

    return { statusCounts, projects: mapped };
  }

  async reviewProject(
    projectId: string,
    reviewerId: string,
    status: string,
    feedback: string | null,
    internalNote: string | null,
    overrideJustification: string | null,
    overrideHours: number | null,
    internalHours: number | null,
  ) {
    const project = await this.projectRepo.findOne({
      where: { id: projectId },
      relations: ['user'],
    });
    if (!project) throw new NotFoundException('Project not found');

    // 1. Update project status and hours
    project.status = status;
    if (overrideHours !== null && overrideHours !== undefined) {
      project.overrideHours = Math.round(overrideHours * 10) / 10;
    }
    if (internalHours !== null && internalHours !== undefined) {
      project.internalHours = Math.round(internalHours * 10) / 10;
    }
    await this.projectRepo.save(project);

    // 2. Grant pipes when approving (user-facing hours = overrideHours)
    //    Uses atomic increment to prevent race conditions.
    //    Only grants the delta if project was previously approved (re-approval case).
    if (status === 'approved' && project.overrideHours != null && project.overrideHours > 0) {
      const pipesToGrant = Math.floor(project.overrideHours);
      const previouslyGranted = project.pipesGranted ?? 0;
      const delta = pipesToGrant - previouslyGranted;
      if (delta > 0) {
        await this.userRepo.increment({ id: project.userId }, 'pipes', delta);
        project.pipesGranted = pipesToGrant;
        await this.projectRepo.save(project);
      }
    }

    // 3. Save the review record
    const review = this.reviewRepo.create({
      projectId,
      reviewerId,
      status,
      feedback: feedback || null,
      internalNote: internalNote || null,
      overrideJustification: overrideJustification || null,
    });
    await this.reviewRepo.save(review);

    // 4. Audit log to the project owner (not the reviewer)
    const label =
      status === 'approved'
        ? `Project "${project.name}" was approved`
        : `Project "${project.name}" received feedback`;
    await this.auditLogService.log(project.userId, 'project_reviewed', label);

    return { success: true };
  }

  async getProjectReviews(projectId: string, includeInternal: boolean) {
    const reviews = await this.reviewRepo.find({
      where: { projectId },
      order: { createdAt: 'DESC' },
      relations: ['reviewer'],
    });

    return reviews.map((r) => ({
      id: r.id,
      status: r.status,
      feedback: r.feedback,
      ...(includeInternal ? { internalNote: r.internalNote } : {}),
      overrideJustification: r.overrideJustification,
      reviewerName: r.reviewer?.name ?? null,
      createdAt: r.createdAt,
    }));
  }

  // ── Unified Airtable duplicate check ──

  /**
   * Checks the Unified Airtable "Approved Projects" table for a matching Code URL.
   *
   * Security constraints:
   * - This method is private — only callable within AdminService
   * - Only called from getProjectHackatime, which is behind SuperAdminGuard
   * - Only accepts HTTPS URLs (rejects anything else)
   * - The codeUrl is taken from the project's DB record, never from user input
   * - Returns only boolean match/error — no Airtable record data is ever exposed
   */
  private async checkUnifiedDuplicate(
    codeUrl: string,
  ): Promise<{ duplicate: boolean; error: boolean }> {
    if (!this.unifiedApiKey || !codeUrl) {
      return { duplicate: false, error: true };
    }

    // Only allow https:// URLs — reject anything that could be a formula injection
    try {
      const parsed = new URL(codeUrl);
      if (parsed.protocol !== 'https:') {
        return { duplicate: false, error: true };
      }
    } catch {
      return { duplicate: false, error: true };
    }

    // Escape for Airtable formula: double any backslashes, then escape single quotes
    const escaped = codeUrl.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const formula = `{Code URL} = '${escaped}'`;

    try {
      const params = new URLSearchParams({
        filterByFormula: formula,
        maxRecords: '1',
        'fields[]': 'Code URL',
      });
      const url = `https://api.airtable.com/v0/${this.unifiedBaseId}/Approved%20Projects?${params}`;
      this.logger.log(`Unified check: formula=${formula}`);
      const res = await fetchWithTimeout(url, {
        headers: { Authorization: `Bearer ${this.unifiedApiKey}` },
      });
      if (!res.ok) {
        const body = await res.text();
        this.logger.warn(`Unified check failed (${res.status}): ${body}`);
        return { duplicate: false, error: true };
      }
      const data = await res.json();
      const records: any[] = data?.records ?? [];
      this.logger.log(`Unified check: ${records.length} records found`);
      // Only expose match/no-match — never leak record contents
      return { duplicate: records.length > 0, error: false };
    } catch {
      return { duplicate: false, error: true };
    }
  }

  // ── Hackatime admin lookup ──

  private async hackatimeGet(path: string): Promise<Response> {
    return fetchWithTimeout(`${this.hackatimeBaseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.hackatimeAdminKey}` },
    });
  }

  private async hackatimePost(path: string, body: object): Promise<Response> {
    return fetchWithTimeout(`${this.hackatimeBaseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.hackatimeAdminKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }

  async getProjectHackatime(projectId: string) {
    if (!this.hackatimeAdminKey) {
      throw new BadRequestException('Hackatime admin API key not configured');
    }

    const project = await this.projectRepo.findOne({
      where: { id: projectId },
      relations: ['user'],
    });
    if (!project) throw new NotFoundException('Project not found');

    const hackatimeNames: string[] = project.hackatimeProjectName ?? [];
    const user = project.user;
    if (!user) {
      return { projectId, hackatimeProjects: [], totalHours: 0, trustLevel: null, unifiedDuplicate: false, unifiedError: true };
    }

    try {
      // 1. Resolve Hackatime user ID — prefer stored ID, fall back to email lookup
      let hackatimeUserId: string | number | null = user.hackatimeUserId ?? null;
      if (!hackatimeUserId && user.email) {
        const emailRes = await this.hackatimePost(
          '/api/admin/v1/user/get_user_by_email',
          { email: user.email },
        );
        if (!emailRes.ok) {
          return { projectId, hackatimeProjects: [], totalHours: 0, trustLevel: null, unifiedDuplicate: false, unifiedError: true };
        }
        const emailData = await emailRes.json();
        hackatimeUserId = emailData.user_id;
      }
      if (!hackatimeUserId) {
        return { projectId, hackatimeProjects: [], totalHours: 0, trustLevel: null, unifiedDuplicate: false, unifiedError: true };
      }

      // 2. Get user info (trust level), projects, and Unified duplicate check in parallel
      const [infoRes, projectsRes, unifiedResult] = await Promise.all([
        this.hackatimeGet(`/api/admin/v1/user/info?user_id=${hackatimeUserId}`),
        this.hackatimeGet(`/api/admin/v1/user/projects?user_id=${hackatimeUserId}`),
        this.checkUnifiedDuplicate(project.codeUrl ?? ''),
      ]);

      let trustLevel: string | null = null;
      if (infoRes.ok) {
        const infoData = await infoRes.json();
        trustLevel = infoData?.user?.trust_level ?? null;
      }

      let matched: { name: string; hours: number; languages: string[] }[] = [];
      if (projectsRes.ok) {
        const projData = await projectsRes.json();
        const allProjects: {
          name: string;
          total_duration: number;
          languages: string[];
        }[] = projData?.projects ?? [];

        if (hackatimeNames.length > 0) {
          const nameSet = new Set(hackatimeNames);
          matched = allProjects
            .filter((p) => nameSet.has(p.name))
            .map((p) => ({
              name: p.name,
              hours: Math.round((p.total_duration / 3600) * 10) / 10,
              languages: p.languages ?? [],
            }));
        }
      }

      const totalHours = Math.round(
        matched.reduce((sum, p) => sum + p.hours, 0) * 10,
      ) / 10;

      return { projectId, hackatimeProjects: matched, totalHours, trustLevel, unifiedDuplicate: unifiedResult.duplicate, unifiedError: unifiedResult.error };
    } catch (err) {
      this.logger.error(`Hackatime admin lookup error for project ${projectId}: ${err}`);
      return { projectId, hackatimeProjects: [], totalHours: 0, trustLevel: null, unifiedDuplicate: false, unifiedError: true };
    }
  }

  // ── News CRUD ──

  async listNews(): Promise<NewsItem[]> {
    return this.newsRepo.find({ order: { displayDate: 'DESC', createdAt: 'DESC' } });
  }

  async createNews(text: string, displayDate: string): Promise<NewsItem> {
    const item = this.newsRepo.create({ text, displayDate });
    return this.newsRepo.save(item);
  }

  async updateNews(id: string, data: { text?: string; displayDate?: string }): Promise<NewsItem> {
    const item = await this.newsRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('News item not found');
    if (data.text !== undefined) item.text = data.text;
    if (data.displayDate !== undefined) item.displayDate = data.displayDate;
    return this.newsRepo.save(item);
  }

  async deleteNews(id: string): Promise<void> {
    const item = await this.newsRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('News item not found');
    await this.newsRepo.remove(item);
  }

  // ── Shop CRUD ──

  async listShopItems(): Promise<ShopItem[]> {
    return this.shopRepo.find({ order: { sortOrder: 'ASC' } });
  }

  async createShopItem(data: {
    name: string;
    description: string;
    imageUrl: string;
    priceHours: number;
    stock?: number | null;
    estimatedShip?: string | null;
    isActive?: boolean;
  }): Promise<ShopItem> {
    const maxOrder = await this.shopRepo
      .createQueryBuilder('s')
      .select('MAX(s.sortOrder)', 'max')
      .getRawOne();
    const sortOrder = (maxOrder?.max ?? -1) + 1;

    const item = this.shopRepo.create({
      name: data.name,
      description: data.description,
      imageUrl: data.imageUrl,
      priceHours: data.priceHours,
      stock: data.stock ?? null,
      estimatedShip: data.estimatedShip ?? null,
      isActive: data.isActive ?? true,
      sortOrder,
    });
    return this.shopRepo.save(item);
  }

  async updateShopItem(id: string, data: {
    name?: string;
    description?: string;
    imageUrl?: string;
    priceHours?: number;
    stock?: number | null;
    estimatedShip?: string | null;
    isActive?: boolean;
  }): Promise<ShopItem> {
    const item = await this.shopRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Shop item not found');
    if (data.name !== undefined) item.name = data.name;
    if (data.description !== undefined) item.description = data.description;
    if (data.imageUrl !== undefined) item.imageUrl = data.imageUrl;
    if (data.priceHours !== undefined) item.priceHours = data.priceHours;
    if (data.stock !== undefined) item.stock = data.stock;
    if (data.estimatedShip !== undefined) item.estimatedShip = data.estimatedShip;
    if (data.isActive !== undefined) item.isActive = data.isActive;
    return this.shopRepo.save(item);
  }

  async deleteShopItem(id: string): Promise<void> {
    const item = await this.shopRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Shop item not found');
    await this.shopRepo.remove(item);
  }

  async reorderShopItems(items: { id: string; sortOrder: number }[]): Promise<void> {
    await Promise.all(
      items.map((i) => this.shopRepo.update(i.id, { sortOrder: i.sortOrder })),
    );
  }
}
