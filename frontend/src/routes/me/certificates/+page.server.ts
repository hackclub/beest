import type { PageServerLoad } from './$types';
import { proxyWithRefresh } from '$lib/server/auth';
import { env } from '$env/dynamic/private';

const BACKEND_URL = env.BACKEND_URL ?? 'http://localhost:3001';

export const load: PageServerLoad = async ({ cookies, fetch }) => {
  const response = await proxyWithRefresh(
    cookies,
    `${BACKEND_URL}/api/certificates/`,
    { method: 'GET' }
  );

  if (!response.ok) {
    return { certificates: [] };
  }

  const certificates = await response.json();
  return { certificates };
};
