import { redirect } from '@sveltejs/kit';
import { getAuthenticatedUser } from '$lib/server/auth';
import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';

const BACKEND_URL = env.BACKEND_URL ?? 'http://localhost:3001';

// The fraud panel is open to Super Admin and Fraud Reviewer — the same set the
// `audit` scope resolves.
export const load: PageServerLoad = async ({ cookies }) => {
	const user = await getAuthenticatedUser(cookies);
	if (!user) redirect(302, '/');

	const token = cookies.get('auth_token');
	const adminRes = await fetch(`${BACKEND_URL}/api/auth/scope?scope=audit`, {
		headers: { Authorization: `Bearer ${token}` }
	});
	if (!adminRes.ok) redirect(302, '/home');
	const data = await adminRes.json();

	// Base URL of the private audit service whose /panel page is iframed in for
	// the heartbeat timeline + anomaly heuristics. No trailing slash.
	const auditSvcUrl = (env.AUDIT_SVC_URL ?? 'http://localhost:5174').replace(/\/+$/, '');

	return { user, role: data.perms, auditSvcUrl };
};
