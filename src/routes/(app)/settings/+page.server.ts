import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import {
	GENDERS,
	ONE_RM_FORMULAS,
	THEMES,
	UNIT_SYSTEMS,
	isOneOf,
	type UnitSystem
} from '$lib/constants';
import { isIsoDate, isValidTimezone, todayIn } from '$lib/dates';
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
import { getProfile, setPassword } from '$lib/server/users';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const user = locals.user!;
	return {
		profile: getProfile(user.id)!,
		today: todayIn(user.timezone)
	};
};

export const actions: Actions = {
	profile: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();

		const displayName = String(form.get('displayName') ?? '').trim();
		const dateOfBirth = String(form.get('dateOfBirth') ?? '');
		const genderRaw = String(form.get('gender') ?? '');

		if (!displayName) return fail(400, { section: 'profile', error: 'Enter a display name.' });
		if (!isIsoDate(dateOfBirth)) {
			return fail(400, { section: 'profile', error: 'Enter a valid date of birth.' });
		}
		if (dateOfBirth > todayIn(user.timezone)) {
			return fail(400, { section: 'profile', error: 'Date of birth cannot be in the future.' });
		}
		if (!isOneOf(GENDERS, genderRaw)) {
			return fail(400, { section: 'profile', error: 'Select a gender option.' });
		}

		const heightCm = readHeight(form, user.unitSystem);
		if (heightCm == null || heightCm < 50 || heightCm > 280) {
			return fail(400, { section: 'profile', error: 'Enter a height between 50 cm and 280 cm.' });
		}

		const db = getDb();
		db.transaction((tx) => {
			tx.update(schema.users)
				.set({ displayName })
				.where(eq(schema.users.id, user.id))
				.run();
			tx.update(schema.userProfiles)
				.set({ dateOfBirth, heightCm, gender: genderRaw })
				.where(eq(schema.userProfiles.userId, user.id))
				.run();
		});

		return { section: 'profile', saved: true };
	},

	preferences: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();

		const unitSystem = String(form.get('unitSystem') ?? '');
		const oneRmFormula = String(form.get('oneRmFormula') ?? '');
		const theme = String(form.get('theme') ?? '');
		const timezone = String(form.get('timezone') ?? '').trim();
		const weekStartsOn = form.get('weekStartsOn') === '0' ? 0 : 1;

		if (!isOneOf(UNIT_SYSTEMS, unitSystem)) {
			return fail(400, { section: 'preferences', error: 'Select a unit system.' });
		}
		if (!isOneOf(ONE_RM_FORMULAS, oneRmFormula)) {
			return fail(400, { section: 'preferences', error: 'Select a 1RM formula.' });
		}
		if (!isOneOf(THEMES, theme)) {
			return fail(400, { section: 'preferences', error: 'Select a theme.' });
		}
		if (!timezone || !isValidTimezone(timezone)) {
			return fail(400, {
				section: 'preferences',
				error: 'That is not a timezone this server recognises.'
			});
		}

		getDb()
			.update(schema.userProfiles)
			.set({ unitSystem, oneRmFormula, theme, timezone, weekStartsOn })
			.where(eq(schema.userProfiles.userId, user.id))
			.run();

		return { section: 'preferences', saved: true };
	},

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
			return fail(400, { section: 'password', error: 'Your current password is not correct.' });
		}

		const passwordError = validatePassword(next);
		if (passwordError) return fail(400, { section: 'password', error: passwordError });
		if (next !== confirm) {
			return fail(400, { section: 'password', error: 'The two passwords do not match.' });
		}

		await setPassword(user.id, next);

		// Changing a password is also how you evict someone else who has it, so
		// every other session goes; this browser is re-issued one.
		deleteAllSessionsForUser(user.id);
		setSessionCookie(cookies, createSession(user.id), request);

		return { section: 'password', saved: true };
	}
};

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
