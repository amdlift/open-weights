import { error, fail, redirect } from '@sveltejs/kit';
import { todayIn } from '$lib/dates';
import { readBoolean, readWeightKg } from '$lib/server/form-values';
import {
	completeEnrollment,
	enrolInProgram,
	getEnrollment,
	getProgram,
	getUpNext,
	listEnrollments,
	suggestOneRmSnapshot
} from '$lib/server/programs';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	const user = locals.user!;
	const programId = Number(params.id);
	if (!Number.isInteger(programId)) error(404, 'No such program.');

	const program = getProgram(user.id, programId);
	if (!program) error(404, 'No such program.');

	const live = listEnrollments(user.id, { activeOnly: true });
	const thisRun = live.find((e) => e.programId === programId);
	const otherRun = live.find((e) => e.programId !== programId);

	return {
		program,
		references: suggestOneRmSnapshot(user.id, programId, user.oneRmFormula),
		thisRun: thisRun ? getEnrollment(user.id, thisRun.id) : null,
		upNext: thisRun ? getUpNext(user.id, thisRun.id) : null,
		otherRun: otherRun ?? null
	};
};

export const actions: Actions = {
	default: async ({ request, locals, params }) => {
		const user = locals.user!;
		const programId = Number(params.id);
		const form = await request.formData();

		const live = listEnrollments(user.id, { activeOnly: true });
		const other = live.find((e) => e.programId !== programId);
		if (other && readBoolean(form, 'replace') !== true) {
			return fail(400, {
				error: 'You are already running a program. Confirm the switch to continue.'
			});
		}

		const references = suggestOneRmSnapshot(user.id, programId, user.oneRmFormula);
		const oneRms: Array<{ exerciseId: number; oneRmKg: number; isManual: boolean }> = [];
		for (const reference of references) {
			const field = `oneRm-${reference.exerciseId}`;
			const oneRmKg = readWeightKg(form, field, user.unitSystem);
			// A blank is allowed: that exercise simply prescribes a bare percentage
			// until a max exists. Refusing to start until every lift has history
			// would lock a fresh instance out of its own programs.
			if (oneRmKg == null) continue;
			oneRms.push({
				exerciseId: reference.exerciseId,
				oneRmKg,
				isManual: reference.estimatedOneRmKg == null || oneRmKg !== reference.estimatedOneRmKg
			});
		}

		// Closing the other run is a soft close, never a delete: the sessions
		// logged under it are still yours.
		if (other) completeEnrollment(user.id, other.id, todayIn(user.timezone));

		const enrollmentId = enrolInProgram(user.id, programId, {
			startedOn: todayIn(user.timezone),
			oneRms
		});
		if (enrollmentId == null) error(404, 'No such program.');

		// Back to the program, not into a workout: enrolling on a Sunday for a
		// Monday start must not create a Sunday session.
		redirect(303, `/programs/${programId}`);
	}
};
