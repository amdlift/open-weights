import { error, fail } from '@sveltejs/kit';
import { USER_ROLES, isOneOf } from '$lib/constants';
import {
	deleteAllSessionsForUser,
	generateTemporaryPassword,
	normalizeUsername,
	validateUsername
} from '$lib/server/auth';
import {
	UsernameTakenError,
	countActiveAdmins,
	createUser,
	deleteUser,
	getUserById,
	listUsers,
	setPassword,
	setUserActive,
	setUserRole
} from '$lib/server/users';
import type { Actions, PageServerLoad } from './$types';

function requireAdmin(locals: App.Locals) {
	if (!locals.user?.isAdmin) error(403, 'Only administrators can manage users.');
	return locals.user;
}

export const load: PageServerLoad = ({ locals }) => {
	requireAdmin(locals);
	return { users: listUsers() };
};

/** Read and validate a `userId` field, refusing anything not on this instance. */
function readTarget(form: FormData) {
	const id = Number(form.get('userId'));
	if (!Number.isInteger(id)) return null;
	return getUserById(id) ?? null;
}

export const actions: Actions = {
	create: async ({ request, locals }) => {
		requireAdmin(locals);

		const form = await request.formData();
		const username = normalizeUsername(String(form.get('username') ?? ''));
		const displayName = String(form.get('displayName') ?? '').trim();
		const roleRaw = String(form.get('role') ?? 'user');
		const role = isOneOf(USER_ROLES, roleRaw) ? roleRaw : 'user';

		const usernameError = validateUsername(username);
		if (usernameError) return fail(400, { error: usernameError, username, displayName });

		// Handed over out-of-band; the account cannot be used until it is changed.
		const temporaryPassword = generateTemporaryPassword();

		try {
			const user = await createUser({
				username,
				displayName: displayName || username,
				password: temporaryPassword,
				role,
				mustChangePassword: true
			});
			return { created: { username: user.username, temporaryPassword } };
		} catch (err) {
			if (err instanceof UsernameTakenError) {
				return fail(400, { error: err.message, username, displayName });
			}
			throw err;
		}
	},

	resetPassword: async ({ request, locals }) => {
		requireAdmin(locals);

		const target = readTarget(await request.formData());
		if (!target) return fail(400, { error: 'That user no longer exists.' });

		const temporaryPassword = generateTemporaryPassword();
		await setPassword(target.id, temporaryPassword, { mustChangePassword: true });
		// Whoever was signed in with the old password loses that session.
		deleteAllSessionsForUser(target.id);

		return { created: { username: target.username, temporaryPassword } };
	},

	setRole: async ({ request, locals }) => {
		const admin = requireAdmin(locals);

		const form = await request.formData();
		const target = readTarget(form);
		if (!target) return fail(400, { error: 'That user no longer exists.' });

		const roleRaw = String(form.get('role') ?? '');
		if (!isOneOf(USER_ROLES, roleRaw)) return fail(400, { error: 'Unknown role.' });

		// Losing the last admin would leave the instance unmanageable.
		if (target.role === 'admin' && roleRaw !== 'admin' && countActiveAdmins() <= 1) {
			return fail(400, { error: 'This is the only administrator. Promote someone else first.' });
		}
		if (target.id === admin.id && roleRaw !== 'admin') {
			return fail(400, { error: 'You cannot remove your own administrator access.' });
		}

		setUserRole(target.id, roleRaw);
		return { ok: true };
	},

	setActive: async ({ request, locals }) => {
		const admin = requireAdmin(locals);

		const form = await request.formData();
		const target = readTarget(form);
		if (!target) return fail(400, { error: 'That user no longer exists.' });

		const isActive = form.get('isActive') === 'true';

		if (target.id === admin.id && !isActive) {
			return fail(400, { error: 'You cannot deactivate your own account.' });
		}
		if (!isActive && target.role === 'admin' && countActiveAdmins() <= 1) {
			return fail(400, { error: 'This is the only active administrator.' });
		}

		setUserActive(target.id, isActive);
		// A deactivated account must lose its open sessions immediately, not at
		// the next expiry.
		if (!isActive) deleteAllSessionsForUser(target.id);

		return { ok: true };
	},

	delete: async ({ request, locals }) => {
		const admin = requireAdmin(locals);

		const form = await request.formData();
		const target = readTarget(form);
		if (!target) return fail(400, { error: 'That user no longer exists.' });

		if (target.id === admin.id) {
			return fail(400, { error: 'You cannot delete your own account.' });
		}
		if (target.role === 'admin' && countActiveAdmins() <= 1) {
			return fail(400, { error: 'This is the only active administrator.' });
		}
		if (String(form.get('confirmUsername') ?? '').trim() !== target.username) {
			return fail(400, {
				error: `Type "${target.username}" to confirm deleting that account and all of its data.`
			});
		}

		deleteUser(target.id);
		return { deleted: target.username };
	}
};
