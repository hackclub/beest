import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';

const BACKEND_URL = env.BACKEND_URL ?? 'http://localhost:3001';

export const load: PageServerLoad = async ({ cookies }) => {
	const token = cookies.get('auth_token');
	if (!token) return { authenticated: false };

	try {
		const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
			headers: { Authorization: `Bearer ${token}` }
		});
		if (res.ok) {
			const user = await res.json();
			return { authenticated: true, userName: user.name ?? user.nickname ?? null };
		}
	} catch {
		// backend unreachable — treat as unauthenticated
	}

	cookies.delete('auth_token', { path: '/' });
	return { authenticated: false };
};
