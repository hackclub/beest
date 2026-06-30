import { env } from '$env/dynamic/private';
import { proxyWithRefresh } from '$lib/server/auth';
import type { RequestHandler } from './$types';

const BACKEND_URL = env.BACKEND_URL ?? 'http://localhost:3001';

export const GET: RequestHandler = async ({ cookies, params }) => {
	const res = await proxyWithRefresh(cookies, `${BACKEND_URL}/api/admin/projects/${params.id}/lapse`);
	// proxyWithRefresh rebuilds the Response with only Content-Type, dropping the
	// backend's cache headers. The body holds confidential timelapse URLs, so
	// re-assert no-store / no-referrer on the hop the browser actually sees.
	const body = await res.text();
	const headers = new Headers(res.headers);
	headers.set('Cache-Control', 'no-store, max-age=0');
	headers.set('Pragma', 'no-cache');
	headers.set('Referrer-Policy', 'no-referrer');
	return new Response(body, { status: res.status, headers });
};
