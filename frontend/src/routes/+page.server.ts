import { getAuthenticatedUser } from '$lib/server/auth';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	const user = await getAuthenticatedUser(cookies);
	if (!user) return { authenticated: false };
	return { authenticated: true, userName: user.name ?? user.nickname ?? null };
};
