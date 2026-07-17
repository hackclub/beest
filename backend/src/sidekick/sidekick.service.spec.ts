import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SidekickController } from './sidekick.controller';
import { SidekickService } from './sidekick.service';

type Stub = Record<string, jest.Mock>;

const repo = (): Stub => ({
  findOne: jest.fn(),
  find: jest.fn().mockResolvedValue([]),
  count: jest.fn().mockResolvedValue(0),
  save: jest.fn(async (x) => x),
  create: jest.fn((x) => x),
  createQueryBuilder: jest.fn(),
});

const buildService = () => {
  const projectRepo = repo();
  const submissionRepo = repo();
  const reviewRepo = repo();
  const commentRepo = repo();
  const userRepo = repo();
  const orderRepo = repo();
  const shopRepo = repo();
  const fulfillmentRepo = repo();
  const adminService = {
    reviewProject: jest.fn().mockResolvedValue({ success: true }),
    getJustificationFacts: jest
      .fn()
      .mockResolvedValue({ trackedHours: null, unifiedFirstSubmission: false }),
  };
  const auditService = { decide: jest.fn().mockResolvedValue({ success: true }) };
  const shopService = {
    fulfillOrder: jest.fn().mockResolvedValue({ success: true }),
    refundOrder: jest.fn().mockResolvedValue({ success: true }),
    sendFulfillmentMessage: jest.fn().mockResolvedValue({ success: true }),
  };
  const hcaService = { getIdentity: jest.fn() };
  const auditLogService = { log: jest.fn() };
  const hackatimeService = {
    getHoursForProjects: jest.fn().mockResolvedValue({ hours: 0, perProject: {} }),
  };

  const service = new SidekickService(
    projectRepo as never,
    submissionRepo as never,
    reviewRepo as never,
    commentRepo as never,
    userRepo as never,
    orderRepo as never,
    shopRepo as never,
    fulfillmentRepo as never,
    adminService as never,
    auditService as never,
    shopService as never,
    hcaService as never,
    auditLogService as never,
    hackatimeService as never,
  );

  return {
    service,
    projectRepo,
    submissionRepo,
    reviewRepo,
    userRepo,
    orderRepo,
    adminService,
    auditService,
    shopService,
    auditLogService,
    hackatimeService,
  };
};

const reviewer = { id: 'rev-uuid', slackId: 'U999', hcaSub: 'ident!rev' };

/** Wires the common approve/authorize fixtures: reviewer, ship, project. */
const wireReviewFixtures = (
  s: ReturnType<typeof buildService>,
  {
    projectStatus = 'unreviewed',
    openSubmissionId = 'sub-1',
    projectHours = 0,
    submissionHours = null as number | null,
  } = {},
) => {
  const ship = {
    id: 'sub-1',
    projectId: 'proj-1',
    status: 'unreviewed',
    overrideHours: submissionHours,
  };
  s.userRepo.findOne.mockResolvedValue(reviewer);
  s.submissionRepo.findOne.mockImplementation(async ({ where }: any) =>
    where.id ? ship : { ...ship, id: openSubmissionId },
  );
  s.projectRepo.findOne.mockResolvedValue({
    id: 'proj-1',
    status: projectStatus,
    overrideHours: projectHours,
    user: { slackId: 'U1', hcaSub: 'ident!author' },
  });
};

describe('SidekickService.submitReviewAction', () => {
  it('rejects reviewers without a Beest account', async () => {
    const s = buildService();
    s.userRepo.findOne.mockResolvedValue(null);
    await expect(
      s.service.submitReviewAction({
        shipId: 'sub-1',
        reviewerId: 'U404',
        action: 'comment',
        commentText: 'hi',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('404s on unknown ships', async () => {
    const s = buildService();
    s.userRepo.findOne.mockResolvedValue(reviewer);
    s.submissionRepo.findOne.mockResolvedValue(null);
    await expect(
      s.service.submitReviewAction({
        shipId: 'nope',
        reviewerId: 'U999',
        action: 'comment',
        commentText: 'hi',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects approving a stale ship (not the open submission)', async () => {
    const s = buildService();
    wireReviewFixtures(s, { openSubmissionId: 'sub-2' });
    await expect(
      s.service.submitReviewAction({
        shipId: 'sub-1',
        reviewerId: 'U999',
        action: 'approve',
        hoursAssigned: 5,
        feedbackMessage: 'nice',
        justification: 'checked',
        isHq: false,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(s.adminService.reviewProject).not.toHaveBeenCalled();
  });

  it('community approve calls reviewProject and stays pending_hq (no decide)', async () => {
    const s = buildService();
    wireReviewFixtures(s);
    const result = await s.service.submitReviewAction({
      shipId: 'sub-1',
      reviewerId: 'U999',
      action: 'approve',
      hoursAssigned: 5,
      feedbackMessage: 'nice',
      justification: 'checked commits',
      isHq: false,
      fields: { hide_reviewer_name: true },
    });
    // No rewarded override → the author is rewarded the assigned hours:
    // overrideHours (pipes) and internalHours (Airtable) both get 5. The
    // justification is composed server-side (header + reviewer text + sign-off).
    expect(s.adminService.reviewProject).toHaveBeenCalledWith(
      'proj-1',
      'rev-uuid',
      'approved',
      'nice',
      null,
      undefined,
      true,
      expect.stringContaining('checked commits'),
      5,
      5,
      null, // no mark_golden field → leave the golden flag unchanged
    );
    expect(s.auditService.decide).not.toHaveBeenCalled();
    expect(result.event.type).toBe('approval');
  });

  it('approve passes mark_golden through to reviewProject', async () => {
    const s = buildService();
    wireReviewFixtures(s);
    await s.service.submitReviewAction({
      shipId: 'sub-1',
      reviewerId: 'U999',
      action: 'approve',
      hoursAssigned: 5,
      feedbackMessage: 'nice',
      justification: 'checked commits',
      isHq: false,
      fields: { mark_golden: true },
    });
    expect(s.adminService.reviewProject).toHaveBeenCalledWith(
      'proj-1',
      'rev-uuid',
      'approved',
      'nice',
      null,
      undefined,
      false,
      expect.stringContaining('checked commits'),
      5,
      5,
      true,
    );
  });

  it('approve splits rewardedHoursOverride (pipes) from hoursAssigned (Airtable)', async () => {
    const s = buildService();
    wireReviewFixtures(s);
    const result = await s.service.submitReviewAction({
      shipId: 'sub-1',
      reviewerId: 'U999',
      action: 'approve',
      hoursAssigned: 5,
      rewardedHoursOverride: 8,
      feedbackMessage: 'nice',
      justification: 'checked commits',
      isHq: false,
    });
    expect(s.adminService.reviewProject).toHaveBeenCalledWith(
      'proj-1',
      'rev-uuid',
      'approved',
      'nice',
      null,
      undefined,
      false,
      expect.stringContaining('checked commits'),
      8, // overrideHours — what the author is rewarded (pipes)
      5, // internalHours — canonical Unified YSWS DB value
      null,
    );
    expect(result.event).toMatchObject({ hoursAssigned: 5, rewardedHoursOverride: 8 });
  });

  it('wraps Sidekick justifications in the auto-generated header and sign-off', async () => {
    const s = buildService();
    wireReviewFixtures(s);
    s.userRepo.findOne.mockResolvedValue({ ...reviewer, name: 'Orpheus' });
    s.projectRepo.findOne.mockResolvedValue({
      id: 'proj-1',
      status: 'unreviewed',
      overrideHours: 50,
      codeUrl: 'https://github.com/x/y',
      hackatimeProjectName: ['cx'],
      isUpdate: false,
      user: { slackId: 'U1', hcaSub: 'ident!author' },
    });
    s.adminService.getJustificationFacts.mockResolvedValue({
      trackedHours: 75.7,
      unifiedFirstSubmission: true,
    });
    await s.service.submitReviewAction({
      shipId: 'sub-1',
      reviewerId: 'U999',
      action: 'approve',
      hoursAssigned: 25.7,
      feedbackMessage: 'nice',
      justification: 'checked commits',
      isHq: false,
    });
    const justification = s.adminService.reviewProject.mock.calls[0][7] as string;
    expect(justification).toContain('the user tracked 75.7 hours on the project through hackatime');
    expect(justification).toContain('Hackatime projects: cx');
    expect(justification).toContain(
      "Previously approved: 50h — this ship's delta: 25.7h (project total after: 75.7h)",
    );
    expect(justification).toContain('first submission of this code URL to unified');
    expect(justification).toContain('checked commits');
    expect(justification).toContain('signed off by Orpheus via Sidekick');
  });

  it('composes a minimal justification when the lookups come back empty', async () => {
    const s = buildService();
    wireReviewFixtures(s);
    await s.service.submitReviewAction({
      shipId: 'sub-1',
      reviewerId: 'U999',
      action: 'approve',
      hoursAssigned: 5,
      feedbackMessage: 'nice',
      justification: 'checked commits',
      isHq: false,
    });
    const justification = s.adminService.reviewProject.mock.calls[0][7] as string;
    // No Hackatime data, no prior approvals, no unified check → just the
    // reviewer's text and the sign-off.
    expect(justification).toBe('checked commits\n\nsigned off by unknown via Sidekick');
  });

  it('rejects a non-positive rewardedHoursOverride', async () => {
    const s = buildService();
    wireReviewFixtures(s);
    await expect(
      s.service.submitReviewAction({
        shipId: 'sub-1',
        reviewerId: 'U999',
        action: 'approve',
        hoursAssigned: 5,
        rewardedHoursOverride: 0,
        feedbackMessage: 'nice',
        justification: 'checked commits',
        isHq: false,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(s.adminService.reviewProject).not.toHaveBeenCalled();
  });

  it('HQ approve authorizes immediately via the audit stage', async () => {
    const s = buildService();
    wireReviewFixtures(s);
    await s.service.submitReviewAction({
      shipId: 'sub-1',
      reviewerId: 'U999',
      action: 'approve',
      hoursAssigned: 5,
      feedbackMessage: 'nice',
      justification: 'checked commits',
      isHq: true,
    });
    expect(s.adminService.reviewProject).toHaveBeenCalled();
    expect(s.auditService.decide).toHaveBeenCalledWith(
      'proj-1',
      'rev-uuid',
      expect.objectContaining({ action: 'approve', isSuperAdmin: true }),
    );
    // The decide justification must clear AuditService's 50-char floor. Only
    // the authorization note is sent — the audit stage appends it to the
    // composed first-pass justification already stored on the review row.
    const dto = s.auditService.decide.mock.calls[0][2];
    expect(dto.justification.length).toBeGreaterThanOrEqual(50);
    expect(dto.justification).toBe(
      'HQ direct approval via Sidekick — first pass and authorization by the same HQ reviewer.',
    );
  });

  it('hard_reject maps to the terminal rejected status', async () => {
    const s = buildService();
    wireReviewFixtures(s);
    await s.service.submitReviewAction({
      shipId: 'sub-1',
      reviewerId: 'U999',
      action: 'reject',
      feedbackMessage: 'no demo',
      isHq: false,
      fields: { hard_reject: true },
    });
    expect(s.adminService.reviewProject).toHaveBeenCalledWith(
      'proj-1',
      'rev-uuid',
      'rejected',
      'no demo',
      null,
      undefined,
      false,
      null,
      null,
      null,
    );
  });

  it('authorize requires a pending_hq ship', async () => {
    const s = buildService();
    wireReviewFixtures(s, { projectStatus: 'unreviewed' });
    await expect(
      s.service.submitReviewAction({ shipId: 'sub-1', reviewerId: 'U999', action: 'authorize' }),
    ).rejects.toThrow(BadRequestException);
    expect(s.auditService.decide).not.toHaveBeenCalled();
  });

  it('authorize converts per-ship hours to the cumulative audit total', async () => {
    const s = buildService();
    // Prior approved hours 6 = project 10 minus this ship's delta 4; the
    // authorizer overrides the ship to 5h → final cumulative 11. Legacy rows
    // without internalHours fall back to the rewarded values for both totals.
    wireReviewFixtures(s, { projectStatus: 'fraud_pending', projectHours: 10, submissionHours: 4 });
    await s.service.submitReviewAction({
      shipId: 'sub-1',
      reviewerId: 'U999',
      action: 'authorize',
      hoursAssigned: 5,
      justification: 'Spot-checked the commit history against Hackatime logs.',
    });
    expect(s.auditService.decide).toHaveBeenCalledWith(
      'proj-1',
      'rev-uuid',
      expect.objectContaining({ action: 'approve', overrideHours: 11, internalHours: 11 }),
    );
  });

  it('authorize carries the rewarded override into the pipes total only', async () => {
    const s = buildService();
    wireReviewFixtures(s, { projectStatus: 'fraud_pending', projectHours: 10, submissionHours: 4 });
    await s.service.submitReviewAction({
      shipId: 'sub-1',
      reviewerId: 'U999',
      action: 'authorize',
      hoursAssigned: 5,
      rewardedHoursOverride: 8,
      justification: 'Spot-checked the commit history against Hackatime logs.',
    });
    expect(s.auditService.decide).toHaveBeenCalledWith(
      'proj-1',
      'rev-uuid',
      expect.objectContaining({
        action: 'approve',
        overrideHours: 14, // prior 6 + rewarded 8
        internalHours: 11, // prior 6 + assigned 5
      }),
    );
  });

  it('deauthorize returns the project for re-review', async () => {
    const s = buildService();
    wireReviewFixtures(s, { projectStatus: 'fraud_pending' });
    await s.service.submitReviewAction({
      shipId: 'sub-1',
      reviewerId: 'U999',
      action: 'deauthorize',
      message: 'Hours look inflated.',
    });
    expect(s.auditService.decide).toHaveBeenCalledWith(
      'proj-1',
      'rev-uuid',
      expect.objectContaining({ action: 'rereview', reviewerFeedback: 'Hours look inflated.' }),
    );
  });
});

describe('SidekickService.fetchProjectTimeline', () => {
  it('maps returned first-pass approvals to discarded_approval events attributed to the returner', async () => {
    const s = buildService();
    s.projectRepo.findOne.mockResolvedValue({
      id: 'proj-1',
      status: 'unreviewed',
      hackatimeProjectName: [],
      user: { slackId: 'U1', hcaSub: 'ident!author' },
    });
    s.submissionRepo.find.mockResolvedValue([
      {
        id: 'sub-1',
        projectId: 'proj-1',
        status: 'unreviewed',
        overrideHours: 8,
        internalHours: 6,
        hoursSnapshot: 8,
        projectSnapshot: null,
        changeDescription: null,
        reviewerNote: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    s.reviewRepo.find.mockResolvedValue([
      {
        id: 'review-1',
        projectId: 'proj-1',
        submissionId: 'sub-1',
        status: 'returned',
        reviewer: { slackId: 'U999', hcaSub: 'ident!rev' },
        returnedBy: { slackId: 'UHQ', hcaSub: 'ident!hq' },
        feedback: 'Looks good!',
        internalNote: null,
        overrideJustification: 'Checked the hours.',
        hideReviewerName: false,
        createdAt: new Date('2026-01-02T00:00:00Z'),
      },
    ]);

    const { events } = await s.service.fetchProjectTimeline('proj-1');
    const discarded = events.find((e) => e.type === 'discarded_approval');
    expect(discarded).toMatchObject({
      id: 'ret:review-1',
      shipId: 'sub-1',
      actorId: 'U999',
      discardedByActorId: 'UHQ',
      hoursAssigned: 6,
      rewardedHoursOverride: 8,
      feedbackMessage: 'Looks good!',
      justification: 'Checked the hours.',
    });
  });
});

describe('SidekickService.updateReviewAction hour edits', () => {
  /** A single-ship project whose approval is parked in pending_hq. */
  const wireHourEditFixtures = (
    s: ReturnType<typeof buildService>,
    {
      projectStatus = 'fraud_pending',
      submissionStatus = 'unreviewed',
      overrideHours = 5,
      internalHours = 5 as number | null,
    } = {},
  ) => {
    const submission = {
      id: 'sub-1',
      projectId: 'proj-1',
      status: submissionStatus,
      overrideHours,
      internalHours,
    };
    const project = {
      id: 'proj-1',
      status: projectStatus,
      overrideHours,
      internalHours,
    };
    s.userRepo.findOne.mockResolvedValue(reviewer);
    s.reviewRepo.findOne.mockResolvedValue({ id: 'review-1', feedback: 'old' });
    s.submissionRepo.findOne.mockResolvedValue(submission);
    s.projectRepo.findOne.mockResolvedValue(project);
    return { submission, project };
  };

  const edit = (s: ReturnType<typeof buildService>, hoursAssigned?: number) =>
    s.service.updateReviewAction({
      shipId: 'sub-1',
      reviewerId: 'U999',
      type: 'approval',
      feedbackMessage: 'updated',
      justification: 'updated reasoning',
      hoursAssigned,
    });

  it('applies hour edits to a pending_hq approval (deltas and totals)', async () => {
    const s = buildService();
    const { submission, project } = wireHourEditFixtures(s);
    await edit(s, 7);
    expect(submission).toMatchObject({ overrideHours: 7, internalHours: 7 });
    expect(project).toMatchObject({ overrideHours: 7, internalHours: 7 });
    expect(s.projectRepo.save).toHaveBeenCalledWith(project);
    expect(s.submissionRepo.save).toHaveBeenCalledWith(submission);
  });

  it('keeps an explicit rewarded override while updating assigned hours', async () => {
    const s = buildService();
    const { submission, project } = wireHourEditFixtures(s, {
      overrideHours: 8, // rewarded (pipes) override from the first pass
      internalHours: 5, // assigned (Airtable) hours
    });
    await edit(s, 6);
    expect(submission).toMatchObject({ overrideHours: 8, internalHours: 6 });
    expect(project).toMatchObject({ overrideHours: 8, internalHours: 6 });
  });

  it('rejects hour edits once the approval is finalized', async () => {
    const s = buildService();
    wireHourEditFixtures(s, { projectStatus: 'approved', submissionStatus: 'approved' });
    await expect(edit(s, 7)).rejects.toThrow(BadRequestException);
    expect(s.projectRepo.save).not.toHaveBeenCalled();
    expect(s.reviewRepo.save).not.toHaveBeenCalled();
  });

  it('tolerates unchanged hours on finalized approvals (text-only edit)', async () => {
    const s = buildService();
    wireHourEditFixtures(s, { projectStatus: 'approved', submissionStatus: 'approved' });
    await expect(edit(s, 5)).resolves.toEqual({ success: true });
    expect(s.projectRepo.save).not.toHaveBeenCalled();
  });

  it('still saves text-only edits without touching hours', async () => {
    const s = buildService();
    wireHourEditFixtures(s);
    await edit(s, undefined);
    expect(s.projectRepo.save).not.toHaveBeenCalled();
    expect(s.submissionRepo.save).not.toHaveBeenCalled();
    expect(s.reviewRepo.save).toHaveBeenCalled();
  });
});

describe('SidekickService user notes', () => {
  it('fetchUserNote returns the stored note', async () => {
    const s = buildService();
    s.userRepo.findOne.mockResolvedValue({ id: 'u-1', reviewerUserNote: 'watch hours' });
    await expect(s.service.fetchUserNote({ userId: 'U1' })).resolves.toEqual({
      note: 'watch hours',
    });
  });

  it('fetchUserNote reads unknown users as "no note", not an error', async () => {
    const s = buildService();
    s.userRepo.findOne.mockResolvedValue(null);
    await expect(s.service.fetchUserNote({ userId: 'U404' })).resolves.toEqual({ note: null });
  });

  it('updateUserNote trims, saves and audit-logs the note', async () => {
    const s = buildService();
    const target = { id: 'u-1', name: 'Alice', reviewerUserNote: null as string | null };
    s.userRepo.findOne.mockImplementation(async ({ where }: any) =>
      where.some((w: any) => w.slackId === 'U1') ? target : reviewer,
    );
    await s.service.updateUserNote({ userId: 'U1', note: '  hi  ', editorId: 'U999' });
    expect(s.userRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u-1', reviewerUserNote: 'hi' }),
    );
    expect(s.auditLogService.log).toHaveBeenCalledWith(
      'u-1',
      'sidekick_user_note_change',
      expect.stringContaining('updated'),
    );
  });

  it('updateUserNote clears the note on null or blank input', async () => {
    const s = buildService();
    const target = { id: 'u-1', name: 'Alice', reviewerUserNote: 'old' as string | null };
    s.userRepo.findOne.mockImplementation(async ({ where }: any) =>
      where.some((w: any) => w.slackId === 'U1') ? target : reviewer,
    );
    await s.service.updateUserNote({ userId: 'U1', note: '   ', editorId: 'U999' });
    expect(s.userRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u-1', reviewerUserNote: null }),
    );
    expect(s.auditLogService.log).toHaveBeenCalledWith(
      'u-1',
      'sidekick_user_note_change',
      expect.stringContaining('cleared'),
    );
  });

  it('updateUserNote 404s on unknown users', async () => {
    const s = buildService();
    s.userRepo.findOne.mockResolvedValue(null);
    await expect(
      s.service.updateUserNote({ userId: 'U404', note: 'x', editorId: 'U999' }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('SidekickService.updateOrderStatus', () => {
  it('refuses to move orders back to pending', async () => {
    const s = buildService();
    await expect(
      s.service.updateOrderStatus({ orderId: 'order-1', newStatus: 'pending' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('cancelled routes through the soft-cancel refund', async () => {
    const s = buildService();
    await s.service.updateOrderStatus({ orderId: 'order-1', newStatus: 'cancelled' });
    expect(s.shopService.refundOrder).toHaveBeenCalledWith('order-1');
  });

  it('fulfilled persists the reference before fulfilling', async () => {
    const s = buildService();
    s.orderRepo.findOne.mockResolvedValue({ id: 'order-1', user: {} });
    await s.service.updateOrderStatus({
      orderId: 'order-1',
      newStatus: 'fulfilled',
      reference: 'USPS-1',
    });
    expect(s.orderRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ reference: 'USPS-1' }),
    );
    expect(s.shopService.fulfillOrder).toHaveBeenCalledWith('order-1');
  });
});

describe('SidekickController', () => {
  const controller = () => new SidekickController({ healthCheck: () => ({ ok: true }) } as never);

  it('rejects unknown actions with INVALID_ACTION', async () => {
    await expect(controller().handle({ action: 'EXPLODE', input: {} })).rejects.toMatchObject({
      response: { error: 'INVALID_ACTION' },
    });
  });

  it('rejects bodies without a string action', async () => {
    await expect(controller().handle({ input: {} })).rejects.toThrow(BadRequestException);
    await expect(controller().handle('nope')).rejects.toThrow(BadRequestException);
  });

  it('defaults input to an empty object', async () => {
    await expect(controller().handle({ action: 'HEALTH_CHECK' })).resolves.toEqual({ ok: true });
  });
});
