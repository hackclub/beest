import { getAuthenticatedUser } from '$lib/server/auth';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ cookies }) => {
  const user = await getAuthenticatedUser(cookies);
  if (!user) {
    return {};
  }

  return { user };
};
