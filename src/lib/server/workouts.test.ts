import { beforeEach, describe, expect, it } from 'vitest';
import { exerciseIdBySlug, makeUser, testDb } from './test-helpers';
import type { Db } from './db';
import {
	addExerciseToWorkout,
	addSet,
	countWorkouts,
	createWorkout,
	deleteSet,
	deleteWorkout,
	finishWorkout,
	getPreviousSets,
	getWorkout,
	listWorkoutSummaries,
	moveWorkoutExercise,
	removeWorkoutExercise,
	repeatLastSet,
	updateSet,
	updateWorkout
} from './workouts';

let db: Db;
let userId: number;
let otherUserId: number;
let squatId: number;
let benchId: number;
let runId: number;

beforeEach(() => {
	db = testDb();
	userId = makeUser(db, 'lifter');
	otherUserId = makeUser(db, 'intruder');
	squatId = exerciseIdBySlug(db, 'back-squat');
	benchId = exerciseIdBySlug(db, 'barbell-bench-press');
	runId = exerciseIdBySlug(db, 'running');
});

/** Build a workout with one exercise and the given sets. */
function seedWorkout(
	date: string,
	exerciseId: number,
	sets: Array<{ weightKg?: number; reps?: number; isWarmup?: boolean; distanceM?: number; durationS?: number }>,
	owner = userId
) {
	const workoutId = createWorkout(owner, { performedOn: date }, db);
	const workoutExerciseId = addExerciseToWorkout(owner, workoutId, exerciseId, db)!;
	for (const set of sets) {
		addSet(
			owner,
			workoutExerciseId,
			{
				weightKg: set.weightKg ?? null,
				reps: set.reps ?? null,
				rpe: null,
				distanceM: set.distanceM ?? null,
				durationS: set.durationS ?? null,
				isWarmup: set.isWarmup ?? false
			},
			db
		);
	}
	return { workoutId, workoutExerciseId };
}

describe('ownership', () => {
	it('does not return another user’s workout', () => {
		const { workoutId } = seedWorkout('2026-01-05', squatId, [{ weightKg: 100, reps: 5 }]);
		expect(getWorkout(userId, workoutId, db)).not.toBeNull();
		expect(getWorkout(otherUserId, workoutId, db)).toBeNull();
	});

	it('refuses cross-user mutation of a workout', () => {
		const { workoutId } = seedWorkout('2026-01-05', squatId, [{ weightKg: 100, reps: 5 }]);

		expect(updateWorkout(otherUserId, workoutId, { title: 'stolen' }, db)).toBe(false);
		expect(deleteWorkout(otherUserId, workoutId, db)).toBe(false);
		expect(finishWorkout(otherUserId, workoutId, db)).toBe(false);
		expect(addExerciseToWorkout(otherUserId, workoutId, benchId, db)).toBeNull();

		// Untouched.
		expect(getWorkout(userId, workoutId, db)!.title).toBeNull();
		expect(countWorkouts(userId, db)).toBe(1);
	});

	it('refuses cross-user mutation of sets and exercises', () => {
		const { workoutExerciseId } = seedWorkout('2026-01-05', squatId, [
			{ weightKg: 100, reps: 5 }
		]);
		const setId = getWorkout(userId, 1, db)!.exercises[0].sets[0].id;

		expect(addSet(otherUserId, workoutExerciseId, {}, db)).toBeNull();
		expect(repeatLastSet(otherUserId, workoutExerciseId, db)).toBeNull();
		expect(removeWorkoutExercise(otherUserId, workoutExerciseId, db)).toBe(false);
		expect(moveWorkoutExercise(otherUserId, workoutExerciseId, 1, db)).toBe(false);
		expect(updateSet(otherUserId, setId, { reps: 999 }, db)).toBe(false);
		expect(deleteSet(otherUserId, setId, db)).toBe(false);

		const workout = getWorkout(userId, 1, db)!;
		expect(workout.exercises).toHaveLength(1);
		expect(workout.exercises[0].sets).toHaveLength(1);
		expect(workout.exercises[0].sets[0].reps).toBe(5);
	});
});

describe('sets', () => {
	it('appends sets in order', () => {
		const { workoutId } = seedWorkout('2026-01-05', squatId, [
			{ weightKg: 60, reps: 5, isWarmup: true },
			{ weightKg: 100, reps: 5 },
			{ weightKg: 100, reps: 5 }
		]);

		const sets = getWorkout(userId, workoutId, db)!.exercises[0].sets;
		expect(sets.map((s) => s.orderIndex)).toEqual([0, 1, 2]);
		expect(sets[0].isWarmup).toBe(true);
	});

	it('repeats the last set including its warm-up flag', () => {
		const { workoutId, workoutExerciseId } = seedWorkout('2026-01-05', squatId, [
			{ weightKg: 100, reps: 5 }
		]);

		repeatLastSet(userId, workoutExerciseId, db);
		const sets = getWorkout(userId, workoutId, db)!.exercises[0].sets;

		expect(sets).toHaveLength(2);
		expect(sets[1].weightKg).toBe(100);
		expect(sets[1].reps).toBe(5);
	});

	it('starts a blank set when there is nothing to repeat', () => {
		const workoutId = createWorkout(userId, { performedOn: '2026-01-05' }, db);
		const weId = addExerciseToWorkout(userId, workoutId, squatId, db)!;

		repeatLastSet(userId, weId, db);
		const sets = getWorkout(userId, workoutId, db)!.exercises[0].sets;

		expect(sets).toHaveLength(1);
		expect(sets[0].weightKg).toBeNull();
	});

	it('deleting a set leaves the others intact', () => {
		const { workoutId } = seedWorkout('2026-01-05', squatId, [
			{ weightKg: 100, reps: 5 },
			{ weightKg: 110, reps: 3 }
		]);
		const sets = getWorkout(userId, workoutId, db)!.exercises[0].sets;

		expect(deleteSet(userId, sets[0].id, db)).toBe(true);
		const remaining = getWorkout(userId, workoutId, db)!.exercises[0].sets;
		expect(remaining).toHaveLength(1);
		expect(remaining[0].weightKg).toBe(110);
	});
});

describe('exercise ordering', () => {
	it('moves an exercise and renumbers densely', () => {
		const workoutId = createWorkout(userId, { performedOn: '2026-01-05' }, db);
		const a = addExerciseToWorkout(userId, workoutId, squatId, db)!;
		const b = addExerciseToWorkout(userId, workoutId, benchId, db)!;
		const c = addExerciseToWorkout(userId, workoutId, runId, db)!;

		expect(moveWorkoutExercise(userId, c, -1, db)).toBe(true);

		const order = getWorkout(userId, workoutId, db)!.exercises.map((e) => e.id);
		expect(order).toEqual([a, c, b]);
		expect(getWorkout(userId, workoutId, db)!.exercises.map((e) => e.orderIndex)).toEqual([
			0, 1, 2
		]);
	});

	it('refuses to move past either end', () => {
		const workoutId = createWorkout(userId, { performedOn: '2026-01-05' }, db);
		const a = addExerciseToWorkout(userId, workoutId, squatId, db)!;
		addExerciseToWorkout(userId, workoutId, benchId, db);

		expect(moveWorkoutExercise(userId, a, -1, db)).toBe(false);
	});

	it('removing an exercise removes its sets', () => {
		const { workoutId, workoutExerciseId } = seedWorkout('2026-01-05', squatId, [
			{ weightKg: 100, reps: 5 }
		]);

		expect(removeWorkoutExercise(userId, workoutExerciseId, db)).toBe(true);
		expect(getWorkout(userId, workoutId, db)!.exercises).toHaveLength(0);
	});
});

describe('listWorkoutSummaries', () => {
	it('excludes warm-up sets from volume but counts them as sets', () => {
		seedWorkout('2026-01-05', squatId, [
			{ weightKg: 60, reps: 5, isWarmup: true },
			{ weightKg: 100, reps: 5 },
			{ weightKg: 100, reps: 5 }
		]);

		const [summary] = listWorkoutSummaries(userId, {}, db);
		expect(summary.setCount).toBe(3);
		expect(summary.totalVolumeKg).toBe(1000);
	});

	it('sums cardio distance and duration', () => {
		seedWorkout('2026-01-06', runId, [{ distanceM: 5000, durationS: 1500 }]);

		const [summary] = listWorkoutSummaries(userId, {}, db);
		expect(summary.totalDistanceM).toBe(5000);
		expect(summary.totalDurationS).toBe(1500);
	});

	it('lists newest first and filters by date range', () => {
		seedWorkout('2026-01-01', squatId, [{ weightKg: 100, reps: 5 }]);
		seedWorkout('2026-01-10', benchId, [{ weightKg: 80, reps: 5 }]);
		seedWorkout('2026-02-01', runId, [{ distanceM: 3000, durationS: 900 }]);

		expect(listWorkoutSummaries(userId, {}, db).map((w) => w.performedOn)).toEqual([
			'2026-02-01',
			'2026-01-10',
			'2026-01-01'
		]);

		expect(
			listWorkoutSummaries(userId, { from: '2026-01-05', to: '2026-01-31' }, db).map(
				(w) => w.performedOn
			)
		).toEqual(['2026-01-10']);
	});

	it('never leaks another user’s workouts', () => {
		seedWorkout('2026-01-05', squatId, [{ weightKg: 100, reps: 5 }]);
		seedWorkout('2026-01-06', benchId, [{ weightKg: 80, reps: 5 }], otherUserId);

		expect(listWorkoutSummaries(userId, {}, db)).toHaveLength(1);
		expect(listWorkoutSummaries(otherUserId, {}, db)).toHaveLength(1);
	});

	it('reports a workout with no exercises rather than dropping it', () => {
		createWorkout(userId, { performedOn: '2026-01-05', title: 'Planned' }, db);

		const [summary] = listWorkoutSummaries(userId, {}, db);
		expect(summary.title).toBe('Planned');
		expect(summary.exerciseCount).toBe(0);
		expect(summary.setCount).toBe(0);
	});
});

describe('getPreviousSets', () => {
	it('returns the sets from the most recent other session', () => {
		seedWorkout('2026-01-01', squatId, [{ weightKg: 90, reps: 5 }]);
		seedWorkout('2026-01-08', squatId, [{ weightKg: 100, reps: 5 }]);
		const { workoutId: current } = seedWorkout('2026-01-15', squatId, []);

		const previous = getPreviousSets(userId, squatId, current, db);
		expect(previous).toHaveLength(1);
		expect(previous[0].weightKg).toBe(100);
	});

	it('returns nothing when the exercise is new to the user', () => {
		const { workoutId } = seedWorkout('2026-01-15', squatId, []);
		expect(getPreviousSets(userId, benchId, workoutId, db)).toEqual([]);
	});
});

describe('finishWorkout', () => {
	it('marks every set complete', () => {
		const { workoutId, workoutExerciseId } = seedWorkout('2026-01-05', squatId, []);
		addSet(userId, workoutExerciseId, { reps: 5, weightKg: 100 }, db);
		const setId = getWorkout(userId, workoutId, db)!.exercises[0].sets[0].id;
		updateSet(userId, setId, { isCompleted: false } as never, db);

		finishWorkout(userId, workoutId, db);

		const workout = getWorkout(userId, workoutId, db)!;
		expect(workout.endedAt).not.toBeNull();
		expect(workout.exercises[0].sets.every((s) => s.isCompleted)).toBe(true);
	});
});

describe('deleteWorkout', () => {
	it('cascades to exercises and sets', () => {
		const { workoutId } = seedWorkout('2026-01-05', squatId, [{ weightKg: 100, reps: 5 }]);

		expect(deleteWorkout(userId, workoutId, db)).toBe(true);
		expect(countWorkouts(userId, db)).toBe(0);
		expect(getWorkout(userId, workoutId, db)).toBeNull();
	});
});
