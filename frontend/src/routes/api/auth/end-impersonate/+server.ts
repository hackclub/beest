import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const COOKIE_OPTS = {
	path: '/',
	httpOnly: true,
	sameSite: 'lax' as const,
	secure: env.NODE_ENV === 'production'
};

/**
 * Ends impersonation: restores admin's original tokens.
 */
export const POST: RequestHandler = async ({ cookies }) => {
	const adminToken = cookies.get('admin_auth_token');
	const adminRefresh = cookies.get('admin_refresh_token');

	if (!adminToken && !adminRefresh) {
		return new Response(JSON.stringify({ error: 'No admin session to restore' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// Restore admin tokens
	if (adminToken) {
		cookies.set('auth_token', adminToken, { ...COOKIE_OPTS, maxAge: 3600 });
	}
	if (adminRefresh) {
		cookies.set('refresh_token', adminRefresh, { ...COOKIE_OPTS, maxAge: 90 * 24 * 60 * 60 });
	}

	// Clean up impersonation cookies
	cookies.delete('admin_auth_token', { path: '/' });
	cookies.delete('admin_refresh_token', { path: '/' });
	cookies.delete('impersonating', { path: '/' });

	return new Response(JSON.stringify({ success: true }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	});
};
