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
import { RsvpService } from '../rsvp/rsvp.service';
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
    private readonly rsvpService: RsvpService,
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
      perms,
      projects,
      activeSessions: sessions,
      auditLogs,
    };
  }

  async banUser(userId: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // 1. Update Airtable perms to Banned
    await this.rsvpService.updatePerms(user.email, 'Banned');

    // 2. Revoke all sessions for this user
    await this.sessionRepo.delete({ userId });
  }

  async updatePerms(userId: string, perms: string): Promise<void> {
    if (!VALID_PERMS.includes(perms as any)) {
      throw new BadRequestException(
        `Invalid perms value. Must be one of: ${VALID_PERMS.join(', ')}`,
      );
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    await this.rsvpService.updatePerms(user.email, perms);
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

  async setProjectStatus(projectId: string, status: string): Promise<void> {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');
    project.status = status;
    await this.projectRepo.save(project);
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
      const res = await fetchWithTimeout(
        `https://api.airtable.com/v0/${this.unifiedBaseId}/Approved%20Projects?${params}`,
        {
          headers: { Authorization: `Bearer ${this.unifiedApiKey}` },
        },
      );
      if (!res.ok) {
        return { duplicate: false, error: true };
      }
      const data = await res.json();
      const records: any[] = data?.records ?? [];
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
}
