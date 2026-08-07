import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from './db';
import { exerciseIdBySlug, makeUser, testDb } from './test-helpers';
import {
	addExerciseToProgramDay,
	addProgramWeek,
	createProgram,
	deleteEnrollment,
	deleteProgram,
	deleteProgramWeek,
	duplicateProgramWeek,
	enrolInProgram,
	getActiveUpNext,
	getEnrollment,
	getProgram,
	getProgramDayAt,
	getUpNext,
	listPrograms,
	moveProgramPrescription,
	removeProgramPrescription,
	resizeProgramWeeks,
	startProgramDay,
	suggestOneRmSnapshot,
	updateEnrollmentOneRm,
	updateProgram,
	updateProgramDay,
	updateProgramPrescription
} from './programs';
import {
	addExerciseToWorkout,
	addSet,
	createWorkout,
	deleteWorkout,
	finishWorkout,
	getWorkout,
	updateSet
} from './workouts';
import { createCustomExercise } from './exercises';
import { deleteUser } from './users';

let db: Db;
let userId: number;
let otherUserId: number;
let squatId: number;
let benchId: number;
let plankId: number;

beforeEach(() => {
	db = testDb();
	userId = makeUser(db, 'lifter');
	otherUserId = makeUser(db, 'intruder');
	squatId = exerciseIdBySlug(db, 'back-squat');
	benchId = exerciseIdBySlug(db, 'barbell-bench-press');
	plankId = exerciseIdBySlug(db, 'plank');
});

/** A 2-day, 2-week program with one squat prescription in week 1 day 1. */
function seedProgram(overrides: Parameters<typeof updateProgramPrescription>[2] = {}) {
	const programId = createProgram(
		userId,
		{ name: 'Test Block', daysPerWeek: 2, weeks: 2 },
		db
	);
	const day = getProgramDayAt(userId, programId, 1, 0, db)!;
	const itemId = addExerciseToProgramDay(userId, day.id, squatId, db)!;
	updateProgramPrescription(
		userId,
		itemId,
		{ targetSets: 3, targetRepsMin: 5, ...overrides },
		db
	);
	return { programId, dayId: day.id, itemId };
}

/** Log a heavy single so the exercise has an estimable 1RM. */
function logHeavySingle(weightKg: number, exerciseId = squatId, on = '2026-01-01') {
	const workoutId = createWorkout(userId, { performedOn: on }, db);
	const weId = addExerciseToWorkout(userId, workoutId, exerciseId, db)!;
	addSet(userId, weId, { weightKg, reps: 1 }, db);
	return workoutId;
}

describe('ownership is re-checked on every mutation', () => {
	it('refuses everything for someone else', () => {
		const { programId, dayId, itemId } = seedProgram();

		expect(getProgram(otherUserId, programId, db)).toBeNull();
		expect(getProgramDayAt(otherUserId, programId, 1, 0, db)).toBeNull();
		expect(updateProgram(otherUserId, programId, { name: 'Mine now' }, db)).toBe(false);
		expect(deleteProgram(otherUserId, programId, db)).toBe(false);
		expect(addProgramWeek(otherUserId, programId, db)).toBeNull();
		expect(duplicateProgramWeek(otherUserId, programId, 1, db)).toBeNull();
		expect(deleteProgramWeek(otherUserId, programId, 1, db)).toBe(false);
		expect(resizeProgramWeeks(otherUserId, programId, 1, db)).toBe(false);
		expect(updateProgramDay(otherUserId, dayId, { title: 'Theirs' }, db)).toBe(false);
		expect(addExerciseToProgramDay(otherUserId, dayId, benchId, db)).toBeNull();
		expect(updateProgramPrescription(otherUserId, itemId, { targetSets: 99 }, db)).toBe(false);
		expect(removeProgramPrescription(otherUserId, itemId, db)).toBe(false);
		expect(moveProgramPrescription(otherUserId, itemId, 1, db)).toBe(false);
		expect(enrolInProgram(otherUserId, programId, { startedOn: '2026-01-01', oneRms: [] }, db))
			.toBeNull();

		// Untouched.
		const program = getProgram(userId, programId, db)!;
		expect(program.name).toBe('Test Block');
		expect(program.weeks).toHaveLength(2);
		const day = getProgramDayAt(userId, programId, 1, 0, db)!;
		expect(day.title).toBeNull();
		expect(day.exercises).toHaveLength(1);
		expect(day.exercises[0].targetSets).toBe(3);
	});

	it('refuses to touch someone else’s run', () => {
		const { programId } = seedProgram();
		const enrollmentId = enrolInProgram(
			userId,
			programId,
			{ startedOn: '2026-01-01', oneRms: [{ exerciseId: squatId, oneRmKg: 140, isManual: false }] },
			db
		)!;

		expect(getEnrollment(otherUserId, enrollmentId, db)).toBeNull();
		expect(getUpNext(otherUserId, enrollmentId, db)).toBeNull();
		expect(updateEnrollmentOneRm(otherUserId, enrollmentId, squatId, 200, db)).toBe(false);
		expect(deleteEnrollment(otherUserId, enrollmentId, db)).toBe(false);
		expect(
			startProgramDay(otherUserId, enrollmentId, seedDayId(programId), {
				performedOn: '2026-01-02',
				units: 'metric'
			}, db).reason
		).toBe('not_found');

		expect(getEnrollment(userId, enrollmentId, db)!.oneRms[0].oneRmKg).toBe(140);
	});

	function seedDayId(programId: number): number {
		return getProgramDayAt(userId, programId, 1, 0, db)!.id;
	}
});

describe('a program is a grid of independent cells', () => {
	it('materialises the whole grid on creation', () => {
		const programId = createProgram(
			userId,
			{ name: 'PPL', daysPerWeek: 3, weeks: 4 },
			db
		);
		const program = getProgram(userId, programId, db)!;

		expect(program.weeks.map((w) => w.weekNumber)).toEqual([1, 2, 3, 4]);
		expect(program.weeks.every((w) => w.days.length === 3)).toBe(true);
		expect(program.weeks[0].days.map((d) => d.orderIndex)).toEqual([0, 1, 2]);
	});

	it('keeps weeks independent of each other', () => {
		const { programId } = seedProgram();
		const week2Day1 = getProgramDayAt(userId, programId, 2, 0, db)!;
		const itemId = addExerciseToProgramDay(userId, week2Day1.id, benchId, db)!;
		updateProgramPrescription(userId, itemId, { targetSets: 8, targetRepsMin: 1 }, db);

		// Editing week 2 leaves week 1 exactly as it was. This is the whole point
		// of authoring every cell separately.
		const week1 = getProgramDayAt(userId, programId, 1, 0, db)!;
		expect(week1.exercises).toHaveLength(1);
		expect(week1.exercises[0].exercise.id).toBe(squatId);
		expect(week1.exercises[0].targetSets).toBe(3);
	});

	it('counts weeks and exercises in the list view', () => {
		seedProgram();
		const [summary] = listPrograms(userId, db);
		expect(summary.weekCount).toBe(2);
		expect(summary.dayCount).toBe(4);
		expect(summary.exerciseCount).toBe(1);
		expect(summary.activeEnrollmentId).toBeNull();
	});
});

describe('duplicateProgramWeek', () => {
	it('copies every prescription field and inserts after the source', () => {
		const { programId } = seedProgram({
			intensityMode: 'percent_1rm',
			targetPercentOneRm: 75,
			targetRepsMax: 8,
			notes: 'belt on'
		});

		expect(duplicateProgramWeek(userId, programId, 1, db)).toBe(2);

		const program = getProgram(userId, programId, db)!;
		expect(program.weeks.map((w) => w.weekNumber)).toEqual([1, 2, 3]);

		const copy = getProgramDayAt(userId, programId, 2, 0, db)!;
		expect(copy.exercises).toHaveLength(1);
		expect(copy.exercises[0]).toMatchObject({
			targetSets: 3,
			targetRepsMin: 5,
			targetRepsMax: 8,
			intensityMode: 'percent_1rm',
			targetPercentOneRm: 75,
			notes: 'belt on'
		});
	});

	it('leaves the source untouched and gives the copy its own rows', () => {
		const { programId, itemId } = seedProgram();
		duplicateProgramWeek(userId, programId, 1, db);

		const copy = getProgramDayAt(userId, programId, 2, 0, db)!;
		expect(copy.exercises[0].id).not.toBe(itemId);

		// Editing the copy must not reach back into the original.
		updateProgramPrescription(userId, copy.exercises[0].id, { targetSets: 10 }, db);
		expect(getProgramDayAt(userId, programId, 1, 0, db)!.exercises[0].targetSets).toBe(3);
	});

	it('pushes the later weeks down rather than overwriting them', () => {
		const { programId } = seedProgram();
		const week2 = getProgramDayAt(userId, programId, 2, 0, db)!;
		updateProgramDay(userId, week2.id, { title: 'Originally week 2' }, db);

		duplicateProgramWeek(userId, programId, 1, db);

		expect(getProgramDayAt(userId, programId, 3, 0, db)!.title).toBe('Originally week 2');
	});
});

describe('reordering and deletion keep indexes dense', () => {
	it('renumbers prescriptions after a move', () => {
		const { programId, dayId } = seedProgram();
		addExerciseToProgramDay(userId, dayId, benchId, db);
		addExerciseToProgramDay(userId, dayId, plankId, db);

		const items = getProgramDayAt(userId, programId, 1, 0, db)!.exercises;
		expect(items.map((i) => i.orderIndex)).toEqual([0, 1, 2]);

		moveProgramPrescription(userId, items[2].id, -1, db);
		const after = getProgramDayAt(userId, programId, 1, 0, db)!.exercises;
		expect(after.map((i) => i.orderIndex)).toEqual([0, 1, 2]);
		expect(after.map((i) => i.exercise.id)).toEqual([squatId, plankId, benchId]);
	});

	it('refuses a move off either end', () => {
		const { programId, dayId, itemId } = seedProgram();
		addExerciseToProgramDay(userId, dayId, benchId, db);

		expect(moveProgramPrescription(userId, itemId, -1, db)).toBe(false);
		const last = getProgramDayAt(userId, programId, 1, 0, db)!.exercises[1];
		expect(moveProgramPrescription(userId, last.id, 1, db)).toBe(false);
	});

	it('closes the gap when a week is deleted', () => {
		const { programId } = seedProgram();
		addProgramWeek(userId, programId, db);
		const week3 = getProgramDayAt(userId, programId, 3, 0, db)!;
		updateProgramDay(userId, week3.id, { title: 'Last' }, db);

		expect(deleteProgramWeek(userId, programId, 2, db)).toBe(true);

		const program = getProgram(userId, programId, db)!;
		expect(program.weeks.map((w) => w.weekNumber)).toEqual([1, 2]);
		expect(getProgramDayAt(userId, programId, 2, 0, db)!.title).toBe('Last');
	});
});

describe('the reference max is fixed for the run', () => {
	it('does not reprice later weeks when you get stronger mid-block', () => {
		const { programId } = seedProgram({
			intensityMode: 'percent_1rm',
			targetPercentOneRm: 75
		});
		// Same prescription in week 2 so both weeks resolve the same way.
		const week2 = getProgramDayAt(userId, programId, 2, 0, db)!;
		const w2Item = addExerciseToProgramDay(userId, week2.id, squatId, db)!;
		updateProgramPrescription(
			userId,
			w2Item,
			{ targetSets: 1, targetRepsMin: 5, intensityMode: 'percent_1rm', targetPercentOneRm: 75 },
			db
		);

		const enrollmentId = enrolInProgram(
			userId,
			programId,
			{ startedOn: '2026-01-01', oneRms: [{ exerciseId: squatId, oneRmKg: 100, isManual: false }] },
			db
		)!;

		const first = startProgramDay(
			userId,
			enrollmentId,
			getProgramDayAt(userId, programId, 1, 0, db)!.id,
			{ performedOn: '2026-01-02', units: 'metric' },
			db
		).workoutId!;
		expect(getWorkout(userId, first, db)!.exercises[0].sets[0].targetWeightKg).toBe(75);

		// A big PR lands mid-block.
		logHeavySingle(140, squatId, '2026-01-03');

		const second = startProgramDay(
			userId,
			enrollmentId,
			week2.id,
			{ performedOn: '2026-01-05', units: 'metric' },
			db
		).workoutId!;
		// Still 75% of the max you agreed to at the start, not of today's.
		expect(getWorkout(userId, second, db)!.exercises[0].sets[0].targetWeightKg).toBe(75);
	});

	it('picks up the new estimate when the program is run again', () => {
		const { programId } = seedProgram({
			intensityMode: 'percent_1rm',
			targetPercentOneRm: 75
		});
		logHeavySingle(140);

		const [suggestion] = suggestOneRmSnapshot(userId, programId, 'epley', db);
		expect(suggestion.exerciseId).toBe(squatId);
		expect(suggestion.source).toBe('estimate');
		expect(suggestion.estimatedOneRmKg).toBe(140);
	});

	it('distinguishes no history from history it cannot estimate from', () => {
		const { programId } = seedProgram({
			intensityMode: 'percent_1rm',
			targetPercentOneRm: 75
		});

		expect(suggestOneRmSnapshot(userId, programId, 'epley', db)[0].source).toBe('none');

		// 20 reps is past the ceiling the formulas stay honest within.
		const workoutId = createWorkout(userId, { performedOn: '2026-01-01' }, db);
		const weId = addExerciseToWorkout(userId, workoutId, squatId, db)!;
		addSet(userId, weId, { weightKg: 60, reps: 20 }, db);

		const [suggestion] = suggestOneRmSnapshot(userId, programId, 'epley', db);
		expect(suggestion.source).toBe('high_reps_only');
		expect(suggestion.estimatedOneRmKg).toBeNull();
		expect(suggestion.basisReps).toBe(20);
	});

	it('ignores a reference for an exercise the program never prescribes', () => {
		const { programId } = seedProgram();
		const enrollmentId = enrolInProgram(
			userId,
			programId,
			{
				startedOn: '2026-01-01',
				oneRms: [{ exerciseId: benchId, oneRmKg: 999, isManual: true }]
			},
			db
		)!;

		expect(getEnrollment(userId, enrollmentId, db)!.oneRms).toEqual([]);
	});
});

describe('starting a workout from a program day', () => {
	function enrol(programId: number, oneRmKg = 100) {
		return enrolInProgram(
			userId,
			programId,
			{ startedOn: '2026-01-01', oneRms: [{ exerciseId: squatId, oneRmKg, isManual: false }] },
			db
		)!;
	}

	it('writes targets and leaves every measurement empty', () => {
		const { programId, dayId } = seedProgram({
			intensityMode: 'percent_1rm',
			targetPercentOneRm: 80
		});
		const enrollmentId = enrol(programId);

		const workoutId = startProgramDay(
			userId,
			enrollmentId,
			dayId,
			{ performedOn: '2026-01-02', units: 'metric' },
			db
		).workoutId!;

		const workout = getWorkout(userId, workoutId, db)!;
		expect(workout.exercises[0].sets).toHaveLength(3);
		for (const set of workout.exercises[0].sets) {
			expect(set.targetWeightKg).toBe(80);
			expect(set.targetPercentOneRm).toBe(80);
			expect(set.targetRepsMin).toBe(5);
			expect(set.weightKg).toBeNull();
			expect(set.reps).toBeNull();
			expect(set.isCompleted).toBe(false);
		}
	});

	it('hands back the session already in progress rather than a second one', () => {
		const { programId, dayId } = seedProgram();
		const enrollmentId = enrol(programId);

		const first = startProgramDay(
			userId,
			enrollmentId,
			dayId,
			{ performedOn: '2026-01-02', units: 'metric' },
			db
		);
		const again = startProgramDay(
			userId,
			enrollmentId,
			dayId,
			{ performedOn: '2026-01-02', units: 'metric' },
			db
		);

		expect(again.workoutId).toBe(first.workoutId);
		expect(again.reused).toBe(true);
	});

	it('refuses a run that has been closed', () => {
		const { programId, dayId } = seedProgram();
		const enrollmentId = enrol(programId);
		expect(
			startProgramDay(userId, enrollmentId, dayId, {
				performedOn: '2026-01-02',
				units: 'metric'
			}, db).workoutId
		).not.toBeNull();

		deleteEnrollment(userId, enrollmentId, db);
		expect(
			startProgramDay(userId, enrollmentId, dayId, {
				performedOn: '2026-01-03',
				units: 'metric'
			}, db).reason
		).toBe('not_found');
	});

	it('keeps the percentage when there is no reference to resolve it', () => {
		const { programId, dayId } = seedProgram({
			intensityMode: 'percent_1rm',
			targetPercentOneRm: 75
		});
		const enrollmentId = enrolInProgram(
			userId,
			programId,
			{ startedOn: '2026-01-01', oneRms: [] },
			db
		)!;

		const workoutId = startProgramDay(
			userId,
			enrollmentId,
			dayId,
			{ performedOn: '2026-01-02', units: 'metric' },
			db
		).workoutId!;

		const [set] = getWorkout(userId, workoutId, db)!.exercises[0].sets;
		expect(set.targetWeightKg).toBeNull();
		expect(set.targetPercentOneRm).toBe(75);
	});

	it('rounds a resolved weight to something loadable', () => {
		const { programId, dayId } = seedProgram({
			intensityMode: 'percent_1rm',
			targetPercentOneRm: 72
		});
		const enrollmentId = enrol(programId, 142.5);

		const workoutId = startProgramDay(
			userId,
			enrollmentId,
			dayId,
			{ performedOn: '2026-01-02', units: 'metric' },
			db
		).workoutId!;

		// 72% of 142.5 is 102.6, which is not a weight you can load.
		expect(getWorkout(userId, workoutId, db)!.exercises[0].sets[0].targetWeightKg).toBe(102.5);
	});
});

describe('up next', () => {
	function enrolTwoByTwo() {
		const { programId } = seedProgram();
		const enrollmentId = enrolInProgram(
			userId,
			programId,
			{ startedOn: '2026-01-01', oneRms: [] },
			db
		)!;
		return { programId, enrollmentId };
	}

	function start(programId: number, enrollmentId: number, week: number, day: number) {
		const cell = getProgramDayAt(userId, programId, week, day, db)!;
		return startProgramDay(
			userId,
			enrollmentId,
			cell.id,
			{ performedOn: '2026-01-02', units: 'metric' },
			db
		).workoutId!;
	}

	it('starts at the first cell', () => {
		const { enrollmentId } = enrolTwoByTwo();
		const next = getUpNext(userId, enrollmentId, db)!;
		expect(next.weekNumber).toBe(1);
		expect(next.dayNumber).toBe(1);
		expect(next.exerciseNames).toEqual(['Back Squat']);
		expect(next.totalDays).toBe(4);
		expect(next.doneDays).toBe(0);
	});

	it('offers to resume rather than advancing past an open session', () => {
		const { programId, enrollmentId } = enrolTwoByTwo();
		const workoutId = start(programId, enrollmentId, 1, 0);

		const next = getUpNext(userId, enrollmentId, db)!;
		// The single most likely bug in the feature: without this the dashboard
		// walks past the workout you are standing in the middle of.
		expect(next.dayNumber).toBe(1);
		expect(next.resumeWorkoutId).toBe(workoutId);
	});

	it('advances once the session is finished', () => {
		const { programId, enrollmentId } = enrolTwoByTwo();
		const workoutId = start(programId, enrollmentId, 1, 0);
		finishWorkout(userId, workoutId, db);

		const next = getUpNext(userId, enrollmentId, db)!;
		expect(next.dayNumber).toBe(2);
		expect(next.resumeWorkoutId).toBeNull();
		expect(next.doneDays).toBe(1);
	});

	it('walks back when a workout is deleted', () => {
		const { programId, enrollmentId } = enrolTwoByTwo();
		const workoutId = start(programId, enrollmentId, 1, 0);
		finishWorkout(userId, workoutId, db);
		expect(getUpNext(userId, enrollmentId, db)!.dayNumber).toBe(2);

		deleteWorkout(userId, workoutId, db);

		// Proof there is no stored cursor to go stale.
		expect(getUpNext(userId, enrollmentId, db)!.dayNumber).toBe(1);
	});

	it('is null once every cell is finished', () => {
		const { programId, enrollmentId } = enrolTwoByTwo();
		for (const [week, day] of [
			[1, 0],
			[1, 1],
			[2, 0],
			[2, 1]
		]) {
			finishWorkout(userId, start(programId, enrollmentId, week, day), db);
		}

		expect(getUpNext(userId, enrollmentId, db)).toBeNull();
	});

	it('tracks two concurrent runs separately', () => {
		const { programId } = seedProgram();
		const a = enrolInProgram(userId, programId, { startedOn: '2026-01-01', oneRms: [] }, db)!;
		const b = enrolInProgram(userId, programId, { startedOn: '2026-02-01', oneRms: [] }, db)!;

		const cell = getProgramDayAt(userId, programId, 1, 0, db)!;
		finishWorkout(
			userId,
			startProgramDay(userId, a, cell.id, { performedOn: '2026-01-02', units: 'metric' }, db)
				.workoutId!,
			db
		);

		expect(getUpNext(userId, a, db)!.dayNumber).toBe(2);
		expect(getUpNext(userId, b, db)!.dayNumber).toBe(1);
	});

	it('finds the live run for the dashboard', () => {
		const { enrollmentId } = enrolTwoByTwo();
		expect(getActiveUpNext(userId, db)!.enrollmentId).toBe(enrollmentId);
		expect(getActiveUpNext(otherUserId, db)).toBeNull();
	});
});

describe('finishing a program session prunes what was not done', () => {
	it('keeps the confirmed sets and drops the rest', () => {
		const { programId, dayId } = seedProgram();
		const enrollmentId = enrolInProgram(
			userId,
			programId,
			{ startedOn: '2026-01-01', oneRms: [] },
			db
		)!;
		const workoutId = startProgramDay(
			userId,
			enrollmentId,
			dayId,
			{ performedOn: '2026-01-02', units: 'metric' },
			db
		).workoutId!;

		const sets = getWorkout(userId, workoutId, db)!.exercises[0].sets;
		updateSet(userId, sets[0].id, { weightKg: 100, reps: 5, isCompleted: true } as never, db);
		updateSet(userId, sets[1].id, { weightKg: 100, reps: 5, isCompleted: true } as never, db);

		finishWorkout(userId, workoutId, db);

		const after = getWorkout(userId, workoutId, db)!.exercises[0].sets;
		expect(after).toHaveLength(2);
		expect(after.every((s) => s.isCompleted)).toBe(true);
	});
});

describe('deleting a plan never costs you the sessions logged under it', () => {
	function startAndLog() {
		const { programId, dayId } = seedProgram();
		const enrollmentId = enrolInProgram(
			userId,
			programId,
			{ startedOn: '2026-01-01', oneRms: [{ exerciseId: squatId, oneRmKg: 100, isManual: false }] },
			db
		)!;
		const workoutId = startProgramDay(
			userId,
			enrollmentId,
			dayId,
			{ performedOn: '2026-01-02', units: 'metric' },
			db
		).workoutId!;
		const [set] = getWorkout(userId, workoutId, db)!.exercises[0].sets;
		updateSet(userId, set.id, { weightKg: 100, reps: 5, isCompleted: true } as never, db);
		return { programId, enrollmentId, workoutId };
	}

	it('survives deleting the program', () => {
		const { programId, workoutId } = startAndLog();

		expect(deleteProgram(userId, programId, db)).toBe(true);

		const workout = getWorkout(userId, workoutId, db)!;
		expect(workout).not.toBeNull();
		const [set] = workout.exercises[0].sets;
		expect(set.weightKg).toBe(100);
		// The prescription travelled with the set, so the day still says what it
		// asked for even though the plan is gone.
		expect(set.targetRepsMin).toBe(5);
	});

	it('survives abandoning the run', () => {
		const { enrollmentId, workoutId } = startAndLog();

		expect(deleteEnrollment(userId, enrollmentId, db)).toBe(true);
		expect(getWorkout(userId, workoutId, db)!.exercises[0].sets[0].weightKg).toBe(100);
	});

	it('survives deleting the week out from under it', () => {
		const { programId, workoutId } = startAndLog();

		expect(deleteProgramWeek(userId, programId, 1, db)).toBe(true);
		expect(getWorkout(userId, workoutId, db)!.exercises[0].sets[0].weightKg).toBe(100);
	});

	it('survives shrinking the program', () => {
		const { programId, workoutId } = startAndLog();

		expect(resizeProgramWeeks(userId, programId, 1, db)).toBe(true);
		expect(getWorkout(userId, workoutId, db)).not.toBeNull();
	});
});

describe('deleting the account', () => {
	it('works when a custom exercise is used in a program', () => {
		const customId = createCustomExercise(
			userId,
			{
				name: 'Belt Squat',
				kind: 'weight_reps',
				primaryMuscle: 'quads',
				equipment: 'machine',
				notes: null
			},
			db
		).id;
		const programId = createProgram(userId, { name: 'Block', daysPerWeek: 1, weeks: 1 }, db);
		const day = getProgramDayAt(userId, programId, 1, 0, db)!;
		addExerciseToProgramDay(userId, day.id, customId, db);
		enrolInProgram(
			userId,
			programId,
			{ startedOn: '2026-01-01', oneRms: [{ exerciseId: customId, oneRmKg: 100, isManual: true }] },
			db
		);

		// Both the prescription and the snapshotted max hold `restrict` references
		// to the exercise, so leaving them to the cascade aborts the whole delete.
		expect(() => deleteUser(userId, db)).not.toThrow();
	});
});

describe('a program never constrains logging', () => {
	it('leaves freeform workouts alone and out of the count', () => {
		const { programId } = seedProgram();
		const enrollmentId = enrolInProgram(
			userId,
			programId,
			{ startedOn: '2026-01-01', oneRms: [] },
			db
		)!;

		const before = getUpNext(userId, enrollmentId, db)!;

		const workoutId = createWorkout(userId, { performedOn: '2026-01-02' }, db);
		const weId = addExerciseToWorkout(userId, workoutId, benchId, db)!;
		addSet(userId, weId, { weightKg: 80, reps: 5 }, db);
		finishWorkout(userId, workoutId, db);

		const after = getUpNext(userId, enrollmentId, db)!;
		expect(after.programDayId).toBe(before.programDayId);
		expect(after.doneDays).toBe(0);

		// And the freeform session carries no plan at all.
		const [set] = getWorkout(userId, workoutId, db)!.exercises[0].sets;
		expect(set.targetRepsMin).toBeNull();
		expect(set.weightKg).toBe(80);
	});
});

describe('percent_1rm is only offered where a max means something', () => {
	it('refuses it on a timed hold', () => {
		const { programId, dayId } = seedProgram();
		const plankItem = addExerciseToProgramDay(userId, dayId, plankId, db)!;

		expect(
			updateProgramPrescription(
				userId,
				plankItem,
				{ intensityMode: 'percent_1rm', targetPercentOneRm: 75 },
				db
			)
		).toBe(false);

		const item = getProgramDayAt(userId, programId, 1, 0, db)!.exercises.find(
			(e) => e.id === plankItem
		)!;
		expect(item.intensityMode).toBeNull();
	});

	it('allows it on a barbell lift', () => {
		const { itemId } = seedProgram();
		expect(
			updateProgramPrescription(
				userId,
				itemId,
				{ intensityMode: 'percent_1rm', targetPercentOneRm: 75 },
				db
			)
		).toBe(true);
	});
});
