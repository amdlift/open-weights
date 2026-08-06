import { redirect, type Handle } from '@sveltejs/kit';
import { SESSION_COOKIE, clearSessionCookie, validateSession } from '$lib/server/auth';
import { getDb } from '$lib/server/db';
import { countUsers, isSignupOpen } from '$lib/server/users';

/** Reachable without a session. */
const PUBLIC_PATHS = new Set(['/login', '/setup']);

/** Reachable with a session that has not finished onboarding. */
const ONBOARDING_PATHS = new Set(['/onboarding', '/logout']);

/** Not part of the UI at all, so no redirects apply. */
function isInfrastructurePath(pathname: string): boolean {
	return pathname === '/api/health' || pathname === '/manifest.webmanifest';
}

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;

	if (isInfrastructurePath(pathname)) {
		event.locals.user = null;
		event.locals.sessionToken = null;
		return resolve(event);
	}

	const token = event.cookies.get(SESSION_COOKIE) ?? null;
	const user = token ? validateSession(token) : null;

	if (token && !user) clearSessionCookie(event.cookies);

	event.locals.user = user;
	event.locals.sessionToken = user ? token : null;

	if (!user) {
		if (!PUBLIC_PATHS.has(pathname)) {
			// An empty instance sends the first visitor to create the admin account
			// rather than to a login form no credentials can satisfy.
			const target = countUsers(getDb()) === 0 ? '/setup' : '/login';
			const query =
				target === '/login' && pathname !== '/'
					? `?redirectTo=${encodeURIComponent(pathname + event.url.search)}`
					: '';
			redirect(303, `${target}${query}`);
		}
		// Nobody should land on /setup once the instance has an owner.
		if (pathname === '/setup' && !isSignupOpen()) redirect(303, '/login');
	} else {
		if (PUBLIC_PATHS.has(pathname)) redirect(303, '/');
		if (!user.isReady && !ONBOARDING_PATHS.has(pathname)) redirect(303, '/onboarding');
		if (user.isReady && pathname === '/onboarding') redirect(303, '/');
	}

	// The saved theme is stamped onto <html> server-side so the first paint is
	// already correct; app.html resolves "system" from the media query.
	const themeClass = user?.theme === 'light' || user?.theme === 'dark' ? user.theme : 'system';

	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%owTheme%', themeClass)
	});
};
