import { beforeEach, describe, expect, it } from 'vitest';
import { formatRepTarget } from '$lib/constants';
import type { Db } from './db';
import { exerciseIdBySlug, makeUser, testDb } from './test-helpers';
import {
	addExerciseToRoutine,
	createRoutine,
	createRoutineFromWorkout,
	getRoutine,
	listRoutines,
	normaliseRepTarget,
	updateRoutineItem
} from './routines';
import {
	addExerciseToWorkout,
	addSet,
	createWorkout,
	createWorkoutFromRoutine,
	finishWorkout,
	getWorkout,
	updateSet
} from './workouts';

let db: Db;
let userId: number;
let otherUserId: number;
let squatId: number;
let runId: number;

beforeEach(() => {
	db = testDb();
	userId = makeUser(db, 'lifter');
	otherUserId = makeUser(db, 'intruder');
	squatId = exerciseIdBySlug(db, 'back-squat');
	runId = exerciseIdBySlug(db, 'running');
});

describe('normaliseRepTarget', () => {
	it('keeps a genuine range as given', () => {
		expect(normaliseRepTarget(8, 12)).toEqual({ min: 8, max: 12 });
	});

	it('collapses an equal pair to an exact target', () => {
		// Storing 5–5 would force every display and prefill path to special-case it.
		expect(normaliseRepTarget(5, 5)).toEqual({ min: 5, max: null });
	});

	it('swaps a range entered backwards', () => {
		expect(normaliseRepTarget(12, 8)).toEqual({ min: 8, max: 12 });
	});

	it('treats an upper bound with no lower bound as the exact target', () => {
		expect(normaliseRepTarget(null, 10)).toEqual({ min: 10, max: null });
	});

	it('passes through an exact target', () => {
		expect(normaliseRepTarget(5, null)).toEqual({ min: 5, max: null });
	});

	it('passes through no target at all', () => {
		expect(normaliseRepTarget(null, null)).toEqual({ min: null, max: null });
	});
});

describe('formatRepTarget', () => {
	it('renders a range with an en dash', () => {
		expect(formatRepTarget(8, 12)).toBe('8–12');
	});

	it('renders an exact target as a single number', () => {
		expect(formatRepTarget(5, null)).toBe('5');
		expect(formatRepTarget(5, 5)).toBe('5');
	});

	it('renders an absent target as a dash', () => {
		expect(formatRepTarget(null, null)).toBe('—');
	});

	it('handles an upper bound alone', () => {
		expect(formatRepTarget(null, 10)).toBe('up to 10');
	});
});

describe('rep range round trip', () => {
	it('stores and reads back a range', () => {
		const routineId = createRoutine(userId, { name: 'Upper A' }, db);
		const itemId = addExerciseToRoutine(userId, routineId, squatId, db)!;

		expect(
			updateRoutineItem(userId, itemId, { targetRepsMin: 8, targetRepsMax: 12 }, db)
		).toBe(true);

		const [item] = getRoutine(userId, routineId, db)!.exercises;
		expect(item.targetRepsMin).toBe(8);
		expect(item.targetRepsMax).toBe(12);
	});

	it('surfaces the range in the routine list', () => {
		const routineId = createRoutine(userId, { name: 'Upper A' }, db);
		const itemId = addExerciseToRoutine(userId, routineId, squatId, db)!;
		updateRoutineItem(userId, itemId, { targetSets: 3, targetRepsMin: 8, targetRepsMax: 12 }, db);

		const [summary] = listRoutines(userId, db);
		expect(summary.plan).toEqual([
			{
				name: 'Back Squat',
				targetSets: 3,
				targetRepsMin: 8,
				targetRepsMax: 12,
				targetRpe: null
			}
		]);
	});

	it('refuses a cross-user target edit', () => {
		const routineId = createRoutine(userId, { name: 'Upper A' }, db);
		const itemId = addExerciseToRoutine(userId, routineId, squatId, db)!;

		expect(
			updateRoutineItem(otherUserId, itemId, { targetRepsMin: 1, targetRepsMax: 2 }, db)
		).toBe(false);
		expect(getRoutine(userId, routineId, db)!.exercises[0].targetRepsMin).toBeNull();
	});
});

describe('createWorkoutFromRoutine writes a plan, not a record', () => {
	it('carries the whole rep range as a target', () => {
		const routineId = createRoutine(userId, { name: 'Upper A' }, db);
		const itemId = addExerciseToRoutine(userId, routineId, squatId, db)!;
		updateRoutineItem(
			userId,
			itemId,
			{ targetSets: 3, targetRepsMin: 8, targetRepsMax: 12, targetRpe: 8 },
			db
		);

		const workoutId = createWorkoutFromRoutine(userId, routineId, '2026-08-06', db)!;
		const sets = getWorkout(userId, workoutId, db)!.exercises[0].sets;

		expect(sets).toHaveLength(3);
		// Nothing is measured until the user says so. Writing the target into
		// `reps` would record three sets of eight that nobody performed.
		expect(sets.map((s) => s.reps)).toEqual([null, null, null]);
		expect(sets.map((s) => s.targetRepsMin)).toEqual([8, 8, 8]);
		// The top of the range survives now; it used to be dropped on the way in.
		expect(sets.map((s) => s.targetRepsMax)).toEqual([12, 12, 12]);
		// No weight comes from the routine — the load moves over time, so the
		// user reads it off the bar rather than off a months-old plan.
		expect(sets.map((s) => s.weightKg)).toEqual([null, null, null]);
		expect(sets.map((s) => s.targetWeightKg)).toEqual([null, null, null]);
		// RPE is an outcome, not an instruction: prefilling it would record an
		// effort the user never actually reported.
		expect(sets.map((s) => s.rpe)).toEqual([null, null, null]);
		// But the instruction itself is kept, where it used to vanish entirely.
		expect(sets.map((s) => s.targetRpe)).toEqual([8, 8, 8]);
		// Prefilled sets are a suggestion until the user confirms them.
		expect(sets.every((s) => !s.isCompleted)).toBe(true);
	});

	it('carries an exact target unchanged', () => {
		const routineId = createRoutine(userId, { name: 'Strength' }, db);
		const itemId = addExerciseToRoutine(userId, routineId, squatId, db)!;
		updateRoutineItem(userId, itemId, { targetSets: 2, targetRepsMin: 5 }, db);

		const workoutId = createWorkoutFromRoutine(userId, routineId, '2026-08-06', db)!;
		const sets = getWorkout(userId, workoutId, db)!.exercises[0].sets;
		expect(sets.map((s) => s.targetRepsMin)).toEqual([5, 5]);
		expect(sets.map((s) => s.targetRepsMax)).toEqual([null, null]);
	});

	it('prescribes cardio distance and time as targets too', () => {
		const routineId = createRoutine(userId, { name: 'Conditioning' }, db);
		const itemId = addExerciseToRoutine(userId, routineId, runId, db)!;
		updateRoutineItem(
			userId,
			itemId,
			{ targetSets: 1, targetDistanceM: 5000, targetDurationS: 1500 },
			db
		);

		const workoutId = createWorkoutFromRoutine(userId, routineId, '2026-08-06', db)!;
		const [set] = getWorkout(userId, workoutId, db)!.exercises[0].sets;

		// These used to be written straight into the measurement columns, which
		// logged a 5 km run the moment you opened the session.
		expect(set.distanceM).toBeNull();
		expect(set.durationS).toBeNull();
		expect(set.targetDistanceM).toBe(5000);
		expect(set.targetDurationS).toBe(1500);
	});
});

describe('finishing drops the prescribed sets nobody did', () => {
	function startThreeSets() {
		const routineId = createRoutine(userId, { name: 'Upper A' }, db);
		const itemId = addExerciseToRoutine(userId, routineId, squatId, db)!;
		updateRoutineItem(userId, itemId, { targetSets: 3, targetRepsMin: 5 }, db);
		const workoutId = createWorkoutFromRoutine(userId, routineId, '2026-08-06', db)!;
		return { workoutId, sets: getWorkout(userId, workoutId, db)!.exercises[0].sets };
	}

	it('keeps what was performed and drops what was not', () => {
		const { workoutId, sets } = startThreeSets();
		updateSet(userId, sets[0].id, { weightKg: 100, reps: 5, isCompleted: true } as never, db);
		updateSet(userId, sets[1].id, { weightKg: 100, reps: 4, isCompleted: true } as never, db);

		finishWorkout(userId, workoutId, db);

		const after = getWorkout(userId, workoutId, db)!.exercises[0].sets;
		expect(after).toHaveLength(2);
		expect(after.map((s) => s.reps)).toEqual([5, 4]);
		expect(after.every((s) => s.isCompleted)).toBe(true);
	});

	it('keeps a set with numbers in it that was never ticked off', () => {
		const { workoutId, sets } = startThreeSets();
		// Typed but not confirmed. The numbers are the record; the tick is only a
		// shortcut for typing them.
		updateSet(userId, sets[0].id, { weightKg: 100, reps: 5 } as never, db);
		updateSet(userId, sets[1].id, { isCompleted: false } as never, db);
		updateSet(userId, sets[2].id, { isCompleted: false } as never, db);

		finishWorkout(userId, workoutId, db);

		const after = getWorkout(userId, workoutId, db)!.exercises[0].sets;
		expect(after).toHaveLength(1);
		expect(after[0].weightKg).toBe(100);
	});

	it('leaves an untouched routine workout with nothing to show for it', () => {
		const { workoutId } = startThreeSets();

		finishWorkout(userId, workoutId, db);

		// Opening a session and walking out is not three sets of five. The
		// exercise stays, so the day still says what was planned.
		expect(getWorkout(userId, workoutId, db)!.exercises[0].sets).toEqual([]);
	});
});

describe('createRoutineFromWorkout derives the range that was performed', () => {
	function logWorkout(reps: number[], exerciseId = squatId) {
		const workoutId = createWorkout(userId, { performedOn: '2026-08-06' }, db);
		const weId = addExerciseToWorkout(userId, workoutId, exerciseId, db)!;
		for (const r of reps) {
			addSet(
				userId,
				weId,
				{ weightKg: 100, reps: r, rpe: null, distanceM: null, durationS: null, isWarmup: false },
				db
			);
		}
		return workoutId;
	}

	it('turns a descending set scheme into a range', () => {
		const workoutId = logWorkout([12, 10, 8]);
		const routineId = createRoutineFromWorkout(userId, workoutId, 'Hypertrophy', db)!;

		const [item] = getRoutine(userId, routineId, db)!.exercises;
		expect(item.targetRepsMin).toBe(8);
		expect(item.targetRepsMax).toBe(12);
		expect(item.targetSets).toBe(3);
	});

	it('records straight sets as an exact target, not a range of one', () => {
		const workoutId = logWorkout([5, 5, 5]);
		const routineId = createRoutineFromWorkout(userId, workoutId, 'Strength', db)!;

		const [item] = getRoutine(userId, routineId, db)!.exercises;
		expect(item.targetRepsMin).toBe(5);
		expect(item.targetRepsMax).toBeNull();
	});

	it('ignores warm-ups when deriving the range', () => {
		const workoutId = createWorkout(userId, { performedOn: '2026-08-06' }, db);
		const weId = addExerciseToWorkout(userId, workoutId, squatId, db)!;
		// A 2-rep warm-up single must not drag the target range down to 2.
		for (const set of [
			{ reps: 2, isWarmup: true },
			{ reps: 10, isWarmup: false },
			{ reps: 8, isWarmup: false }
		]) {
			addSet(
				userId,
				weId,
				{
					weightKg: 100,
					reps: set.reps,
					rpe: null,
					distanceM: null,
					durationS: null,
					isWarmup: set.isWarmup
				},
				db
			);
		}

		const routineId = createRoutineFromWorkout(userId, workoutId, 'Hypertrophy', db)!;
		const [item] = getRoutine(userId, routineId, db)!.exercises;
		expect(item.targetRepsMin).toBe(8);
		expect(item.targetRepsMax).toBe(10);
	});

	it('carries the hardest working set as the RPE target', () => {
		const workoutId = createWorkout(userId, { performedOn: '2026-08-06' }, db);
		const weId = addExerciseToWorkout(userId, workoutId, squatId, db)!;
		for (const set of [
			{ rpe: 10, isWarmup: true }, // a warm-up cannot set the target
			{ rpe: 7, isWarmup: false },
			{ rpe: 8.5, isWarmup: false }
		]) {
			addSet(
				userId,
				weId,
				{
					weightKg: 100,
					reps: 5,
					rpe: set.rpe,
					distanceM: null,
					durationS: null,
					isWarmup: set.isWarmup
				},
				db
			);
		}

		const routineId = createRoutineFromWorkout(userId, workoutId, 'Strength', db)!;
		expect(getRoutine(userId, routineId, db)!.exercises[0].targetRpe).toBe(8.5);
	});

	it('leaves the RPE target empty when none was recorded', () => {
		const workoutId = logWorkout([5, 5]);
		const routineId = createRoutineFromWorkout(userId, workoutId, 'Strength', db)!;
		expect(getRoutine(userId, routineId, db)!.exercises[0].targetRpe).toBeNull();
	});

	it('leaves the rep target empty for cardio', () => {
		const workoutId = createWorkout(userId, { performedOn: '2026-08-06' }, db);
		const weId = addExerciseToWorkout(userId, workoutId, runId, db)!;
		addSet(
			userId,
			weId,
			{ weightKg: null, reps: null, rpe: null, distanceM: 5000, durationS: 1500, isWarmup: false },
			db
		);

		const routineId = createRoutineFromWorkout(userId, workoutId, 'Easy run', db)!;
		const [item] = getRoutine(userId, routineId, db)!.exercises;
		expect(item.targetRepsMin).toBeNull();
		expect(item.targetRepsMax).toBeNull();
		expect(item.targetDistanceM).toBe(5000);
	});
});
