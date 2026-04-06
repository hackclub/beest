import { env } from '$env/dynamic/private';
import { proxyWithRefresh } from '$lib/server/auth';
import type { RequestHandler } from './$types';

const BACKEND_URL = env.BACKEND_URL ?? 'http://localhost:3001';

export const PATCH: RequestHandler = async ({ cookies, params, request }) => {
	const body = await request.json();
	return proxyWithRefresh(cookies, `${BACKEND_URL}/api/admin/shop/${params.id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
};

export const DELETE: RequestHandler = async ({ cookies, params }) => {
	return proxyWithRefresh(cookies, `${BACKEND_URL}/api/admin/shop/${params.id}`, {
		method: 'DELETE'
	});
};
