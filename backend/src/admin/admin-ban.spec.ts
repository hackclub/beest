import { AdminService } from './admin.service';

// banUser must silently hard-reject a banned user's queued projects, and must
// discard the pending (not-yet-paid-out) first-pass approval of a
// 'fraud_pending' project — otherwise the stale overrideHours starve the
// Hackatime cap check if the ban is undone ("Cannot approve Xh of new work —
// Hackatime shows only Yh...").

function build(overrides: {
  projects: any[];
  submission?: any;
  review?: any;
  getPerms?: jest.Mock;
}) {
  const saved: { projects: any[]; reviews: any[] } = {
    projects: [],
    reviews: [],
  };
  const submissionUpdates: any[] = [];

  const service = new AdminService(
    { get: jest.fn() } as any, // configService
    {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'user-1', email: 'u@x.com', name: 'U' }),
    } as any, // userRepo
    { delete: jest.fn() } as any, // sessionRepo
    {
      // Honors the where.userId filter so the sweep (all queued projects) and
      // rejectQueuedProjects (one user's projects) see the right subsets.
      find: jest
        .fn()
        .mockImplementation((opts: { where?: { userId?: string } }) =>
          Promise.resolve(
            overrides.projects.filter(
              (p: { userId?: string }) =>
                !opts?.where?.userId || p.userId === opts.where.userId,
            ),
          ),
        ),
      save: jest.fn().mockImplementation((p: object) => {
        saved.projects.push({ ...p });
        return Promise.resolve(p);
      }),
      update: jest.fn(),
    } as any, // projectRepo
    {} as any, // auditLogRepo
    {} as any, // newsRepo
    {
      findOne: jest.fn().mockResolvedValue(overrides.review ?? null),
      save: jest.fn().mockImplementation((r: object) => {
        saved.reviews.push({ ...r });
        return Promise.resolve(r);
      }),
    } as any, // reviewRepo
    {} as any, // shopRepo
    { find: jest.fn().mockResolvedValue([]) } as any, // orderRepo
    {
      findOne: jest.fn().mockResolvedValue(overrides.submission ?? null),
      update: jest.fn().mockImplementation((where: object, set: object) => {
        submissionUpdates.push({ where, set });
        return Promise.resolve();
      }),
    } as any, // submissionRepo
    {} as any, // eventRepo
    {
      updatePerms: jest.fn(),
      getPerms: overrides.getPerms ?? jest.fn(),
    } as any, // rsvpService
    { log: jest.fn() } as any, // auditLogService
    {} as any, // hcaService
    {} as any, // airtableSync
    {} as any, // slackService
    {} as any, // slackNotify
    { refundOrder: jest.fn() } as any, // shopService
    { isResubmissionPaused: jest.fn().mockResolvedValue(false) } as any, // settingsService
  );

  return { service, saved, submissionUpdates };
}

describe('AdminService.banUser queued-project sweep', () => {
  it('hard-rejects and reverts the pending approval delta of a fraud_pending project', async () => {
    const { service, saved } = build({
      projects: [
        {
          id: 'p1',
          userId: 'user-1',
          status: 'fraud_pending',
          overrideHours: 3.4,
          internalHours: 4.4,
          pipesGranted: 0,
          isGolden: true,
        },
      ],
      submission: {
        id: 's1',
        status: 'unreviewed',
        overrideHours: 3.4,
        internalHours: 4.4,
      },
      review: {
        id: 'r1',
        submissionId: 's1',
        status: 'approved',
        returnedById: null,
      },
    });

    await service.banUser('user-1', 'admin-1');

    expect(saved.projects).toHaveLength(1);
    expect(saved.projects[0]).toMatchObject({
      id: 'p1',
      status: 'rejected',
      overrideHours: 0,
      internalHours: 0,
      isGolden: false,
    });
    // The pending first-pass approval is invalidated, not left as a live
    // approval, and attributed to the banning admin.
    expect(saved.reviews).toHaveLength(1);
    expect(saved.reviews[0]).toMatchObject({
      id: 'r1',
      status: 'returned',
      returnedById: 'admin-1',
    });
  });

  it('preserves the standing prior approval under a pending reship delta', async () => {
    // Prior approval paid out 3.0h (pipes granted); the pending reship added
    // 2.0h on top. Discarding the pending approval must return the project to
    // its 3.0h baseline, not zero.
    const { service, saved } = build({
      projects: [
        {
          id: 'p1',
          userId: 'user-1',
          status: 'fraud_pending',
          overrideHours: 5,
          internalHours: 5,
          pipesGranted: 3,
          isGolden: false,
        },
      ],
      submission: {
        id: 's2',
        status: 'unreviewed',
        overrideHours: 2,
        internalHours: 2,
      },
      review: {
        id: 'r2',
        submissionId: 's2',
        status: 'approved',
        returnedById: null,
      },
    });

    await service.banUser('user-1', 'admin-1');

    expect(saved.projects[0]).toMatchObject({
      status: 'rejected',
      overrideHours: 3,
      internalHours: 3,
    });
  });

  it('leaves the hours of an unreviewed project untouched', async () => {
    // An 'unreviewed' resubmission on top of a paid-out approval keeps its
    // cumulative hours — only the status changes.
    const { service, saved } = build({
      projects: [
        {
          id: 'p1',
          userId: 'user-1',
          status: 'unreviewed',
          overrideHours: 6,
          internalHours: 6,
          pipesGranted: 6,
          isGolden: true,
        },
      ],
    });

    await service.banUser('user-1', 'admin-1');

    expect(saved.projects[0]).toMatchObject({
      status: 'rejected',
      overrideHours: 6,
      internalHours: 6,
      isGolden: true,
    });
    expect(saved.reviews).toHaveLength(0);
  });
});

// The hourly/boot sweep catches bans applied directly in Airtable (which never
// go through banUser) and backfills users banned before the sweep existed.
describe('AdminService.sweepBannedUsersQueuedProjects', () => {
  const prevEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = prevEnv;
  });

  it('rejects queued projects of banned owners only', async () => {
    process.env.NODE_ENV = 'production';
    const { service, saved } = build({
      projects: [
        {
          id: 'p1',
          userId: 'user-1',
          status: 'unreviewed',
          user: { id: 'user-1', email: 'banned@x.com', name: 'B' },
        },
        {
          id: 'p2',
          userId: 'user-2',
          status: 'unreviewed',
          user: { id: 'user-2', email: 'ok@x.com', name: 'O' },
        },
      ],
      getPerms: jest
        .fn()
        .mockImplementation((email: string) =>
          Promise.resolve(email === 'banned@x.com' ? 'Banned' : 'User'),
        ),
    });

    await service.sweepBannedUsersQueuedProjects();

    expect(saved.projects.map((p: { id: string }) => p.id)).toEqual(['p1']);
    expect(saved.projects[0]).toMatchObject({ status: 'rejected' });
  });

  it('never rejects when the Airtable perms lookup fails', async () => {
    process.env.NODE_ENV = 'production';
    const { service, saved } = build({
      projects: [
        {
          id: 'p1',
          userId: 'user-1',
          status: 'unreviewed',
          user: { id: 'user-1', email: 'x@x.com', name: 'X' },
        },
      ],
      getPerms: jest.fn().mockRejectedValue(new Error('airtable down')),
    });

    await service.sweepBannedUsersQueuedProjects();

    expect(saved.projects).toHaveLength(0);
  });
});
