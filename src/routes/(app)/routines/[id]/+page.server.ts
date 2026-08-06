import { error, fail, redirect } from '@sveltejs/kit';
import { listExercises } from '$lib/server/exercises';
import {
	readDistanceM,
	readDurationS,
	readInteger,
	readRpe,
	readTrimmedText
} from '$lib/server/form-values';
import {
	addExerciseToRoutine,
	deleteRoutine,
	getRoutine,
	moveRoutineItem,
	normaliseRepTarget,
	removeRoutineItem,
	updateRoutine,
	updateRoutineItem
} from '$lib/server/routines';
import { todayIn } from '$lib/dates';
import { createWorkoutFromRoutine } from '$lib/server/workouts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	const user = locals.user!;
	const routineId = Number(params.id);
	if (!Number.isInteger(routineId)) error(404, 'No such routine.');

	const routine = getRoutine(user.id, routineId);
	if (!routine) error(404, 'No such routine.');

	return {
		routine,
		exerciseOptions: listExercises(user.id).map((e) => ({
			id: e.id,
			name: e.name,
			kind: e.kind,
			primaryMuscle: e.primaryMuscle,
			equipment: e.equipment,
			useCount: e.useCount
		}))
	};
};

export const actions: Actions = {
	updateDetails: async ({ request, locals, params }) => {
		const user = locals.user!;
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		if (!name) return fail(400, { error: 'Give the routine a name.' });

		updateRoutine(user.id, Number(params.id), {
			name,
			notes: readTrimmedText(form, 'notes') ?? null
		});
		return { saved: true };
	},

	addExercise: async ({ request, locals, params }) => {
		const user = locals.user!;
		const form = await request.formData();
		const exerciseId = Number(form.get('exerciseId'));
		if (!Number.isInteger(exerciseId)) return fail(400, { error: 'Pick an exercise.' });

		if (addExerciseToRoutine(user.id, Number(params.id), exerciseId) == null) {
			error(404, 'No such routine.');
		}
		return { added: true };
	},

	updateItem: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();
		const itemId = Number(form.get('itemId'));
		if (!Number.isInteger(itemId)) return fail(400, { error: 'Unknown entry.' });

		const targets: Record<string, unknown> = {};
		const targetSets = readInteger(form, 'targetSets', { min: 1, max: 20 });
		if (targetSets !== undefined) targets.targetSets = targetSets;
		const repsMin = readInteger(form, 'targetRepsMin', { min: 1, max: 1000 });
		const repsMax = readInteger(form, 'targetRepsMax', { min: 1, max: 1000 });
		if (repsMin !== undefined || repsMax !== undefined) {
			const reps = normaliseRepTarget(repsMin ?? null, repsMax ?? null);
			targets.targetRepsMin = reps.min;
			targets.targetRepsMax = reps.max;
		}
		const targetRpe = readRpe(form, 'targetRpe');
		if (targetRpe !== undefined) targets.targetRpe = targetRpe;
		const targetDistanceM = readDistanceM(form, 'targetDistance', user.unitSystem);
		if (targetDistanceM !== undefined) targets.targetDistanceM = targetDistanceM;
		const targetDurationS = readDurationS(form, 'targetDuration');
		if (targetDurationS !== undefined) targets.targetDurationS = targetDurationS;
		const notes = readTrimmedText(form, 'notes', 500);
		if (notes !== undefined) targets.notes = notes;

		if (Object.keys(targets).length > 0) updateRoutineItem(user.id, itemId, targets);
		return { ok: true };
	},

	removeItem: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();
		removeRoutineItem(user.id, Number(form.get('itemId')));
		return { ok: true };
	},

	moveItem: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();
		moveRoutineItem(user.id, Number(form.get('itemId')), form.get('direction') === 'up' ? -1 : 1);
		return { ok: true };
	},

	start: async ({ locals, params }) => {
		const user = locals.user!;
		const workoutId = createWorkoutFromRoutine(
			user.id,
			Number(params.id),
			todayIn(user.timezone)
		);
		if (workoutId == null) error(404, 'No such routine.');
		redirect(303, `/workouts/${workoutId}`);
	},

	delete: async ({ locals, params }) => {
		const user = locals.user!;
		if (!deleteRoutine(user.id, Number(params.id))) error(404, 'No such routine.');
		redirect(303, '/routines');
	}
};
