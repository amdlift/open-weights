import { redirect } from '@sveltejs/kit';
import { clearSessionCookie, deleteSession } from '$lib/server/auth';
import type { RequestHandler } from './$types';

/**
 * POST-only: a GET would let any page on the internet log the user out with an
 * `<img>` tag.
 */
export const POST: RequestHandler = ({ cookies, locals }) => {
	if (locals.sessionToken) deleteSession(locals.sessionToken);
	clearSessionCookie(cookies);
	redirect(303, '/login');
};
