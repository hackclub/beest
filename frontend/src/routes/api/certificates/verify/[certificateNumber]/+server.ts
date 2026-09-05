import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const BACKEND_URL = env.BACKEND_URL ?? 'http://localhost:3001';

export const GET: RequestHandler = async ({ params, fetch }) => {
  const certificateNumber = params.certificateNumber?.trim();
  if (!certificateNumber) {
    return new Response(JSON.stringify({ error: 'Certificate number is required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  let response: Response;
  try {
    response = await fetch(
      `${BACKEND_URL}/api/certificates/verify/${encodeURIComponent(certificateNumber)}`,
    );
  } catch {
    return new Response(JSON.stringify({ error: 'Certificate verification is temporarily unavailable' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  }

  const body = await response.text();
  return new Response(body, {
    status: response.status,
    headers: {
      'content-type': response.headers.get('content-type') ?? 'application/json',
    },
  });
};
