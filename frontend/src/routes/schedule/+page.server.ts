import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';
import type { ScheduleEvent } from '$lib/types/schedule';

export const prerender = false;

const BACKEND_URL = env.BACKEND_URL ?? 'http://localhost:3001';

// Public page — no auth. Degrades to an empty schedule if the backend blips.
export const load: PageServerLoad = async () => {
	let events: ScheduleEvent[] = [];
	try {
		const res = await fetch(`${BACKEND_URL}/api/schedule`);
		if (res.ok) {
			const body = (await res.json()) as { events?: ScheduleEvent[] };
			if (Array.isArray(body.events)) events = body.events;
		}
	} catch {
		// Backend unreachable: render the page without events rather than 500.
	}
	return { events };
};
