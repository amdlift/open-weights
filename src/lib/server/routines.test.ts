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
import { addExerciseToWorkout, addSet, createWorkout, getWorkout } from './workouts';
import { createWorkoutFromRoutine } from './workouts';

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

describe('createWorkoutFromRoutine with a rep range', () => {
	it('prefills the bottom of the range', () => {
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
		expect(sets.map((s) => s.reps)).toEqual([8, 8, 8]);
		// No weight comes from the routine — the load moves over time, so the
		// user reads it off the bar rather than off a months-old plan.
		expect(sets.map((s) => s.weightKg)).toEqual([null, null, null]);
		// RPE is an outcome, not an instruction: prefilling it would record an
		// effort the user never actually reported.
		expect(sets.map((s) => s.rpe)).toEqual([null, null, null]);
		// Prefilled sets are a suggestion until the user confirms them.
		expect(sets.every((s) => !s.isCompleted)).toBe(true);
	});

	it('prefills an exact target unchanged', () => {
		const routineId = createRoutine(userId, { name: 'Strength' }, db);
		const itemId = addExerciseToRoutine(userId, routineId, squatId, db)!;
		updateRoutineItem(userId, itemId, { targetSets: 2, targetRepsMin: 5 }, db);

		const workoutId = createWorkoutFromRoutine(userId, routineId, '2026-08-06', db)!;
		expect(
			getWorkout(userId, workoutId, db)!.exercises[0].sets.map((s) => s.reps)
		).toEqual([5, 5]);
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
