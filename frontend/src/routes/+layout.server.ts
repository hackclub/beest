import { getAuthenticatedUser, proxyWithRefresh } from '$lib/server/auth';
import { env } from '$env/dynamic/private';
import type { LayoutServerLoad } from './$types';

const BACKEND_URL = env.BACKEND_URL ?? 'http://localhost:3001';

export const load: LayoutServerLoad = async ({ cookies }) => {
  const user = await getAuthenticatedUser(cookies);
  if (!user) {
    return {};
  }

  await proxyWithRefresh(cookies, `${BACKEND_URL}/api/certificates/sync`, {
    method: 'POST'
  });

  return { user };
};
