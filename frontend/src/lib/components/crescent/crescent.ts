import { env } from '$env/dynamic/public';

/** Where Crescent lives; PUBLIC_CRESCENT_URL points it at a local copy in development. */
export const CRESCENT_URL = env.PUBLIC_CRESCENT_URL || 'https://crescent.hackclub.com';
