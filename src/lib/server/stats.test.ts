import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from './db/schema';
import type { Db } from './db';
import { exerciseIdBySlug, makeUser, testDb } from './test-helpers';
import {
	getAllRecords,
	getBodyweightSeries,
	getExerciseRecords,
	getExerciseSessions,
	getLatestBodyweight,
	getOneRmSeries,
	getPeriodTotals,
	getWeeklyVolumeByMuscle,
	movingAverage,
	suggestPinnedExercises
} from './stats';
import { addExerciseToWorkout, addSet, createWorkout } from './workouts';

let db: Db;
let userId: number;
let otherUserId: number;
let squatId: number;
let pushUpId: number;
let runId: number;

beforeEach(() => {
	db = testDb();
	userId = makeUser(db, 'lifter');
	otherUserId = makeUser(db, 'intruder');
	squatId = exerciseIdBySlug(db, 'back-squat');
	pushUpId = exerciseIdBySlug(db, 'push-up');
	runId = exerciseIdBySlug(db, 'running');
});

function logSets(
	date: string,
	exerciseId: number,
	sets: Array<Partial<Record<'weightKg' | 'reps' | 'distanceM' | 'durationS', number>> & {
		isWarmup?: boolean;
	}>,
	owner = userId
) {
	const workoutId = createWorkout(owner, { performedOn: date }, db);
	const weId = addExerciseToWorkout(owner, workoutId, exerciseId, db)!;
	for (const set of sets) {
		addSet(
			owner,
			weId,
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
	return workoutId;
}

function logWeight(date: string, weightKg: number, owner = userId) {
	db.insert(schema.bodyMeasurements).values({ userId: owner, measuredOn: date, weightKg }).run();
}

describe('getExerciseSessions', () => {
	it('groups sets by workout, newest first', () => {
		logSets('2026-01-01', squatId, [{ weightKg: 100, reps: 5 }]);
		logSets('2026-01-08', squatId, [
			{ weightKg: 105, reps: 5 },
			{ weightKg: 105, reps: 5 }
		]);

		const sessions = getExerciseSessions(userId, squatId, 'epley', {}, db);
		expect(sessions.map((s) => s.date)).toEqual(['2026-01-08', '2026-01-01']);
		expect(sessions[0].sets).toHaveLength(2);
	});

	it('keeps warm-ups visible but out of every aggregate', () => {
		logSets('2026-01-08', squatId, [
			{ weightKg: 60, reps: 5, isWarmup: true },
			{ weightKg: 100, reps: 5 }
		]);

		const [session] = getExerciseSessions(userId, squatId, 'epley', {}, db);
		expect(session.sets).toHaveLength(2);
		expect(session.workingSetCount).toBe(1);
		expect(session.volumeKg).toBe(500);
		expect(session.heaviestWeightKg).toBe(100);
	});

	it('does not read another user’s sets', () => {
		logSets('2026-01-08', squatId, [{ weightKg: 200, reps: 5 }], otherUserId);
		expect(getExerciseSessions(userId, squatId, 'epley', {}, db)).toEqual([]);
	});
});

describe('getExerciseRecords', () => {
	it('finds the heaviest set and the best estimated 1RM independently', () => {
		// The heaviest lift and the best estimate are different sets here: 5 reps
		// at 100 estimates higher than a hard single at 110.
		logSets('2026-01-01', squatId, [
			{ weightKg: 110, reps: 1 },
			{ weightKg: 100, reps: 5 }
		]);

		const records = getExerciseRecords(userId, squatId, 'epley', db);
		expect(records.heaviestSet).toMatchObject({ weightKg: 110, reps: 1 });
		expect(records.bestOneRm!.value).toBeCloseTo(116.667, 3);
		expect(records.bestOneRm).toMatchObject({ weightKg: 100, reps: 5 });
	});

	it('tracks best session volume separately from best set', () => {
		logSets('2026-01-01', squatId, [{ weightKg: 140, reps: 1 }]);
		logSets('2026-01-08', squatId, [
			{ weightKg: 100, reps: 10 },
			{ weightKg: 100, reps: 10 }
		]);

		const records = getExerciseRecords(userId, squatId, 'epley', db);
		expect(records.bestVolumeKg).toEqual({ value: 2000, date: '2026-01-08' });
		expect(records.heaviestSet!.weightKg).toBe(140);
	});

	it('ignores pace over distances too short to compare', () => {
		logSets('2026-01-01', runId, [{ distanceM: 100, durationS: 12 }]);
		expect(getExerciseRecords(userId, runId, 'epley', db).bestPace).toBeNull();

		logSets('2026-01-02', runId, [{ distanceM: 5000, durationS: 1500 }]);
		const records = getExerciseRecords(userId, runId, 'epley', db);
		expect(records.bestPace!.distanceM).toBe(5000);
		expect(records.bestPace!.secondsPerMetre).toBeCloseTo(0.3, 5);
	});

	it('prefers the faster pace, not the longer run', () => {
		logSets('2026-01-01', runId, [{ distanceM: 5000, durationS: 1500 }]); // 5:00/km
		logSets('2026-01-08', runId, [{ distanceM: 10000, durationS: 3300 }]); // 5:30/km

		const records = getExerciseRecords(userId, runId, 'epley', db);
		expect(records.bestPace!.distanceM).toBe(5000);
		expect(records.longestDistanceM!.value).toBe(10000);
	});

	it('records rep maxes for exercises with no external load', () => {
		logSets('2026-01-01', pushUpId, [{ reps: 30 }, { reps: 25 }]);

		const records = getExerciseRecords(userId, pushUpId, 'epley', db);
		expect(records.mostReps!.reps).toBe(30);
		expect(records.bestOneRm).toBeNull();
		expect(records.heaviestSet).toBeNull();
	});

	it('reports empty records for an exercise never logged', () => {
		const records = getExerciseRecords(userId, squatId, 'epley', db);
		expect(records.sessionCount).toBe(0);
		expect(records.bestOneRm).toBeNull();
	});
});

describe('getOneRmSeries', () => {
	it('returns one ascending point per training day', () => {
		logSets('2026-01-08', squatId, [{ weightKg: 105, reps: 5 }]);
		logSets('2026-01-01', squatId, [
			{ weightKg: 100, reps: 5 },
			{ weightKg: 90, reps: 8 }
		]);

		const series = getOneRmSeries(userId, squatId, 'epley', {}, db);
		expect(series.map((p) => p.date)).toEqual(['2026-01-01', '2026-01-08']);
		// Best of the day, not the last set of the day.
		expect(series[0].value).toBeCloseTo(116.667, 3);
	});

	it('drops sessions with no estimable set', () => {
		logSets('2026-01-01', squatId, [{ weightKg: 60, reps: 30 }]);
		expect(getOneRmSeries(userId, squatId, 'epley', {}, db)).toEqual([]);
	});

	it('follows the chosen formula', () => {
		logSets('2026-01-01', squatId, [{ weightKg: 100, reps: 5 }]);
		expect(getOneRmSeries(userId, squatId, 'brzycki', {}, db)[0].value).toBeCloseTo(112.511, 3);
	});
});

describe('bodyweight', () => {
	it('returns an ascending series and the latest reading', () => {
		logWeight('2026-01-03', 81);
		logWeight('2026-01-01', 82);
		logWeight('2026-01-02', 80);

		expect(getBodyweightSeries(userId, {}, db).map((p) => p.date)).toEqual([
			'2026-01-01',
			'2026-01-02',
			'2026-01-03'
		]);
		expect(getLatestBodyweight(userId, db)).toEqual({ date: '2026-01-03', weightKg: 81 });
	});

	it('skips entries that only recorded a measurement, not a weight', () => {
		db.insert(schema.bodyMeasurements)
			.values({ userId, measuredOn: '2026-01-01', waistCm: 82 })
			.run();

		expect(getBodyweightSeries(userId, {}, db)).toEqual([]);
		expect(getLatestBodyweight(userId, db)).toBeNull();
	});

	it('does not read another user’s weights', () => {
		logWeight('2026-01-01', 95, otherUserId);
		expect(getBodyweightSeries(userId, {}, db)).toEqual([]);
	});
});

describe('movingAverage', () => {
	it('smooths using a centred window that shrinks at the edges', () => {
		const points = [
			{ date: '2026-01-01', weightKg: 80 },
			{ date: '2026-01-02', weightKg: 82 },
			{ date: '2026-01-03', weightKg: 84 }
		];
		const smoothed = movingAverage(points, 3);

		expect(smoothed[0].weightKg).toBeCloseTo(81, 5); // 80, 82
		expect(smoothed[1].weightKg).toBeCloseTo(82, 5); // 80, 82, 84
		expect(smoothed[2].weightKg).toBeCloseTo(83, 5); // 82, 84
	});

	it('windows by days, not by readings', () => {
		// Weigh-ins a week apart: a 7-day window centred on each one reaches only
		// its immediate neighbours, so the trend must still descend rather than
		// collapsing to the overall mean.
		const points = [
			{ date: '2026-01-01', weightKg: 84 },
			{ date: '2026-01-08', weightKg: 82 },
			{ date: '2026-01-15', weightKg: 80 },
			{ date: '2026-01-22', weightKg: 78 }
		];
		const smoothed = movingAverage(points, 7);

		expect(smoothed.map((p) => p.weightKg)).toEqual([84, 82, 80, 78]);
		expect(smoothed[0].weightKg).toBeGreaterThan(smoothed[3].weightKg);
	});

	it('averages readings that fall inside the same window', () => {
		const points = [
			{ date: '2026-01-01', weightKg: 84 },
			{ date: '2026-01-02', weightKg: 80 },
			{ date: '2026-01-20', weightKg: 70 }
		];
		const smoothed = movingAverage(points, 7);

		expect(smoothed[0].weightKg).toBeCloseTo(82, 5);
		expect(smoothed[1].weightKg).toBeCloseTo(82, 5);
		// Far enough away to be alone in its window.
		expect(smoothed[2].weightKg).toBeCloseTo(70, 5);
	});

	it('handles an empty series', () => {
		expect(movingAverage([], 7)).toEqual([]);
	});
});

describe('getWeeklyVolumeByMuscle', () => {
	const weeks = ['2026-01-05', '2026-01-12', '2026-01-19'];

	it('buckets volume into the week containing the workout', () => {
		logSets('2026-01-07', squatId, [{ weightKg: 100, reps: 5 }]);
		logSets('2026-01-14', squatId, [{ weightKg: 100, reps: 10 }]);

		const buckets = getWeeklyVolumeByMuscle(userId, weeks, db);
		expect(buckets[0].byMuscle.quads).toBe(500);
		expect(buckets[1].byMuscle.quads).toBe(1000);
		expect(buckets[2].total).toBe(0);
	});

	it('excludes warm-ups and unloaded exercises', () => {
		logSets('2026-01-07', squatId, [
			{ weightKg: 60, reps: 5, isWarmup: true },
			{ weightKg: 100, reps: 5 }
		]);
		logSets('2026-01-07', pushUpId, [{ reps: 40 }]);

		const [first] = getWeeklyVolumeByMuscle(userId, weeks, db);
		expect(first.total).toBe(500);
		expect(first.byMuscle.chest).toBeUndefined();
	});

	it('ignores workouts before the first bucket', () => {
		logSets('2025-12-30', squatId, [{ weightKg: 100, reps: 5 }]);
		expect(getWeeklyVolumeByMuscle(userId, weeks, db).every((b) => b.total === 0)).toBe(true);
	});
});

describe('getPeriodTotals', () => {
	it('totals only within the range and only working sets', () => {
		logSets('2026-01-05', squatId, [
			{ weightKg: 60, reps: 5, isWarmup: true },
			{ weightKg: 100, reps: 5 }
		]);
		logSets('2026-01-06', runId, [{ distanceM: 5000, durationS: 1500 }]);
		logSets('2026-02-01', squatId, [{ weightKg: 100, reps: 5 }]);

		const totals = getPeriodTotals(userId, '2026-01-01', '2026-01-31', db);
		expect(totals.workoutCount).toBe(2);
		expect(totals.setCount).toBe(2);
		expect(totals.volumeKg).toBe(500);
		expect(totals.distanceM).toBe(5000);
		expect(totals.durationS).toBe(1500);
	});

	it('is all zeroes for a quiet period', () => {
		expect(getPeriodTotals(userId, '2026-03-01', '2026-03-31', db)).toEqual({
			workoutCount: 0,
			setCount: 0,
			volumeKg: 0,
			distanceM: 0,
			durationS: 0
		});
	});
});

describe('suggestPinnedExercises', () => {
	it('offers the most-trained loaded lifts only', () => {
		logSets('2026-01-01', squatId, [{ weightKg: 100, reps: 5 }]);
		logSets('2026-01-08', squatId, [{ weightKg: 100, reps: 5 }]);
		logSets('2026-01-02', pushUpId, [{ reps: 20 }]);
		logSets('2026-01-09', pushUpId, [{ reps: 20 }]);
		logSets('2026-01-10', pushUpId, [{ reps: 20 }]);

		const suggested = suggestPinnedExercises(userId, 3, db);
		expect(suggested.map((s) => s.name)).toEqual(['Back Squat']);
	});
});

describe('getAllRecords', () => {
	it('covers every exercise the user has logged, and nothing else', () => {
		logSets('2026-01-01', squatId, [{ weightKg: 100, reps: 5 }]);
		logSets('2026-01-02', runId, [{ distanceM: 5000, durationS: 1500 }]);
		logSets('2026-01-03', pushUpId, [{ reps: 20 }], otherUserId);

		const records = getAllRecords(userId, 'epley', db);
		expect(records.map((r) => r.name).sort()).toEqual(['Back Squat', 'Running']);
	});
});
