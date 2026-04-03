import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const BACKEND_URL = env.BACKEND_URL ?? 'http://localhost:3001';

export const GET: RequestHandler = async ({ cookies }) => {
	const refreshToken = cookies.get('refresh_token');

	// Invalidate the session in the DB
	if (refreshToken) {
		await fetch(`${BACKEND_URL}/api/auth/logout`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ refreshToken })
		});
	}

	// Clear both auth cookies
	cookies.delete('auth_token', { path: '/' });
	cookies.delete('refresh_token', { path: '/' });

	redirect(302, '/');
};
