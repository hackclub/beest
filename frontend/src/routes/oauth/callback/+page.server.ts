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

	const { token, refreshToken, redirectTo } = await res.json();

	const cookieOpts = {
		path: '/',
		httpOnly: true,
		sameSite: 'lax' as const,
		secure: env.NODE_ENV === 'production'
	};

	// Banned users get redirected without receiving tokens
	if (redirectTo === 'https://fraud.hackclub.com/') {
		redirect(302, 'https://fraud.hackclub.com/');
	}

	// Store JWT (1h) and refresh token (90d) in httpOnly cookies
	cookies.set('auth_token', token, { ...cookieOpts, maxAge: 3600 });
	cookies.set('refresh_token', refreshToken, {
		...cookieOpts,
		maxAge: 90 * 24 * 60 * 60
	});

	// Defense-in-depth: only follow relative redirects
	if (typeof redirectTo !== 'string' || !redirectTo.startsWith('/') || redirectTo.startsWith('//')) {
		redirect(302, '/home');
	}
	redirect(302, redirectTo);
};
