import { error, fail, redirect } from '@sveltejs/kit';
import { isIsoDate } from '$lib/dates';
import { listExercises } from '$lib/server/exercises';
import { createRoutineFromWorkout } from '$lib/server/routines';
import {
	readBoolean,
	readDistanceM,
	readDurationS,
	readInteger,
	readRpe,
	readTrimmedText,
	readWeightKg
} from '$lib/server/form-values';
import {
	addExerciseToWorkout,
	addSet,
	deleteSet,
	deleteWorkout,
	finishWorkout,
	getWorkout,
	moveWorkoutExercise,
	removeWorkoutExercise,
	repeatLastSet,
	updateSet,
	updateWorkout,
	updateWorkoutExerciseNotes
} from '$lib/server/workouts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	const user = locals.user!;
	const workoutId = Number(params.id);
	if (!Number.isInteger(workoutId)) error(404, 'No such workout.');

	const workout = getWorkout(user.id, workoutId);
	if (!workout) error(404, 'No such workout.');

	return {
		workout,
		// The whole picker is sent with the page so searching for an exercise
		// mid-session is instant and works on a flaky gym connection.
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

/** Actions are all id-scoped; ownership is enforced inside the service layer. */
export const actions: Actions = {
	updateDetails: async ({ request, locals, params }) => {
		const user = locals.user!;
		const form = await request.formData();

		const performedOn = String(form.get('performedOn') ?? '');
		if (!isIsoDate(performedOn)) return fail(400, { error: 'That is not a valid date.' });

		const ok = updateWorkout(user.id, Number(params.id), {
			performedOn,
			title: readTrimmedText(form, 'title', 120) ?? null,
			notes: readTrimmedText(form, 'notes') ?? null
		});
		if (!ok) error(404, 'No such workout.');
		return { saved: true };
	},

	addExercise: async ({ request, locals, params }) => {
		const user = locals.user!;
		const form = await request.formData();
		const exerciseId = Number(form.get('exerciseId'));
		if (!Number.isInteger(exerciseId)) return fail(400, { error: 'Pick an exercise.' });

		const workoutExerciseId = addExerciseToWorkout(user.id, Number(params.id), exerciseId);
		if (workoutExerciseId == null) error(404, 'No such workout.');

		// A new exercise always starts with one blank set — an exercise with no
		// sets is never what the user meant.
		addSet(user.id, workoutExerciseId);
		return { added: true };
	},

	removeExercise: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();
		removeWorkoutExercise(user.id, Number(form.get('workoutExerciseId')));
		return { ok: true };
	},

	moveExercise: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();
		const direction = form.get('direction') === 'up' ? -1 : 1;
		moveWorkoutExercise(user.id, Number(form.get('workoutExerciseId')), direction);
		return { ok: true };
	},

	exerciseNotes: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();
		updateWorkoutExerciseNotes(
			user.id,
			Number(form.get('workoutExerciseId')),
			readTrimmedText(form, 'notes') ?? null
		);
		return { ok: true };
	},

	addSet: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();
		addSet(user.id, Number(form.get('workoutExerciseId')));
		return { ok: true };
	},

	repeatSet: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();
		repeatLastSet(user.id, Number(form.get('workoutExerciseId')));
		return { ok: true };
	},

	updateSet: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();
		const setId = Number(form.get('setId'));
		if (!Number.isInteger(setId)) return fail(400, { error: 'Unknown set.' });

		// Only the fields this exercise kind renders are present, so an absent
		// field means "not applicable here", not "clear it".
		const patch: Record<string, unknown> = {};
		const weightKg = readWeightKg(form, 'weight', user.unitSystem);
		if (weightKg !== undefined) patch.weightKg = weightKg;
		const reps = readInteger(form, 'reps', { min: 0, max: 10000 });
		if (reps !== undefined) patch.reps = reps;
		const rpe = readRpe(form, 'rpe');
		if (rpe !== undefined) patch.rpe = rpe;
		const distanceM = readDistanceM(form, 'distance', user.unitSystem);
		if (distanceM !== undefined) patch.distanceM = distanceM;
		const durationS = readDurationS(form, 'duration');
		if (durationS !== undefined) patch.durationS = durationS;
		const isWarmup = readBoolean(form, 'isWarmup');
		if (isWarmup !== undefined) patch.isWarmup = isWarmup;
		const isCompleted = readBoolean(form, 'isCompleted');
		if (isCompleted !== undefined) patch.isCompleted = isCompleted;

		if (Object.keys(patch).length > 0) updateSet(user.id, setId, patch);
		return { ok: true };
	},

	deleteSet: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();
		deleteSet(user.id, Number(form.get('setId')));
		return { ok: true };
	},

	/** Turn what was actually done into a reusable template. */
	saveAsRoutine: async ({ request, locals, params }) => {
		const user = locals.user!;
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		if (!name) return fail(400, { error: 'Give the routine a name.' });

		const routineId = createRoutineFromWorkout(user.id, Number(params.id), name);
		if (routineId == null) error(404, 'No such workout.');
		redirect(303, `/routines/${routineId}`);
	},

	finish: async ({ locals, params }) => {
		const user = locals.user!;
		finishWorkout(user.id, Number(params.id));
		redirect(303, '/workouts');
	},

	delete: async ({ locals, params }) => {
		const user = locals.user!;
		if (!deleteWorkout(user.id, Number(params.id))) error(404, 'No such workout.');
		redirect(303, '/workouts');
	}
};
