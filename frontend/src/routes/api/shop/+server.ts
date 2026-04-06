import { env } from '$env/dynamic/private';
import { proxyWithRefresh } from '$lib/server/auth';
import type { RequestHandler } from './$types';

const BACKEND_URL = env.BACKEND_URL ?? 'http://localhost:3001';

export const GET: RequestHandler = async ({ cookies }) => {
	return proxyWithRefresh(cookies, `${BACKEND_URL}/api/shop`);
};
