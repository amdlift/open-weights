import { error, fail, redirect } from '@sveltejs/kit';
import { INTENSITY_MODES, isOneOf } from '$lib/constants';
import { todayIn } from '$lib/dates';
import { listExercises } from '$lib/server/exercises';
import {
	readDistanceM,
	readDurationS,
	readInteger,
	readRpe,
	readTrimmedText
} from '$lib/server/form-values';
import {
	addExerciseToProgramDay,
	addProgramWeek,
	completeEnrollment,
	deleteProgram,
	deleteProgramWeek,
	duplicateProgramWeek,
	getEnrollment,
	getEnrollmentProgress,
	getProgram,
	getProgramDayAt,
	getUpNext,
	listEnrollments,
	moveProgramPrescription,
	removeProgramPrescription,
	resizeProgramWeeks,
	startProgramDay,
	updateProgram,
	updateProgramDay,
	updateProgramPrescription
} from '$lib/server/programs';
import { normaliseRepTarget } from '$lib/server/routines';
import { getExerciseRecords } from '$lib/server/stats';
import type { Actions, PageServerLoad } from './$types';

function clamp(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) return min;
	return Math.min(Math.max(Math.round(value), min), max);
}

export const load: PageServerLoad = ({ locals, params, url }) => {
	const user = locals.user!;
	const programId = Number(params.id);
	if (!Number.isInteger(programId)) error(404, 'No such program.');

	const program = getProgram(user.id, programId);
	if (!program) error(404, 'No such program.');

	// Clamped rather than 404'd: deleting the week you were looking at should
	// land you somewhere sensible, not on an error page.
	const weekCount = Math.max(program.weeks.length, 1);
	const week = clamp(Number(url.searchParams.get('week') ?? 1), 1, weekCount);
	const dayCount = Math.max(program.weeks.find((w) => w.weekNumber === week)?.days.length ?? 1, 1);
	const day = clamp(Number(url.searchParams.get('day') ?? 1), 1, dayCount);

	const enrollment = listEnrollments(user.id, { activeOnly: true }).find(
		(e) => e.programId === programId
	);

	/**
	 * Current estimates, so the editor can preview what a percentage works out
	 * to while you type it. Deliberately live rather than the enrolment's frozen
	 * snapshot — this is authoring, not a session.
	 */
	const oneRmEstimates: Record<number, number> = {};
	for (const exerciseId of program.exerciseIds) {
		const best = getExerciseRecords(user.id, exerciseId, user.oneRmFormula).bestOneRm;
		if (best) oneRmEstimates[exerciseId] = best.value;
	}

	return {
		program,
		week,
		day,
		dayDetail: getProgramDayAt(user.id, programId, week, day - 1),
		enrollment: enrollment ? getEnrollment(user.id, enrollment.id) : null,
		upNext: enrollment ? getUpNext(user.id, enrollment.id) : null,
		progress: enrollment ? [...getEnrollmentProgress(user.id, enrollment.id)] : [],
		oneRmEstimates,
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
		if (!name) return fail(400, { error: 'Give the program a name.' });
		if (name.length > 80) return fail(400, { error: 'Keep the name under 80 characters.' });

		const ok = updateProgram(user.id, Number(params.id), {
			name,
			notes: readTrimmedText(form, 'notes') ?? null
		});
		if (!ok) error(404, 'No such program.');
		return { saved: true };
	},

	setDaysPerWeek: async ({ request, locals, params }) => {
		const user = locals.user!;
		const form = await request.formData();

		const daysPerWeek = readInteger(form, 'daysPerWeek', { min: 1, max: 7 });
		if (daysPerWeek == null) {
			return fail(400, { error: 'Pick between 1 and 7 training days a week.' });
		}

		// Obeys without argument: the editor already told the user how many
		// authored days a shrink would take with it.
		if (!resizeProgramWeeks(user.id, Number(params.id), daysPerWeek)) {
			error(404, 'No such program.');
		}
		return { saved: true };
	},

	addWeek: async ({ locals, params }) => {
		const user = locals.user!;
		const weekNumber = addProgramWeek(user.id, Number(params.id));
		if (weekNumber == null) error(404, 'No such program.');
		redirect(303, `/programs/${params.id}?week=${weekNumber}&day=1`);
	},

	duplicateWeek: async ({ request, locals, params }) => {
		const user = locals.user!;
		const form = await request.formData();
		const fromWeek = Number(form.get('fromWeek'));
		if (!Number.isInteger(fromWeek)) return fail(400, { error: 'Pick a week to copy.' });

		const created = duplicateProgramWeek(user.id, Number(params.id), fromWeek);
		if (created == null) error(404, 'No such program.');
		redirect(303, `/programs/${params.id}?week=${created}&day=1`);
	},

	deleteWeek: async ({ request, locals, params }) => {
		const user = locals.user!;
		const form = await request.formData();
		const week = Number(form.get('week'));
		if (!Number.isInteger(week)) return fail(400, { error: 'Pick a week to delete.' });

		if (!deleteProgramWeek(user.id, Number(params.id), week)) {
			error(404, 'No such program.');
		}
		redirect(303, `/programs/${params.id}?week=${Math.max(week - 1, 1)}&day=1`);
	},

	updateDay: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();
		const programDayId = Number(form.get('programDayId'));
		if (!Number.isInteger(programDayId)) return fail(400, { error: 'Pick a day.' });

		updateProgramDay(user.id, programDayId, {
			title: readTrimmedText(form, 'title', 60),
			notes: readTrimmedText(form, 'notes', 500)
		});
		return { ok: true };
	},

	// Name fixed by ExercisePicker, which hard-codes the action it posts to.
	addExercise: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();
		const programDayId = Number(form.get('programDayId'));
		const exerciseId = Number(form.get('exerciseId'));
		if (!Number.isInteger(exerciseId)) return fail(400, { error: 'Pick an exercise.' });
		if (!Number.isInteger(programDayId)) return fail(400, { error: 'Pick a day.' });

		if (addExerciseToProgramDay(user.id, programDayId, exerciseId) == null) {
			error(404, 'No such program.');
		}
		return { added: true };
	},

	updateItem: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();
		const itemId = Number(form.get('itemId'));
		if (!Number.isInteger(itemId)) return fail(400, { error: 'Pick an exercise.' });

		const targets: Record<string, unknown> = {};

		const targetSets = readInteger(form, 'targetSets', { min: 1, max: 20 });
		if (targetSets !== undefined) targets.targetSets = targetSets;

		const repsMin = readInteger(form, 'targetRepsMin', { min: 1, max: 1000 });
		const repsMax = readInteger(form, 'targetRepsMax', { min: 1, max: 1000 });
		if (repsMin !== undefined || repsMax !== undefined) {
			const range = normaliseRepTarget(repsMin ?? null, repsMax ?? null);
			targets.targetRepsMin = range.min;
			targets.targetRepsMax = range.max;
		}

		const targetRpe = readRpe(form, 'targetRpe');
		if (targetRpe !== undefined) targets.targetRpe = targetRpe;

		// A ratio is not a measurement and must never touch a unit reader.
		const percent = readInteger(form, 'targetPercentOneRm', { min: 30, max: 120 });
		if (percent !== undefined) targets.targetPercentOneRm = percent;

		const distance = readDistanceM(form, 'targetDistance', user.unitSystem);
		if (distance !== undefined) targets.targetDistanceM = distance;

		const duration = readDurationS(form, 'targetDuration');
		if (duration !== undefined) targets.targetDurationS = duration;

		const notes = readTrimmedText(form, 'notes', 500);
		if (notes !== undefined) targets.notes = notes;

		if (Object.keys(targets).length > 0) {
			updateProgramPrescription(user.id, itemId, targets);
		}
		return { ok: true };
	},

	setIntensityMode: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();
		const itemId = Number(form.get('itemId'));
		if (!Number.isInteger(itemId)) return fail(400, { error: 'Pick an exercise.' });

		const raw = String(form.get('intensityMode') ?? '');
		const mode = isOneOf(INTENSITY_MODES, raw) ? raw : null;

		if (!updateProgramPrescription(user.id, itemId, { intensityMode: mode })) {
			return fail(400, {
				error: 'Only weight-based lifts can be prescribed as a percentage of your max.'
			});
		}
		return { ok: true };
	},

	moveItem: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();
		moveProgramPrescription(
			user.id,
			Number(form.get('itemId')),
			form.get('direction') === 'up' ? -1 : 1
		);
		return { ok: true };
	},

	removeItem: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();
		removeProgramPrescription(user.id, Number(form.get('itemId')));
		return { ok: true };
	},

	startDay: async ({ request, locals, params }) => {
		const user = locals.user!;
		const form = await request.formData();
		const programDayId = Number(form.get('programDayId'));
		const enrollmentId = Number(form.get('enrollmentId'));
		if (!Number.isInteger(programDayId) || !Number.isInteger(enrollmentId)) {
			return fail(400, { error: 'Start this program before logging a session from it.' });
		}

		const result = startProgramDay(user.id, enrollmentId, programDayId, {
			performedOn: todayIn(user.timezone),
			units: user.unitSystem
		});

		if (result.reason === 'enrollment_closed') {
			return fail(400, { error: 'That run is finished. Start the program again to keep going.' });
		}
		if (result.workoutId == null) error(404, 'No such program.');
		redirect(303, `/workouts/${result.workoutId}`);
	},

	endRun: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();
		completeEnrollment(user.id, Number(form.get('enrollmentId')), todayIn(user.timezone));
		return { ok: true };
	},

	delete: async ({ locals, params }) => {
		const user = locals.user!;
		if (!deleteProgram(user.id, Number(params.id))) error(404, 'No such program.');
		redirect(303, '/programs');
	}
};
