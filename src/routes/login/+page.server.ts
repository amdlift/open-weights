import { fail, redirect } from '@sveltejs/kit';
import {
	createSession,
	normalizeUsername,
	pruneExpiredSessions,
	setSessionCookie,
	verifyPassword
} from '$lib/server/auth';
import { getDb } from '$lib/server/db';
import {
	LOGIN_LIMIT,
	LOGIN_WINDOW_MS,
	checkRateLimit,
	clearRateLimit,
	recordFailure
} from '$lib/server/rate-limit';
import { countUsers, getUserByUsername } from '$lib/server/users';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({
	// Sign-up disabled before anyone registered leaves an instance nobody can
	// enter; say so rather than showing a form that can never succeed.
	lockedOut: countUsers(getDb()) === 0
});

/** Only follow same-site paths, so `?redirectTo=` cannot bounce to another host. */
function safeRedirect(target: string | null): string {
	if (!target || !target.startsWith('/') || target.startsWith('//')) return '/';
	return target;
}

export const actions: Actions = {
	default: async ({ request, cookies, url, getClientAddress }) => {
		const form = await request.formData();
		const username = normalizeUsername(String(form.get('username') ?? ''));
		const password = String(form.get('password') ?? '');
		const redirectTo = safeRedirect(url.searchParams.get('redirectTo'));

		if (!username || !password) {
			return fail(400, { username, error: 'Enter your username and password.' });
		}

		const key = `login:${getClientAddress()}:${username}`;
		const limit = checkRateLimit(key, LOGIN_LIMIT, LOGIN_WINDOW_MS);
		if (!limit.allowed) {
			return fail(429, {
				username,
				error: `Too many failed attempts. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minute(s).`
			});
		}

		const user = getUserByUsername(username);
		// Deliberately identical responses for "no such user", "wrong password"
		// and "deactivated" so the form cannot be used to enumerate accounts.
		const ok =
			user && user.isActive ? await verifyPassword(user.passwordHash, password) : false;

		if (!user || !ok) {
			recordFailure(key, LOGIN_WINDOW_MS);
			return fail(400, { username, error: 'Incorrect username or password.' });
		}

		clearRateLimit(key);
		pruneExpiredSessions();
		setSessionCookie(cookies, createSession(user.id));

		redirect(303, redirectTo);
	}
};
