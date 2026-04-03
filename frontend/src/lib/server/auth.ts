import { env } from '$env/dynamic/private';
import type { Cookies } from '@sveltejs/kit';

const BACKEND_URL = env.BACKEND_URL ?? 'http://localhost:3001';

const COOKIE_OPTS = {
	path: '/',
	httpOnly: true,
	sameSite: 'lax' as const,
	secure: env.NODE_ENV === 'production'
};

/**
 * Attempts to refresh the auth token using the refresh token cookie.
 * Returns the new token on success, null if refresh fails or no refresh token exists.
 * Sets new cookies when a refresh occurs.
 */
export async function tryRefreshToken(
	cookies: Cookies
): Promise<string | null> {
	const refreshTok = cookies.get('refresh_token');
	if (!refreshTok) {
		cookies.delete('auth_token', { path: '/' });
		return null;
	}

	const res = await fetch(`${BACKEND_URL}/api/auth/refresh`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ refreshToken: refreshTok })
	});

	if (!res.ok) {
		cookies.delete('auth_token', { path: '/' });
		cookies.delete('refresh_token', { path: '/' });
		return null;
	}

	const data = await res.json();
	cookies.set('auth_token', data.token, { ...COOKIE_OPTS, maxAge: 3600 });
	cookies.set('refresh_token', data.refreshToken, {
		...COOKIE_OPTS,
		maxAge: 90 * 24 * 60 * 60
	});
	return data.token;
}

/**
 * Proxies a request to the backend with auth. If the backend returns 401,
 * attempts a token refresh and retries once.
 */
export async function proxyWithRefresh(
	cookies: Cookies,
	backendUrl: string,
	init?: RequestInit
): Promise<Response> {
	let token = cookies.get('auth_token');
	if (!token) {
		token = await tryRefreshToken(cookies) ?? undefined;
		if (!token) {
			return new Response(JSON.stringify({ error: 'Not authenticated' }), {
				status: 401,
				headers: { 'Content-Type': 'application/json' }
			});
		}
	}

	let res = await fetch(backendUrl, {
		...init,
		headers: { ...init?.headers, Authorization: `Bearer ${token}` }
	});

	if (res.status === 401) {
		const newToken = await tryRefreshToken(cookies);
		if (!newToken) {
			return new Response(JSON.stringify({ error: 'Not authenticated' }), {
				status: 401,
				headers: { 'Content-Type': 'application/json' }
			});
		}
		res = await fetch(backendUrl, {
			...init,
			headers: { ...init?.headers, Authorization: `Bearer ${newToken}` }
		});
	}

	const data = await res.json().catch(() => ({}));
	return new Response(JSON.stringify(data), {
		status: res.status,
		headers: { 'Content-Type': 'application/json' }
	});
}

/**
 * Tries to authenticate the user via JWT, falling back to refresh token.
 * Returns user claims on success, null on failure (both tokens expired).
 * Transparently sets new cookies when a refresh occurs.
 */
export async function getAuthenticatedUser(
	cookies: Cookies
): Promise<Record<string, any> | null> {
	const token = cookies.get('auth_token');
	const refreshToken = cookies.get('refresh_token');

	// 1. Try the JWT
	if (token) {
		const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
			headers: { Authorization: `Bearer ${token}` }
		});
		if (res.ok) return res.json();
	}

	// 2. JWT expired or missing — try refresh
	if (refreshToken) {
		const res = await fetch(`${BACKEND_URL}/api/auth/refresh`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ refreshToken })
		});

		if (res.ok) {
			const data = await res.json();

			// Set the rotated tokens
			cookies.set('auth_token', data.token, { ...COOKIE_OPTS, maxAge: 3600 });
			cookies.set('refresh_token', data.refreshToken, {
				...COOKIE_OPTS,
				maxAge: 90 * 24 * 60 * 60
			});

			// Fetch user claims with the new JWT
			const meRes = await fetch(`${BACKEND_URL}/api/auth/me`, {
				headers: { Authorization: `Bearer ${data.token}` }
			});
			if (meRes.ok) return meRes.json();
		}
	}

	// 3. Both expired — clean up
	cookies.delete('auth_token', { path: '/' });
	cookies.delete('refresh_token', { path: '/' });
	return null;
}
