import { createHmac } from 'crypto';
import type { Project } from '../entities/project.entity';

// "Move to Crescent": Beest hands a project to Crescent, another Hack Club
// YSWS program, as a signed snapshot in a link. Crescent checks the signature
// (its Beest::Transfer), lets the builder pick a card and makes the same
// project there, applied only to the Crescent account with the same Hack Club
// Auth id as `sub`. Nothing about pipes, reviews or orders goes along: it is
// the project's own fields, as if the builder had typed them in again.
//
// Token: `<payload>.<signature>`, both unpadded base64url; the signature is
// HMAC-SHA256 over the payload's base64url text with CRESCENT_TRANSFER_SECRET,
// the same value Crescent holds as BEEST_TRANSFER_SECRET. It rides in a query
// string, so it carries no email, name or address, and it runs out quickly.

export const CRESCENT_TRANSFER_TTL_SECONDS = 15 * 60;
export const DEFAULT_CRESCENT_URL = 'https://crescent.hackclub.com';

export type CrescentTransferClaims = {
  v: 1;
  iss: 'beest';
  sub: string;
  iat: number;
  exp: number;
  project: {
    id: string;
    name: string;
    description: string;
    codeUrl: string | null;
    demoUrl: string | null;
    screenshotUrl: string | null;
    hackatimeProjects: string[];
    status: string;
    approvedHours: number;
    createdAt: string;
  };
};

type TransferableProject = Pick<
  Project,
  | 'id'
  | 'name'
  | 'description'
  | 'codeUrl'
  | 'demoUrl'
  | 'screenshot1Url'
  | 'hackatimeProjectName'
  | 'status'
  | 'overrideHours'
  | 'pipesGranted'
  | 'createdAt'
>;

export function crescentTransferClaims(
  project: TransferableProject,
  hcaSub: string,
  now: Date = new Date(),
): CrescentTransferClaims {
  const iat = Math.floor(now.getTime() / 1000);
  return {
    v: 1,
    iss: 'beest',
    sub: hcaSub,
    iat,
    exp: iat + CRESCENT_TRANSFER_TTL_SECONDS,
    project: {
      id: project.id,
      name: project.name,
      description: project.description ?? '',
      codeUrl: project.codeUrl,
      demoUrl: project.demoUrl,
      screenshotUrl: project.screenshot1Url,
      hackatimeProjects: project.hackatimeProjectName ?? [],
      status: project.status,
      // Hours Beest credited pipes for (the same rule as the hours bar). Crescent
      // shows them to its reviewers only, so the same time is not paid twice.
      approvedHours:
        (project.pipesGranted ?? 0) > 0 ? (project.overrideHours ?? 0) : 0,
      createdAt: project.createdAt.toISOString(),
    },
  };
}

export function signCrescentTransfer(
  claims: CrescentTransferClaims,
  secret: string,
): string {
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = createHmac('sha256', secret)
    .update(body)
    .digest('base64url');
  return `${body}.${signature}`;
}

export function crescentTransferUrl(
  token: string,
  baseUrl: string = DEFAULT_CRESCENT_URL,
): string {
  return `${baseUrl.replace(/\/+$/, '')}/import/beest?token=${encodeURIComponent(token)}`;
}
