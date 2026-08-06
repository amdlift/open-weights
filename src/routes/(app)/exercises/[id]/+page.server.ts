import { error, fail, redirect } from '@sveltejs/kit';
import {
	EQUIPMENT_TYPES,
	EXERCISE_KINDS,
	MUSCLE_GROUPS,
	isOneOf,
	supportsOneRm
} from '$lib/constants';
import {
	countExerciseUses,
	deleteCustomExercise,
	getExercise,
	setExerciseHidden,
	updateCustomExercise
} from '$lib/server/exercises';
import { getDb } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { getExerciseRecords, getExerciseSessions, getOneRmSeries } from '$lib/server/stats';
import { and, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	const user = locals.user!;
	const exerciseId = Number(params.id);
	if (!Number.isInteger(exerciseId)) error(404, 'No such exercise.');

	const exercise = getExercise(user.id, exerciseId);
	if (!exercise) error(404, 'No such exercise.');

	const hidden =
		getDb()
			.select()
			.from(schema.userHiddenExercises)
			.where(
				and(
					eq(schema.userHiddenExercises.userId, user.id),
					eq(schema.userHiddenExercises.exerciseId, exerciseId)
				)
			)
			.get() != null;

	return {
		exercise: {
			id: exercise.id,
			name: exercise.name,
			kind: exercise.kind,
			primaryMuscle: exercise.primaryMuscle,
			equipment: exercise.equipment,
			notes: exercise.notes,
			isCustom: exercise.ownerUserId != null,
			isHidden: hidden
		},
		records: getExerciseRecords(user.id, exerciseId, user.oneRmFormula),
		sessions: getExerciseSessions(user.id, exerciseId, user.oneRmFormula, { limit: 40 }),
		oneRmSeries: supportsOneRm(exercise.kind)
			? getOneRmSeries(user.id, exerciseId, user.oneRmFormula)
			: [],
		useCount: countExerciseUses(user.id, exerciseId)
	};
};

export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		const user = locals.user!;
		const exerciseId = Number(params.id);
		const form = await request.formData();

		const name = String(form.get('name') ?? '').trim();
		const kindRaw = String(form.get('kind') ?? '');
		const muscleRaw = String(form.get('primaryMuscle') ?? '');
		const equipmentRaw = String(form.get('equipment') ?? '');
		const notes = String(form.get('notes') ?? '').trim();

		if (!name) return fail(400, { error: 'Give the exercise a name.' });
		if (!isOneOf(EXERCISE_KINDS, kindRaw)) {
			return fail(400, { error: 'Choose what this exercise tracks.' });
		}

		const ok = updateCustomExercise(user.id, exerciseId, {
			name,
			kind: kindRaw,
			primaryMuscle: isOneOf(MUSCLE_GROUPS, muscleRaw) ? muscleRaw : null,
			equipment: isOneOf(EQUIPMENT_TYPES, equipmentRaw) ? equipmentRaw : null,
			notes: notes || null
		});

		if (!ok) return fail(403, { error: 'Built-in exercises cannot be edited.' });
		return { saved: true };
	},

	toggleHidden: async ({ request, locals, params }) => {
		const user = locals.user!;
		const form = await request.formData();
		setExerciseHidden(user.id, Number(params.id), form.get('hidden') === 'true');
		return { ok: true };
	},

	delete: async ({ locals, params }) => {
		const user = locals.user!;
		const result = deleteCustomExercise(user.id, Number(params.id));

		if (!result.deleted) {
			return fail(400, {
				error:
					result.reason === 'in_use'
						? 'This exercise appears in a workout or routine. Hide it instead — deleting it would leave that history without a name.'
						: 'Built-in exercises cannot be deleted.'
			});
		}

		redirect(303, '/exercises');
	}
};
