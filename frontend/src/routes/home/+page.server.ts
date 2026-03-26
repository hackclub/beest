import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';

const BACKEND_URL = env.BACKEND_URL ?? 'http://localhost:3001';

export const load: PageServerLoad = async ({ cookies }) => {
	const token = cookies.get('auth_token');
	if (!token) redirect(302, '/');

	const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
		headers: { Authorization: `Bearer ${token}` }
	});

	if (!res.ok) {
		cookies.delete('auth_token', { path: '/' });
		redirect(302, '/');
	}

	return { user: await res.json() };
};
