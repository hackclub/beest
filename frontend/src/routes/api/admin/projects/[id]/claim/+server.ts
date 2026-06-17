import { env } from '$env/dynamic/private';
import { proxyWithRefresh } from '$lib/server/auth';
import type { RequestHandler } from './$types';

const BACKEND_URL = env.BACKEND_URL ?? 'http://localhost:3001';

export const POST: RequestHandler = async ({ cookies, params }) => {
	return proxyWithRefresh(cookies, `${BACKEND_URL}/api/admin/projects/${params.id}/claim`, {
		method: 'POST',
	});
};

export const DELETE: RequestHandler = async ({ cookies, params }) => {
	return proxyWithRefresh(cookies, `${BACKEND_URL}/api/admin/projects/${params.id}/claim`, {
		method: 'DELETE',
	});
};
