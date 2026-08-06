import { fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, sql } from 'drizzle-orm';
import { isIsoDate, todayIn } from '$lib/dates';
import { getDb } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { createWorkout, createWorkoutFromRoutine } from '$lib/server/workouts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const user = locals.user!;
	const today = todayIn(user.timezone);

	// The dashboard and calendar link here with the day already chosen.
	const requested = url.searchParams.get('date');
	const performedOn = requested && isIsoDate(requested) ? requested : today;

	const routines = getDb()
		.select({
			id: schema.routines.id,
			name: schema.routines.name,
			notes: schema.routines.notes,
			exerciseCount: sql<number>`count(${schema.routineExercises.id})`
		})
		.from(schema.routines)
		.leftJoin(
			schema.routineExercises,
			eq(schema.routineExercises.routineId, schema.routines.id)
		)
		.where(and(eq(schema.routines.userId, user.id), eq(schema.routines.isArchived, false)))
		.groupBy(schema.routines.id)
		.orderBy(asc(schema.routines.name))
		.all();

	return { performedOn, routines };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();

		const performedOn = String(form.get('performedOn') ?? '');
		if (!isIsoDate(performedOn)) return fail(400, { error: 'Choose a valid date.' });

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
