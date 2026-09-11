import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { In, IsNull, LessThan, Repository } from "typeorm";
import { fetchWithTimeout } from "src/fetch.util";
import { LookoutSession } from "src/entities/lookout-session.entity";

export type CreatedSession = {
    token: string;
    sessionId: string;
    sessionUrl: string;
};

export type LookoutSessionDTO = {
    id: string;
    name: string | null;
    status: string;
    trackedSeconds: number | null;
    screenshotCount: number | null;
    videoUrl: string | null;
    thumbnailUrl: string | null;
    createdAt: string | null;
};

@Injectable()
export class LookoutService {
    private readonly logger = new Logger(LookoutService.name);
    private readonly baseUrl: string;
    private readonly apiKey: string | undefined;

    constructor(
        private readonly config: ConfigService,
        @InjectRepository(LookoutSession)
        private readonly sessionRepo: Repository<LookoutSession>,
    ) {
        this.baseUrl = (
            this.config.get<string>('LOOKOUT_BASE_URL') ?? 'https://lookout.hackclub.com'
        ).replace(/\/$/, '');
        this.apiKey = this.config.get<string>('LOOKOUT_API_KEY')?.trim() || undefined;
        if (!this.apiKey) {
            this.logger.warn('LOOKOUT_API_KEY not set - Lookout integration disabled');
        }
    }

    get configured(): boolean {
        return !!this.apiKey;
    }

    async createSession(userId: string, projectId: string): Promise<CreatedSession | null> {
        if (!this.configured) return null;
        try{
            const res = await fetchWithTimeout(`${this.baseUrl}/api/internal/sessions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': this.apiKey!,
                    Accept: 'application/json',
                },
                body: JSON.stringify({ metadata: {userId, projectId } }),
            });
            if (!res.ok) {
                this.logger.warn(`Lookout createSession failed: ${res.status}`);
                return null;
            }
            const body = await res.json().catch(() => null);
            const token = typeof body?.token === 'string' ? body.token: null;
            const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : null;
            const sessionUrl = typeof body?.sessionUrl === 'string' ? body.sessionUrl : null;
            if (!token || !sessionId || !sessionUrl){
                this.logger.warn('Lookout createSession returned malformed body');
                return null;
            }
            return { token, sessionId, sessionUrl};
        } catch (err) {
            this.logger.warn(`Lookout createSession error ${err}`);
            return null;
        }
    }

    private async getSessionInfo(
        row: LookoutSession,
    ): Promise<LookoutSessionDTO | null> {
        if (!this.configured) return null;
        try{
            const res = await fetchWithTimeout(
                `${this.baseUrl}/api/internal/sessions/${encodeURIComponent(row.lookoutSessionId)}`,
                {
                    headers: { 'X-API-Key': this.apiKey!, Accept: 'application/json' },
                },
            );
            if (!res.ok){
                this.logger.warn(`Lookout getSession failed: ${res.status}`);
                return null;
            }
            const body = await res.json().catch(() => null);
            const s = body?.session ?? body ?? null;
            if (!s) return null;

            const num = (v: unknown): number | null =>
                typeof v === 'number' && Number.isFinite(v) ? v:null;
            const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

            // The internal endpoint always returns videoUrl/thumbnailUrl as null
            // (signed media is only surfaced on the public/token endpoints). Use
            // the permanent media redirects instead — stable, embeddable URLs
            // keyed by sessionId. video.mp4 only resolves once status is complete.
            const status = str(s.status) ?? 'unknown';
            const sessionId = encodeURIComponent(row.lookoutSessionId);
            const mediaUrl = (file: string) => `${this.baseUrl}/api/media/${sessionId}/${file}`;

            return {
                id: row.id,
                // Lookout returns `name`; title/label are defensive fallbacks.
                name: str(s.name) ?? str(s.title) ?? str(s.label) ?? null,
                status,
                trackedSeconds: num(body?.trackedSeconds) ?? num(s.trackedSeconds),
                screenshotCount: num(body?.screenshotCount) ?? num(s.screenshotCount),
                videoUrl: status === 'complete' ? mediaUrl('video.mp4') : null,
                thumbnailUrl: mediaUrl('thumbnail.jpg'),
                createdAt: str(s.createdAt) ?? row.createdAt?.toISOString() ?? null,
            };
        } catch (err) {
            this.logger.warn(`Lookout getSession error ${err}`);
            return null;
        }
    }

    async pruneStaleUnattached(maxAgems = 7 * 24 * 60 * 60 * 1000): Promise<number> {
        const cutoff = new Date(Date.now() - maxAgems);
        const res = await this.sessionRepo.delete({
            devlogId: IsNull(),
            createdAt: LessThan(cutoff),
        });
        return res.affected ?? 0;
    }


    async listForReview(rows: LookoutSession[]): Promise<LookoutSessionDTO[]> {
        if (!this.configured || rows.length === 0) return [];
        const results = await Promise.all(rows.map((r) => this.getSessionInfo(r)));
        return results.filter((r): r is LookoutSessionDTO => r !== null);
    }

    /**
     * Persist a freshly created session row owned by `userId` against `projectId`.
     * Returned id lets the devlog form attach it on submit.
     */
    async saveSession(
        userId: string,
        projectId: string,
        created: CreatedSession,
    ): Promise<LookoutSession> {
        return this.sessionRepo.save(
            this.sessionRepo.create({
                projectId,
                userId,
                lookoutSessionId: created.sessionId,
                token: created.token,
            }),
        );
    }

    /** The user's not-yet-attached sessions for a project (devlog-form picker). */
    async listUnattached(
        projectId: string,
        userId: string,
    ): Promise<LookoutSessionDTO[]> {
        void this.pruneStaleUnattached().catch(() => {});
        const rows = await this.sessionRepo.find({
            where: { projectId, userId, devlogId: IsNull() },
            order: { createdAt: 'DESC' },
        });
        return this.listForReview(rows);
    }

    /**
     * All Lookout sessions for a project (reviewer dashboard), newest first,
     * enriched with live status/tracked time. Returns the sessions plus the
     * total tracked seconds across *complete* sessions only — pending/processing
     * report no verifiable time, so they contribute 0.
     */
    async listForProjectReview(
        projectId: string,
    ): Promise<{ sessions: LookoutSessionDTO[]; totalTrackedSeconds: number; completeCount: number }> {
        const rows = await this.sessionRepo.find({
            where: { projectId },
            order: { createdAt: 'DESC' },
        });
        const sessions = await this.listForReview(rows);
        const complete = sessions.filter((s) => s.status === 'complete');
        const totalTrackedSeconds = complete.reduce(
            (sum, s) => sum + (s.trackedSeconds ?? 0),
            0,
        );
        return { sessions, totalTrackedSeconds, completeCount: complete.length };
    }

    /**
     * Link an unattached session to a devlog (one session per devlog). Verifies
     * ownership and that the session belongs to the same project and is free.
     */
    async attachToDevlog(
        sessionId: string,
        userId: string,
        projectId: string,
        devlogId: string,
    ): Promise<void> {
        const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
        if (!session || session.userId !== userId || session.projectId !== projectId) {
            throw new BadRequestException('Timelapse session not found');
        }
        if (session.devlogId) {
            throw new BadRequestException('Timelapse is already attached to a devlog');
        }
        session.devlogId = devlogId;
        await this.sessionRepo.save(session);
    }

    /**
     * Downloads a completed session's video from Lookout and re-uploads it to
     * cdn.hackclub.com, the same host devlog screenshots use, so the review
     * text keeps working after Lookout prunes the session or rotates its
     * signed media URLs. Idempotent — returns the existing cdn_url if already
     * mirrored; returns null if the session isn't complete yet or the mirror
     * fails (never throws, this is a best-effort export helper).
     */
    async mirrorSessionToCdn(sessionRowId: string): Promise<string | null> {
        const row = await this.sessionRepo.findOne({ where: { id: sessionRowId } });
        if (!row) return null;
        if (row.cdnUrl) return row.cdnUrl;
        if (!this.configured) return null;

        const cdnApiKey = this.config.get<string>('CDN_API_KEY');
        if (!cdnApiKey) {
            this.logger.warn('CDN_API_KEY not set - cannot mirror Lookout video');
            return null;
        }

        const info = await this.getSessionInfo(row);
        if (!info || !info.videoUrl) return null;

        let videoRes: Response;
        try {
            videoRes = await fetchWithTimeout(info.videoUrl, {
                headers: { 'X-API-Key': this.apiKey! },
                timeoutMs: 60_000,
            });
        } catch (err) {
            this.logger.warn(`Lookout video download error: ${err}`);
            return null;
        }
        if (!videoRes.ok) {
            this.logger.warn(`Lookout video download failed: ${videoRes.status}`);
            return null;
        }
        const buffer = Buffer.from(await videoRes.arrayBuffer());

        const blob = new Blob([new Uint8Array(buffer)], { type: 'video/mp4' });
        const formData = new FormData();
        formData.append('file', blob, `lookout-${row.lookoutSessionId}.mp4`);

        let uploadRes: Response;
        try {
            uploadRes = await fetchWithTimeout('https://cdn.hackclub.com/api/v4/upload', {
                method: 'POST',
                headers: { Authorization: `Bearer ${cdnApiKey}` },
                body: formData,
                timeoutMs: 60_000,
            });
        } catch (err) {
            this.logger.warn(`CDN upload error for lookout session ${row.id}: ${err}`);
            return null;
        }
        if (!uploadRes.ok) {
            this.logger.warn(`CDN upload failed for lookout session ${row.id}: ${uploadRes.status}`);
            return null;
        }
        const data = await uploadRes.json().catch(() => null);
        const cdnUrl = typeof data?.url === 'string' ? data.url : null;
        if (!cdnUrl) return null;

        row.cdnUrl = cdnUrl;
        await this.sessionRepo.save(row);
        return cdnUrl;
    }

    /**
     * Resolve the attached session for each devlog id. Devlogs without a session
     * never hit the Lookout API. Keyed by `devlogId`.
     */
    async findForDevlogs(
        devlogIds: string[],
    ): Promise<Map<string, LookoutSessionDTO>> {
        const out = new Map<string, LookoutSessionDTO>();
        if (!this.configured || devlogIds.length === 0) return out;
        const rows = await this.sessionRepo.find({
            where: { devlogId: In(devlogIds) },
        });
        await Promise.all(
            rows.map(async (row) => {
                const dto = await this.getSessionInfo(row);
                if (dto && row.devlogId) out.set(row.devlogId, dto);
            }),
        );
        return out;
    }
}