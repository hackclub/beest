import { env } from '$env/dynamic/private';
import { tryRefreshToken } from '$lib/server/auth';
import type { RequestHandler } from './$types';

const BACKEND_URL = env.BACKEND_URL ?? 'http://localhost:3001';
const actions = new Set(['view', 'download', 'thumbnail']);

// Certificate files are HTML, PDF, or PNG. This proxy deliberately streams
// them instead of using the JSON-only application API helper.
export const GET: RequestHandler = async ({ cookies, params }) => {
  if (!actions.has(params.action)) return new Response('Not found', { status: 404 });

  let token = cookies.get('auth_token') ?? await tryRefreshToken(cookies);
  if (!token) return new Response(JSON.stringify({ error: 'Not authenticated' }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  });

  const url = `${BACKEND_URL}/api/certificates/${encodeURIComponent(params.id)}/${params.action}`;
  let response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (response.status === 401 && (token = await tryRefreshToken(cookies))) {
    response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  }

  const headers = new Headers();
  for (const header of ['content-type', 'content-disposition', 'cache-control']) {
    const value = response.headers.get(header);
    if (value) headers.set(header, value);
  }
  return new Response(response.body, { status: response.status, headers });
};
