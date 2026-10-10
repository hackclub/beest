import { env } from '$env/dynamic/public';

/** Where Crescent lives; PUBLIC_CRESCENT_URL points it at a local copy in development. */
export const CRESCENT_URL = (env.PUBLIC_CRESCENT_URL || 'https://crescent.hackclub.com').replace(
	/\/+$/,
	''
);

/**
 * The banners' link. Crescent keeps a logged-out visitor's first `utm_source`
 * on the account they go on to make, which is how a signup from here is counted.
 */
export const CRESCENT_AD_URL = `${CRESCENT_URL}/?utm_source=beest-ad`;
