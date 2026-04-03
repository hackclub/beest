import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const BACKEND_URL = env.BACKEND_URL ?? 'http://localhost:3001';

export const POST: RequestHandler = async ({ cookies }) => {
	const token = cookies.get('auth_token');
	if (!token) {
		return new Response('Not authenticated', { status: 401 });
	}

	const res = await fetch(`${BACKEND_URL}/api/onboarding/two-emails`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}` }
	});

	if (!res.ok) {
		return new Response('Backend error', { status: res.status });
	}

	return new Response(JSON.stringify(await res.json()), {
		headers: { 'Content-Type': 'application/json' }
	});
};
