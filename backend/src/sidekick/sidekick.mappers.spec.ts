import { BadRequestException } from '@nestjs/common';
import { Order } from '../entities/order.entity';
import { Project } from '../entities/project.entity';
import { Submission } from '../entities/submission.entity';
import { User } from '../entities/user.entity';
import {
  actorIdFor,
  decodeCursor,
  diffSnapshots,
  encodeCursor,
  hoursForSubmission,
  mapShipStatus,
  shipDisplayFields,
  toSidekickOrder,
  toSidekickProject,
} from './sidekick.mappers';

const user = (over: Partial<User> = {}): User =>
  ({ slackId: 'U123', hcaSub: 'ident!abc', name: 'Alice Smith', ...over }) as User;

const submission = (over: Partial<Submission> = {}): Submission =>
  ({
    id: 'sub-1',
    projectId: 'proj-1',
    status: 'unreviewed',
    hoursSnapshot: null,
    overrideHours: null,
    projectSnapshot: null,
    changeDescription: null,
    reviewerNote: null,
    createdAt: new Date('2026-06-01T00:00:00Z'),
    ...over,
  }) as Submission;

describe('actorIdFor', () => {
  it('prefers the Slack ID', () => {
    expect(actorIdFor(user())).toBe('U123');
  });
  it('falls back to the HCA identity ID', () => {
    expect(actorIdFor(user({ slackId: null as never }))).toBe('ident!abc');
  });
  it('never returns empty', () => {
    expect(actorIdFor(null)).toBe('unknown');
  });
});

describe('mapShipStatus', () => {
  it.each([
    ['approved', 'approved', true, 'approved'],
    ['changes_needed', 'changes_needed', true, 'rejected'],
    ['rejected', 'rejected', true, 'rejected'],
    ['unreviewed', 'unreviewed', true, 'pending'],
    // Community-approved, parked in the audit queue → pending_hq…
    ['unreviewed', 'fraud_pending', true, 'pending_hq'],
    // …but only for the project's latest submission.
    ['unreviewed', 'fraud_pending', false, 'pending'],
  ] as const)('%s + project %s (latest=%s) → %s', (sub, proj, isLatest, expected) => {
    expect(mapShipStatus(sub, proj, isLatest)).toBe(expected);
  });
});

describe('hoursForSubmission', () => {
  it('prefers the ship-time snapshot', () => {
    expect(hoursForSubmission(submission({ hoursSnapshot: 12.5, overrideHours: 10 }))).toBe(12.5);
  });
  it('falls back to reviewer-assigned hours for legacy rows', () => {
    expect(hoursForSubmission(submission({ overrideHours: 10 }))).toBe(10);
  });
  it('defaults to 0', () => {
    expect(hoursForSubmission(submission())).toBe(0);
  });
});

describe('diffSnapshots', () => {
  const snap = (over = {}) => ({
    title: 'App',
    description: 'Desc',
    codeUrl: 'https://github.com/x/app',
    demoUrl: null,
    screenshotUrl: null,
    ...over,
  });

  it('returns only changed protocol fields with labels and diff types', () => {
    const changes = diffSnapshots(snap(), snap({ demoUrl: 'https://demo.app', title: 'App 2' }));
    expect(changes).toEqual([
      { field: 'title', label: 'Title', oldValue: 'App', newValue: 'App 2', diffType: 'text' },
      { field: 'demoUrl', label: 'Demo URL', oldValue: '', newValue: 'https://demo.app', diffType: 'url' },
    ]);
  });

  it('is empty when either snapshot is missing (legacy rows)', () => {
    expect(diffSnapshots(null, snap())).toEqual([]);
    expect(diffSnapshots(snap(), null)).toEqual([]);
  });

  it('is empty when nothing changed', () => {
    expect(diffSnapshots(snap(), snap())).toEqual([]);
  });
});

describe('shipDisplayFields', () => {
  it('exposes the change description publicly and the reviewer note internally', () => {
    const fields = shipDisplayFields(
      submission({ changeDescription: 'Added Redis', reviewerNote: 'Compare vs ship 1' }),
    );
    expect(fields).toEqual([
      { label: 'What changed', value: 'Added Redis' },
      { label: 'Note to reviewer', value: 'Compare vs ship 1', isInternal: true },
    ]);
  });
  it('is empty when the submitter wrote nothing', () => {
    expect(shipDisplayFields(submission())).toEqual([]);
  });
});

describe('toSidekickProject', () => {
  const project = (over: Partial<Project> = {}): Project =>
    ({
      id: 'proj-1',
      name: 'App',
      description: 'Desc',
      codeUrl: null,
      readmeUrl: null,
      demoUrl: null,
      screenshot1Url: null,
      status: 'unreviewed',
      projectType: 'web',
      aiUse: null,
      isUpdate: false,
      hackatimeProjectName: ['app'],
      user: user(),
      ...over,
    }) as Project;

  it('falls back through readme/demo for the required codeUrl', () => {
    expect(toSidekickProject(project(), []).codeUrl).toBe('');
    expect(toSidekickProject(project({ readmeUrl: 'https://r' }), []).codeUrl).toBe('https://r');
    expect(
      toSidekickProject(project({ codeUrl: 'https://c', readmeUrl: 'https://r' }), []).codeUrl,
    ).toBe('https://c');
  });

  it('marks only the latest pending ship as pending_hq and attaches review fields', () => {
    const ships = toSidekickProject(project({ status: 'fraud_pending' }), [
      submission({ id: 'old', status: 'approved' }),
      submission({ id: 'new', status: 'unreviewed' }),
    ]).ships;
    expect(ships.map((s) => s.status)).toEqual(['approved', 'pending_hq']);
    expect(ships[0].approveFields).toBeUndefined();
    expect(ships[0].supportsRewardedOverride).toBeUndefined();
    expect(ships[1].approveFields?.map((f) => f.name)).toContain('internal_note');
    expect(ships[1].rejectFields?.map((f) => f.name)).toContain('hard_reject');
    // Rewarded/internal hours are first-class in the protocol now — advertised
    // via the flag, not an internal_hours custom field.
    expect(ships[1].supportsRewardedOverride).toBe(true);
    expect(ships[1].approveFields?.map((f) => f.name)).not.toContain('internal_hours');
  });

  it('omits tags for a non-golden project by a non-golden author', () => {
    expect(toSidekickProject(project({ isGolden: false }), [], false).tags).toBeUndefined();
  });

  it('tags a golden project and a golden author independently', () => {
    const golden = toSidekickProject(project({ isGolden: true }), [], false).tags;
    expect(golden?.map((t) => t.label)).toEqual(['golden']);

    const goldenAuthor = toSidekickProject(project({ isGolden: false }), [], true).tags;
    expect(goldenAuthor?.map((t) => t.label)).toEqual(['golden author']);

    const both = toSidekickProject(project({ isGolden: true }), [], true).tags;
    expect(both?.map((t) => t.label)).toEqual(['golden', 'golden author']);
  });
});

describe('toSidekickOrder', () => {
  const order = (over: Partial<Order> = {}): Order =>
    ({
      id: 'order-1',
      userId: 'uuid-1',
      shopItemId: 'item-1',
      itemName: 'Raspberry Pi',
      quantity: 2,
      pipesSpent: 30,
      status: 'pending',
      reference: null,
      adminNotes: null,
      fulfillmentNotes: null,
      hcbCardGrantId: null,
      createdAt: new Date('2026-06-01T00:00:00Z'),
      updatedAt: new Date('2026-06-02T00:00:00Z'),
      user: user(),
      ...over,
    }) as Order;

  it('keeps deleted-item orders identifiable via metadata', () => {
    const mapped = toSidekickOrder(order({ shopItemId: null }), null);
    expect(mapped.itemId).toBe('');
    expect(mapped.metadata).toMatchObject({ itemName: 'Raspberry Pi' });
  });

  it('only reports fulfilledAt on fulfilled orders', () => {
    expect(toSidekickOrder(order(), null).fulfilledAt).toBeUndefined();
    expect(toSidekickOrder(order({ status: 'fulfilled' }), null).fulfilledAt).toBe(
      '2026-06-02T00:00:00.000Z',
    );
  });

  it('surfaces the latest fulfillment message as userNotes', () => {
    expect(toSidekickOrder(order(), 'On its way!').userNotes).toBe('On its way!');
  });
});

describe('cursors', () => {
  it('round-trips offset + filter echo', () => {
    const cursor = encodeCursor(50, 'projects:pending');
    expect(decodeCursor(cursor, 'projects:pending')).toBe(50);
  });

  it('rejects a cursor minted for different filters', () => {
    const cursor = encodeCursor(50, 'projects:pending');
    expect(() => decodeCursor(cursor, 'projects:approved')).toThrow(BadRequestException);
  });

  it('rejects malformed cursors', () => {
    expect(() => decodeCursor('not-a-cursor', 'x')).toThrow(BadRequestException);
    expect(() =>
      decodeCursor(Buffer.from('{"o":-1,"f":"x"}').toString('base64url'), 'x'),
    ).toThrow(BadRequestException);
  });
});
