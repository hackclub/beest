import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const BACKEND_URL = env.BACKEND_URL ?? 'http://localhost:3001';

export const POST: RequestHandler = async ({ cookies }) => {
	const token = cookies.get('auth_token');
	if (!token) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	const res = await fetch(`${BACKEND_URL}/api/auth/rsvp`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}` }
	});

	const data = await res.json();
	return json(data, { status: res.status });
};
