import { fail, redirect } from '@sveltejs/kit';
import { GENDERS, UNIT_SYSTEMS, isOneOf, type Gender, type UnitSystem } from '$lib/constants';
import { isIsoDate, todayIn } from '$lib/dates';
import { feetInchesToCm } from '$lib/units';
import {
	deleteAllSessionsForUser,
	createSession,
	setSessionCookie,
	validatePassword,
	verifyPassword
} from '$lib/server/auth';
import { getDb } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { completeOnboarding, getProfile, setPassword } from '$lib/server/users';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const user = locals.user!;
	return {
		step: user.mustChangePassword ? ('password' as const) : ('profile' as const),
		displayName: user.displayName,
		profile: getProfile(user.id) ?? null,
		today: todayIn(user.timezone)
	};
};

export const actions: Actions = {
	/** Step 1, only reached by accounts an admin provisioned. */
	password: async ({ request, locals, cookies }) => {
		const user = locals.user!;
		const form = await request.formData();
		const current = String(form.get('currentPassword') ?? '');
		const next = String(form.get('newPassword') ?? '');
		const confirm = String(form.get('confirmPassword') ?? '');

		const row = getDb()
			.select({ passwordHash: schema.users.passwordHash })
			.from(schema.users)
			.where(eq(schema.users.id, user.id))
			.get();

		if (!row || !(await verifyPassword(row.passwordHash, current))) {
			return fail(400, { error: 'That temporary password is not correct.' });
		}

		const passwordError = validatePassword(next);
		if (passwordError) return fail(400, { error: passwordError });
		if (next !== confirm) return fail(400, { error: 'The two passwords do not match.' });
		if (next === current) {
			return fail(400, { error: 'Choose a password different from the temporary one.' });
		}

		await setPassword(user.id, next, { mustChangePassword: false });

		// The temporary password was shared out-of-band, so anything holding a
		// session created with it is retired here. The current browser gets a new
		// one immediately so the user is not bounced back to the login form.
		deleteAllSessionsForUser(user.id);
		setSessionCookie(cookies, createSession(user.id), request);

		return { step: 'profile' as const };
	},

	/** Step 2 — the body data every account needs before the app is useful. */
	profile: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();

		const displayName = String(form.get('displayName') ?? '').trim() || user.username;
		const dateOfBirth = String(form.get('dateOfBirth') ?? '');
		const genderRaw = String(form.get('gender') ?? '');
		const unitSystemRaw = String(form.get('unitSystem') ?? 'metric');
		const weekStartsOn = form.get('weekStartsOn') === '0' ? 0 : 1;
		const timezone = String(form.get('timezone') ?? '') || user.timezone;

		const values = { displayName, dateOfBirth, gender: genderRaw, unitSystem: unitSystemRaw };

		if (!isOneOf(GENDERS, genderRaw)) {
			return fail(400, { ...values, error: 'Select how you would like to be recorded.' });
		}
		if (!isOneOf(UNIT_SYSTEMS, unitSystemRaw)) {
			return fail(400, { ...values, error: 'Select a unit system.' });
		}
		const gender: Gender = genderRaw;
		const unitSystem: UnitSystem = unitSystemRaw;

		const today = todayIn(timezone);
		if (!isIsoDate(dateOfBirth)) {
			return fail(400, { ...values, error: 'Enter your date of birth.' });
		}
		if (dateOfBirth > today) {
			return fail(400, { ...values, error: 'Date of birth cannot be in the future.' });
		}
		if (dateOfBirth < '1900-01-01') {
			return fail(400, { ...values, error: 'Enter a realistic date of birth.' });
		}

		const heightCm = readHeight(form, unitSystem);
		if (heightCm == null) {
			return fail(400, { ...values, error: 'Enter your height.' });
		}
		if (heightCm < 50 || heightCm > 280) {
			return fail(400, { ...values, error: 'Enter a height between 50 cm and 280 cm.' });
		}

		completeOnboarding(user.id, {
			displayName,
			dateOfBirth,
			heightCm,
			gender,
			unitSystem,
			weekStartsOn,
			timezone
		});

		redirect(303, '/');
	}
};

/**
 * Height arrives either as centimetres or as a feet/inches pair, depending on
 * which unit system the user just picked on this same form.
 */
function readHeight(form: FormData, unitSystem: UnitSystem): number | null {
	if (unitSystem === 'imperial') {
		const feet = Number(form.get('heightFeet') ?? '');
		const inches = Number(form.get('heightInches') ?? 0);
		if (!Number.isFinite(feet) || feet <= 0) return null;
		if (!Number.isFinite(inches) || inches < 0 || inches >= 12) return null;
		return feetInchesToCm(feet, inches);
	}
	const cm = Number(form.get('heightCm') ?? '');
	return Number.isFinite(cm) && cm > 0 ? cm : null;
}
