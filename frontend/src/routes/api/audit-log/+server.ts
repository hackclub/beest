import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const BACKEND_URL = env.BACKEND_URL ?? 'http://localhost:3001';

export const GET: RequestHandler = async ({ cookies }) => {
	const token = cookies.get('auth_token');
	if (!token) {
		return new Response(JSON.stringify([]), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const res = await fetch(`${BACKEND_URL}/api/audit-log`, {
		headers: { Authorization: `Bearer ${token}` }
	});

	const data = await res.json().catch(() => []);

	return new Response(JSON.stringify(data), {
		status: res.status,
		headers: { 'Content-Type': 'application/json' }
	});
};
