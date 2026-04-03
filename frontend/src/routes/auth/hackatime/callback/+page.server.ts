import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';

const BACKEND_URL = env.BACKEND_URL ?? 'http://localhost:3001';

export const load: PageServerLoad = async ({ url, cookies }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const storedState = cookies.get('hackatime_state');
	const token = cookies.get('auth_token');

	// Clean up one-time cookie
	cookies.delete('hackatime_state', { path: '/' });

	if (!token) {
		redirect(302, '/');
	}

	if (!code || !state) {
		const oauthError =
			url.searchParams.get('error_description') ?? url.searchParams.get('error');
		if (oauthError) {
			console.error(`Hackatime OAuth error: ${oauthError}`);
		}
		return { error: 'Hackatime connection could not be completed. Please try again.' };
	}

	// Fail early if the state cookie is missing (expired or never set)
	if (!storedState) {
		return { error: 'Session expired. Please try connecting Hackatime again.' };
	}

	// Forward to backend with both the OAuth params and the user's auth token
	const res = await fetch(`${BACKEND_URL}/api/hackatime/callback`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		},
		body: JSON.stringify({ code, state, storedState })
	});

	if (!res.ok) {
		return { error: 'Hackatime connection failed' };
	}

	const { redirectTo } = await res.json();

	// Banned users get redirected to fraud page
	if (redirectTo === 'https://fraud.hackclub.com/') {
		cookies.delete('auth_token', { path: '/' });
		cookies.delete('refresh_token', { path: '/' });
		redirect(302, 'https://fraud.hackclub.com/');
	}

	// Defense-in-depth: only follow relative redirects from the backend
	if (typeof redirectTo !== 'string' || !redirectTo.startsWith('/') || redirectTo.startsWith('//')) {
		redirect(302, '/tutorial');
	}

	redirect(302, redirectTo);
};
