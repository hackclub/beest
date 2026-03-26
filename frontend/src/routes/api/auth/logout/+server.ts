import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const BACKEND_URL = env.BACKEND_URL ?? 'http://localhost:3001';

export const POST: RequestHandler = async ({ cookies }) => {
	// Tell the backend (for future server-side session cleanup)
	await fetch(`${BACKEND_URL}/api/auth/logout`, { method: 'POST' });

	// Clear the auth cookie
	cookies.delete('auth_token', { path: '/' });

	redirect(302, '/');
};
