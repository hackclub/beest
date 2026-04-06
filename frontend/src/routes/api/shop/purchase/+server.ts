import { env } from '$env/dynamic/private';
import { proxyWithRefresh } from '$lib/server/auth';
import type { RequestHandler } from './$types';

const BACKEND_URL = env.BACKEND_URL ?? 'http://localhost:3001';

export const POST: RequestHandler = async ({ cookies, request }) => {
	const body = await request.json();
	return proxyWithRefresh(cookies, `${BACKEND_URL}/api/shop/purchase`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
};
