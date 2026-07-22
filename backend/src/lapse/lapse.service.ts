import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetchWithTimeout } from '../fetch.util';

export type TimelapseDTO = {
  id: string;
  name: string;
  playbackUrl: string;
  thumbnailUrl: string | null;
  duration: number | null;
  createdAt: number | null;
  hackatimeProject: string | null;
  visibility: string | null;
};

type RawLapseUser = { id?: unknown } | null | undefined;

type RawTimelapse = {
  id?: unknown;
  name?: unknown;
  playbackUrl?: unknown;
  thumbnailUrl?: unknown;
  duration?: unknown;
  createdAt?: unknown;
  visibility?: unknown;
  private?: { hackatimeProject?: unknown } | null;
  hackatimeProject?: unknown;
};

@Injectable()
export class LapseService {
  private readonly logger = new Logger(LapseService.name);
  private readonly baseUrl: string;
  private readonly programKey: string | undefined;

  // 60s cache of (email → lapseUserId|null) so the audit queue's per-row fetch
  // doesn't slam /api/user/queryByEmail. Timelapse lists themselves aren't
  // cached — playbackUrl may be a rotating signed URL.
  private readonly userIdCache = new Map<string, { id: string | null; expiresAt: number }>();
  private readonly USER_ID_CACHE_TTL = 60 * 1000;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = (this.config.get<string>('LAPSE_BASE_URL') ?? 'https://lapse.hackclub.com').replace(/\/$/, '');
    this.programKey = this.config.get<string>('LAPSE_PROGRAM_KEY')?.trim() || undefined;
    if (!this.programKey) {
      this.logger.warn('LAPSE_PROGRAM_KEY not set — Lapse integration disabled');
    }
  }

  private get configured(): boolean {
    return !!this.programKey;
  }

  /**
   * Public watch-page URL for a timelapse. Use this in durable text (audit
   * justifications, DMs) — `playbackUrl` may be a rotating signed URL.
   */
  timelapsePageUrl(id: string): string {
    return `${this.baseUrl}/timelapse/${encodeURIComponent(id)}`;
  }

  /**
   * Returns Lapse timelapses for a beest user (by email) whose
   * `hackatimeProject` matches any of the project's linked Hackatime names.
   * Returns `[]` for all failure modes (no key, network, 4xx, malformed) so
   * a Lapse outage cannot block a review.
   */
  async findForProject(
    email: string,
    hackatimeProjectNames: string[],
  ): Promise<TimelapseDTO[]> {
    if (!this.configured) return [];
    if (!email) return [];
    if (!hackatimeProjectNames.length) return [];

    const lapseUserId = await this.queryByEmail(email);
    if (!lapseUserId) return [];

    const raw = await this.findByUser(lapseUserId);
    if (!raw.length) return [];

    const nameSet = new Set(hackatimeProjectNames.filter((n) => typeof n === 'string' && n.length > 0));

    const mapped: TimelapseDTO[] = [];
    for (const t of raw) {
      const id = typeof t.id === 'string' ? t.id : null;
      const playbackUrl = typeof t.playbackUrl === 'string' ? t.playbackUrl : null;
      if (!id || !playbackUrl) continue;

      // Program-key calls return private fields inlined. Be tolerant of either shape.
      const htProject =
        (t.private && typeof t.private.hackatimeProject === 'string' ? t.private.hackatimeProject : null) ??
        (typeof t.hackatimeProject === 'string' ? t.hackatimeProject : null);
      if (!htProject || !nameSet.has(htProject)) continue;

      mapped.push({
        id,
        name: typeof t.name === 'string' ? t.name : '',
        playbackUrl,
        thumbnailUrl: typeof t.thumbnailUrl === 'string' ? t.thumbnailUrl : null,
        duration: typeof t.duration === 'number' && Number.isFinite(t.duration) ? t.duration : null,
        createdAt: typeof t.createdAt === 'number' && Number.isFinite(t.createdAt) ? t.createdAt : null,
        hackatimeProject: htProject,
        visibility: typeof t.visibility === 'string' ? t.visibility : null,
      });
    }

    mapped.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    return mapped;
  }

  private async queryByEmail(email: string): Promise<string | null> {
    const cached = this.userIdCache.get(email);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.id;

    const url = `${this.baseUrl}/api/user/queryByEmail?email=${encodeURIComponent(email)}`;
    let id: string | null = null;
    try {
      const res = await fetchWithTimeout(url, {
        headers: {
          Authorization: `Bearer ${this.programKey}`,
          Accept: 'application/json',
        },
      });
      if (res.status === 404) {
        // intentional miss — cache the null
      } else if (!res.ok) {
        this.logger.warn(`Lapse queryByEmail failed: ${res.status}`);
        return null; // don't cache transient failures
      } else {
        const body = await res.json().catch(() => null);
        const u: RawLapseUser = body?.data?.user ?? body?.user ?? body?.data ?? null;
        const rawId = u?.id;
        if (typeof rawId === 'string') id = rawId;
        else if (typeof rawId === 'number') id = String(rawId);
      }
    } catch (err) {
      this.logger.warn(`Lapse queryByEmail error: ${err}`);
      return null;
    }

    this.userIdCache.set(email, { id, expiresAt: now + this.USER_ID_CACHE_TTL });
    return id;
  }

  private async findByUser(lapseUserId: string): Promise<RawTimelapse[]> {
    const url = `${this.baseUrl}/api/timelapse/findByUser?user=${encodeURIComponent(lapseUserId)}`;
    try {
      const res = await fetchWithTimeout(url, {
        headers: {
          Authorization: `Bearer ${this.programKey}`,
          Accept: 'application/json',
        },
      });
      if (!res.ok) {
        this.logger.warn(`Lapse findByUser failed: ${res.status}`);
        return [];
      }
      const body = await res.json().catch(() => null);
      const list = body?.data?.timelapses ?? body?.timelapses ?? body?.data ?? null;
      if (!Array.isArray(list)) return [];
      return list as RawTimelapse[];
    } catch (err) {
      this.logger.warn(`Lapse findByUser error: ${err}`);
      return [];
    }
  }
}
