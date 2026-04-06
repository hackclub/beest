import { env } from '$env/dynamic/private';
import { proxyWithRefresh } from '$lib/server/auth';
import type { RequestHandler } from './$types';

const BACKEND_URL = env.BACKEND_URL ?? 'http://localhost:3001';

const COOKIE_OPTS = {
	path: '/',
	httpOnly: true,
	sameSite: 'lax' as const,
	secure: env.NODE_ENV === 'production'
};

/**
 * Starts impersonation: saves admin tokens, sets impersonation JWT.
 */
export const POST: RequestHandler = async ({ cookies, params }) => {
	// 1. Stash the admin's current tokens BEFORE proxying — proxyWithRefresh
	//    auto-sets auth_token when the response contains a token field.
	const adminToken = cookies.get('auth_token');
	const adminRefresh = cookies.get('refresh_token');

	// 2. Proxy the impersonate request to backend
	const res = await proxyWithRefresh(
		cookies,
		`${BACKEND_URL}/api/admin/users/${params.id}/impersonate`,
		{ method: 'POST' }
	);

	if (!res.ok) return res;

	const data = await res.json();
	if (!data.token) {
		return new Response(JSON.stringify({ error: 'No token returned' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// 3. Save the stashed admin tokens so we can restore them later
	if (adminToken) {
		cookies.set('admin_auth_token', adminToken, { ...COOKIE_OPTS, maxAge: 3600 });
	}
	if (adminRefresh) {
		cookies.set('admin_refresh_token', adminRefresh, { ...COOKIE_OPTS, maxAge: 90 * 24 * 60 * 60 });
	}

	// 4. Ensure the impersonation JWT is set (proxyWithRefresh may have already done this)
	cookies.set('auth_token', data.token, { ...COOKIE_OPTS, maxAge: 3600 });
	// No refresh token for impersonation — admin must end session before it expires
	cookies.delete('refresh_token', { path: '/' });

	// 4. Set a non-httpOnly cookie so the frontend can detect impersonation
	cookies.set('impersonating', '1', {
		path: '/',
		httpOnly: false,
		sameSite: 'lax',
		secure: env.NODE_ENV === 'production',
		maxAge: 3600
	});

	return new Response(JSON.stringify({ success: true }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	});
};
