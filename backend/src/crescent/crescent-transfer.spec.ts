import { createHmac } from 'crypto';
import {
  CRESCENT_TRANSFER_TTL_SECONDS,
  crescentTransferClaims,
  crescentTransferUrl,
  signCrescentTransfer,
} from './crescent-transfer';

const project = {
  id: '0b7e5c1e-0000-4000-8000-000000000001',
  name: 'Strandbeest walker',
  description: 'A little walking machine.',
  codeUrl: 'https://github.com/someone/walker',
  demoUrl: null,
  screenshot1Url: 'https://cdn.hackclub.com/walker.png',
  hackatimeProjectName: ['walker'],
  status: 'approved',
  overrideHours: 12.5,
  pipesGranted: 60,
  createdAt: new Date('2026-05-01T12:00:00Z'),
};
const now = new Date('2026-10-10T12:00:00Z');

describe('crescent transfer', () => {
  it('describes the project and runs out after the TTL', () => {
    const claims = crescentTransferClaims(project, 'ident!abc', now);
    expect(claims).toMatchObject({ v: 1, iss: 'beest', sub: 'ident!abc' });
    expect(claims.exp - claims.iat).toBe(CRESCENT_TRANSFER_TTL_SECONDS);
    expect(claims.project).toEqual({
      id: project.id,
      name: 'Strandbeest walker',
      description: 'A little walking machine.',
      codeUrl: 'https://github.com/someone/walker',
      demoUrl: null,
      screenshotUrl: 'https://cdn.hackclub.com/walker.png',
      hackatimeProjects: ['walker'],
      status: 'approved',
      approvedHours: 12.5,
      createdAt: '2026-05-01T12:00:00.000Z',
    });
  });

  it('counts no approved hours where no pipes were granted', () => {
    expect(
      crescentTransferClaims({ ...project, pipesGranted: 0 }, 'ident!abc', now)
        .project.approvedHours,
    ).toBe(0);
  });

  it('signs the base64url payload the way Crescent checks it', () => {
    const token = signCrescentTransfer(
      crescentTransferClaims(project, 'ident!abc', now),
      'secret',
    );
    const [body, signature] = token.split('.');
    expect(signature).toBe(
      createHmac('sha256', 'secret').update(body).digest('base64url'),
    );
    expect(body).not.toMatch(/[=+/]/);
    expect(
      (JSON.parse(Buffer.from(body, 'base64url').toString()) as { sub: string })
        .sub,
    ).toBe('ident!abc');
  });

  it('points at Crescent with the token escaped', () => {
    expect(crescentTransferUrl('a.b', 'https://crescent.hackclub.com/')).toBe(
      'https://crescent.hackclub.com/import/beest?token=a.b',
    );
  });
});
