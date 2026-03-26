import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';

const BACKEND_URL = env.BACKEND_URL ?? 'http://localhost:3001';

export const load: PageServerLoad = async ({ url, cookies }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const storedState = cookies.get('oauth_state');

	// Clean up one-time cookie
	cookies.delete('oauth_state', { path: '/' });

	if (!code || !state) {
		// Log the provider's error server-side only 
		const oauthError = url.searchParams.get('error_description') ?? url.searchParams.get('error');
		if (oauthError) {
			console.error(`OAuth error from provider: ${oauthError}`);
		}
		return { error: 'Authentication could not be completed. Please try again.' };
	}

	// Forward everything to the backend 
	const res = await fetch(`${BACKEND_URL}/api/auth/handle-callback`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ code, state, storedState })
	});

	if (!res.ok) {
		return { error: 'Authentication failed' };
	}

	const { token, redirectTo } = await res.json();

	// Store the backend-issued JWT in an httpOnly cookie
	cookies.set('auth_token', token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: env.NODE_ENV === 'production',
		maxAge: 60 * 60 * 24 * 7
	});

	// Redirect to wherever the backend told us
	redirect(302, redirectTo);
};
