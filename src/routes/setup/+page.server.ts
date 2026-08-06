import { fail, redirect } from '@sveltejs/kit';
import {
	createSession,
	normalizeUsername,
	setSessionCookie,
	validatePassword,
	validateUsername
} from '$lib/server/auth';
import { UsernameTakenError, createUser, isSignupOpen } from '$lib/server/users';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	if (!isSignupOpen()) redirect(303, '/login');
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		// Re-checked inside the request: two people opening this page at once must
		// not both be able to claim the instance.
		if (!isSignupOpen()) redirect(303, '/login');

		const form = await request.formData();
		const username = normalizeUsername(String(form.get('username') ?? ''));
		const displayName = String(form.get('displayName') ?? '').trim();
		const password = String(form.get('password') ?? '');
		const confirm = String(form.get('confirmPassword') ?? '');

		const values = { username, displayName };

		const usernameError = validateUsername(username);
		if (usernameError) return fail(400, { ...values, error: usernameError });

		const passwordError = validatePassword(password);
		if (passwordError) return fail(400, { ...values, error: passwordError });

		if (password !== confirm) {
			return fail(400, { ...values, error: 'The two passwords do not match.' });
		}

		try {
			const user = await createUser({
				username,
				displayName: displayName || username,
				password,
				role: 'admin'
			});
			setSessionCookie(cookies, createSession(user.id), request);
		} catch (err) {
			if (err instanceof UsernameTakenError) {
				return fail(400, { ...values, error: err.message });
			}
			throw err;
		}

		redirect(303, '/onboarding');
	}
};
