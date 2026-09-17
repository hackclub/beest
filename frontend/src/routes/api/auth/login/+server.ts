import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const BACKEND_URL = env.BACKEND_URL ?? 'http://127.0.0.1:3001';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const email = url.searchParams.get('email') ?? 'mrketanartist13@gmail.com';
	let devRedirectTo: string | null = null;

	// Development login is opt-in so local development does not silently log
	// users in as the synthetic fixture account instead of using OAuth.
	if (env.ENABLE_DEV_LOGIN === 'true') {
		try {
			const devRes = await fetch(`${BACKEND_URL}/api/auth/dev-login`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email })
			});

			if (devRes.ok) {
				const { token, refreshToken, redirectTo } = await devRes.json();
				const cookieOpts = {
					path: '/',
					httpOnly: true,
					sameSite: 'lax' as const,
					secure: false
				};

				cookies.set('auth_token', token, { ...cookieOpts, maxAge: 3600 });
				cookies.set('refresh_token', refreshToken, { ...cookieOpts, maxAge: 90 * 86400 });

				devRedirectTo = redirectTo || '/home';
			}
		} catch (err) {
			console.error('Dev login fetch error:', err);
		}
	}

	if (devRedirectTo) {
		redirect(302, devRedirectTo);
	}

	// Ask the backend to generate state + authorize URL
	let res: Response;
	try {
		res = await fetch(`${BACKEND_URL}/api/auth/start`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email })
		});
	} catch (err) {
		console.error('Failed to reach backend at', BACKEND_URL, err);
		return new Response('Backend unreachable', { status: 502 });
	}

	if (!res.ok) {
		console.error('Backend returned', res.status, await res.text().catch(() => ''));
		return new Response('Failed to start auth', { status: 502 });
	}

	const { url: authorizeUrl, state } = await res.json();
	const cookieOpts = {
		path: '/',
		httpOnly: true,
		sameSite: 'lax' as const,
		secure: env.NODE_ENV === 'production',
		maxAge: 600
	};

	cookies.set('oauth_state', state, cookieOpts);

	redirect(302, authorizeUrl);
};
