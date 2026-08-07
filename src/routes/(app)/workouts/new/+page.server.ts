import { fail, redirect } from '@sveltejs/kit';
import { isIsoDate, todayIn } from '$lib/dates';
import { getActiveUpNext, startProgramDay } from '$lib/server/programs';
import { listRoutines } from '$lib/server/routines';
import { createWorkout, createWorkoutFromRoutine } from '$lib/server/workouts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const user = locals.user!;
	const today = todayIn(user.timezone);

	// The dashboard and calendar link here with the day already chosen.
	const requested = url.searchParams.get('date');
	const performedOn = requested && isIsoDate(requested) ? requested : today;

	return {
		performedOn,
		upNext: getActiveUpNext(user.id),
		routines: listRoutines(user.id).filter((routine) => !routine.isArchived)
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();

		const performedOn = String(form.get('performedOn') ?? '');
		if (!isIsoDate(performedOn)) return fail(400, { error: 'Choose a valid date.' });

		// Program first, then routine, then blank. Stated rather than left to the
		// order these branches happen to be written in.
		const programDayIdRaw = String(form.get('programDayId') ?? '');
		if (programDayIdRaw) {
			const programDayId = Number(programDayIdRaw);
			const enrollmentId = Number(form.get('enrollmentId'));
			if (!Number.isInteger(programDayId) || !Number.isInteger(enrollmentId)) {
				return fail(400, { error: 'That program session no longer exists.' });
			}

			const result = startProgramDay(user.id, enrollmentId, programDayId, {
				performedOn,
				units: user.unitSystem
			});
			if (result.reason === 'enrollment_closed') {
				return fail(400, { error: 'That run is finished. Start the program again to keep going.' });
			}
			if (result.workoutId == null) {
				return fail(400, { error: 'That program session no longer exists.' });
			}
			redirect(303, `/workouts/${result.workoutId}`);
		}

		const routineIdRaw = String(form.get('routineId') ?? '');
		if (routineIdRaw) {
			const routineId = Number(routineIdRaw);
			const workoutId = Number.isInteger(routineId)
				? createWorkoutFromRoutine(user.id, routineId, performedOn)
				: null;
			if (workoutId == null) return fail(400, { error: 'That routine no longer exists.' });
			redirect(303, `/workouts/${workoutId}`);
		}

		const workoutId = createWorkout(user.id, {
			performedOn,
			title: String(form.get('title') ?? '').trim() || null
		});
		redirect(303, `/workouts/${workoutId}`);
	}
};
