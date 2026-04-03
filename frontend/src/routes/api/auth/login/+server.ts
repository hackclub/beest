import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const BACKEND_URL = env.BACKEND_URL ?? 'http://localhost:3001';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const email = url.searchParams.get('email') ?? undefined;

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
	// Store backend-generated values in httpOnly cookies for the callback
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
