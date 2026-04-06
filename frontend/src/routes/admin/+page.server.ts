import { redirect } from '@sveltejs/kit';
import { getAuthenticatedUser } from '$lib/server/auth';
import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';

const BACKEND_URL = env.BACKEND_URL ?? 'http://localhost:3001';

export const load: PageServerLoad = async ({ cookies }) => {
	const user = await getAuthenticatedUser(cookies);
	if (!user) redirect(302, '/');

	const token = cookies.get('auth_token');

	// Try admin scope first, fall back to reviewer scope
	let role: string | null = null;
	const adminRes = await fetch(`${BACKEND_URL}/api/auth/scope?scope=admin`, {
		headers: { Authorization: `Bearer ${token}` }
	});

	if (adminRes.ok) {
		const data = await adminRes.json();
		role = data.perms;
	} else {
		const reviewerRes = await fetch(`${BACKEND_URL}/api/auth/scope?scope=reviewer`, {
			headers: { Authorization: `Bearer ${token}` }
		});
		if (reviewerRes.ok) {
			const data = await reviewerRes.json();
			role = data.perms;
		} else {
			redirect(302, '/home');
		}
	}

	return { user, role };
};
