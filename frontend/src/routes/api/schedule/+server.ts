import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const BACKEND_URL = env.BACKEND_URL ?? 'http://localhost:3001';

// Public — used by the /schedule page to refresh events while it stays open.
export const GET: RequestHandler = async () => {
	try {
		const res = await fetch(`${BACKEND_URL}/api/schedule`);
		if (!res.ok) return json({ events: [] });
		return json(await res.json());
	} catch {
		return json({ events: [] });
	}
};
