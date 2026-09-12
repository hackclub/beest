import type { PageServerLoad } from './$types';
import { proxyWithRefresh } from '$lib/server/auth';
import { env } from '$env/dynamic/private';

const BACKEND_URL = env.BACKEND_URL ?? 'http://localhost:3001';

export const load: PageServerLoad = async ({ cookies, fetch }) => {
  const [certificateResponse, ordersResponse] = await Promise.all([
    proxyWithRefresh(cookies, `${BACKEND_URL}/api/certificates/`, { method: 'GET' }),
    proxyWithRefresh(cookies, `${BACKEND_URL}/api/shop/orders`, { method: 'GET' }),
  ]);

  const certificates = certificateResponse.ok
    ? await certificateResponse.json()
    : [];
  const orders = ordersResponse.ok ? await ordersResponse.json() : [];
  const fulfilledPipes = orders
    .filter((order: { status: string }) => order.status === 'fulfilled')
    .reduce(
      (total: number, order: { pipesSpent: number }) => total + order.pipesSpent,
      0,
    );

  return { certificates, orders, fulfilledPipes, eligible: fulfilledPipes >= 30 };
};
