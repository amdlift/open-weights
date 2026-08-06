import { and, asc, desc, eq, gte, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import type { ExerciseKind, MuscleGroup, OneRmFormula } from '$lib/constants';
import { supportsOneRm, supportsVolume } from '$lib/constants';
import { addDays, type IsoDate } from '$lib/dates';
import { estimateOneRm } from '$lib/one-rm';
import { getDb, type Db } from './db';
import * as schema from './db/schema';

/**
 * Read-side analytics.
 *
 * Nothing here is stored: personal records and 1RM estimates are derived from
 * the raw sets on every request. That keeps a formula change in Settings
 * retroactive and removes any chance of a cached aggregate drifting from the
 * data it summarises.
 */

// ---------------------------------------------------------------------------
// Bodyweight
// ---------------------------------------------------------------------------

export type WeightPoint = { date: IsoDate; weightKg: number };

export function getBodyweightSeries(
	userId: number,
	options: { from?: IsoDate; to?: IsoDate } = {},
	db: Db = getDb()
): WeightPoint[] {
	const conditions = [
		eq(schema.bodyMeasurements.userId, userId),
		isNotNull(schema.bodyMeasurements.weightKg)
	];
	if (options.from) conditions.push(gte(schema.bodyMeasurements.measuredOn, options.from));
	if (options.to) conditions.push(lte(schema.bodyMeasurements.measuredOn, options.to));

	return db
		.select({
			date: schema.bodyMeasurements.measuredOn,
			weightKg: schema.bodyMeasurements.weightKg
		})
		.from(schema.bodyMeasurements)
		.where(and(...conditions))
		.orderBy(asc(schema.bodyMeasurements.measuredOn))
		.all()
		.map((row) => ({ date: row.date, weightKg: row.weightKg! }));
}

export function getLatestBodyweight(userId: number, db: Db = getDb()): WeightPoint | null {
	const row = db
		.select({
			date: schema.bodyMeasurements.measuredOn,
			weightKg: schema.bodyMeasurements.weightKg
		})
		.from(schema.bodyMeasurements)
		.where(
			and(
				eq(schema.bodyMeasurements.userId, userId),
				isNotNull(schema.bodyMeasurements.weightKg)
			)
		)
		.orderBy(desc(schema.bodyMeasurements.measuredOn))
		.limit(1)
		.get();
	return row ? { date: row.date, weightKg: row.weightKg! } : null;
}

/**
 * Centred moving average over a window measured in **days**, not in readings.
 *
 * Bodyweight swings a kilo or two day to day from water and food, so the raw
 * line is noise; this is the line people actually read. Averaging over a fixed
 * number of readings instead would be wrong for anyone who does not weigh in
 * daily: four readings spread across a fortnight would each average the whole
 * set and draw a flat line through a real trend.
 *
 * Expects `points` sorted ascending by date, as `getBodyweightSeries` returns.
 */
export function movingAverage(points: WeightPoint[], windowDays: number): WeightPoint[] {
	if (points.length === 0) return [];
	const halfDays = Math.floor(windowDays / 2);

	return points.map((point) => {
		const from = addDays(point.date, -halfDays);
		const to = addDays(point.date, halfDays);

		let sum = 0;
		let count = 0;
		for (const other of points) {
			if (other.date < from) continue;
			// Sorted input means everything past `to` is out of range too.
			if (other.date > to) break;
			sum += other.weightKg;
			count += 1;
		}

		return { date: point.date, weightKg: count > 0 ? sum / count : point.weightKg };
	});
}

// ---------------------------------------------------------------------------
// Per-exercise history
// ---------------------------------------------------------------------------

export type ExerciseSessionSet = {
	weightKg: number | null;
	reps: number | null;
	rpe: number | null;
	distanceM: number | null;
	durationS: number | null;
	isWarmup: boolean;
};

export type ExerciseSession = {
	workoutId: number;
	date: IsoDate;
	sets: ExerciseSessionSet[];
	/** Working sets only — warm-ups are excluded from every aggregate. */
	workingSetCount: number;
	volumeKg: number;
	estimatedOneRm: number | null;
	heaviestWeightKg: number | null;
	totalDistanceM: number;
	totalDurationS: number;
};

export function getExerciseSessions(
	userId: number,
	exerciseId: number,
	formula: OneRmFormula,
	options: { limit?: number } = {},
	db: Db = getDb()
): ExerciseSession[] {
	const rows = db
		.select({
			workoutId: schema.workouts.id,
			date: schema.workouts.performedOn,
			weightKg: schema.sets.weightKg,
			reps: schema.sets.reps,
			rpe: schema.sets.rpe,
			distanceM: schema.sets.distanceM,
			durationS: schema.sets.durationS,
			isWarmup: schema.sets.isWarmup,
			orderIndex: schema.sets.orderIndex
		})
		.from(schema.sets)
		.innerJoin(
			schema.workoutExercises,
			eq(schema.workoutExercises.id, schema.sets.workoutExerciseId)
		)
		.innerJoin(schema.workouts, eq(schema.workouts.id, schema.workoutExercises.workoutId))
		.where(
			and(
				eq(schema.workouts.userId, userId),
				eq(schema.workoutExercises.exerciseId, exerciseId)
			)
		)
		.orderBy(
			desc(schema.workouts.performedOn),
			desc(schema.workouts.id),
			asc(schema.sets.orderIndex)
		)
		.all();

	const sessions = new Map<number, ExerciseSession>();

	for (const row of rows) {
		let session = sessions.get(row.workoutId);
		if (!session) {
			session = {
				workoutId: row.workoutId,
				date: row.date,
				sets: [],
				workingSetCount: 0,
				volumeKg: 0,
				estimatedOneRm: null,
				heaviestWeightKg: null,
				totalDistanceM: 0,
				totalDurationS: 0
			};
			sessions.set(row.workoutId, session);
		}

		session.sets.push({
			weightKg: row.weightKg,
			reps: row.reps,
			rpe: row.rpe,
			distanceM: row.distanceM,
			durationS: row.durationS,
			isWarmup: row.isWarmup
		});

		session.totalDistanceM += row.distanceM ?? 0;
		session.totalDurationS += row.durationS ?? 0;

		if (row.isWarmup) continue;

		session.workingSetCount += 1;
		session.volumeKg += (row.weightKg ?? 0) * (row.reps ?? 0);

		if (row.weightKg != null) {
			session.heaviestWeightKg = Math.max(session.heaviestWeightKg ?? 0, row.weightKg);
		}
		const estimate = estimateOneRm(row.weightKg, row.reps, formula);
		if (estimate != null && (session.estimatedOneRm == null || estimate > session.estimatedOneRm)) {
			session.estimatedOneRm = estimate;
		}
	}

	const list = [...sessions.values()];
	return options.limit != null ? list.slice(0, options.limit) : list;
}

export type ExerciseRecords = {
	heaviestWeightKg: number | null;
	heaviestSet: { weightKg: number; reps: number; date: IsoDate } | null;
	bestOneRm: { value: number; weightKg: number; reps: number; date: IsoDate } | null;
	bestVolumeKg: { value: number; date: IsoDate } | null;
	mostReps: { reps: number; weightKg: number | null; date: IsoDate } | null;
	longestDistanceM: { value: number; date: IsoDate } | null;
	longestDurationS: { value: number; date: IsoDate } | null;
	/** Seconds per metre; lower is faster. Only meaningful for cardio. */
	bestPace: { secondsPerMetre: number; distanceM: number; durationS: number; date: IsoDate } | null;
	sessionCount: number;
	totalSets: number;
};

export function getExerciseRecords(
	userId: number,
	exerciseId: number,
	formula: OneRmFormula,
	db: Db = getDb()
): ExerciseRecords {
	const sessions = getExerciseSessions(userId, exerciseId, formula, {}, db);

	const records: ExerciseRecords = {
		heaviestWeightKg: null,
		heaviestSet: null,
		bestOneRm: null,
		bestVolumeKg: null,
		mostReps: null,
		longestDistanceM: null,
		longestDurationS: null,
		bestPace: null,
		sessionCount: sessions.length,
		totalSets: 0
	};

	for (const session of sessions) {
		if (session.volumeKg > 0 && (!records.bestVolumeKg || session.volumeKg > records.bestVolumeKg.value)) {
			records.bestVolumeKg = { value: session.volumeKg, date: session.date };
		}

		for (const set of session.sets) {
			if (set.isWarmup) continue;
			records.totalSets += 1;

			if (set.weightKg != null && set.reps != null) {
				if (records.heaviestWeightKg == null || set.weightKg > records.heaviestWeightKg) {
					records.heaviestWeightKg = set.weightKg;
					records.heaviestSet = {
						weightKg: set.weightKg,
						reps: set.reps,
						date: session.date
					};
				}
				const estimate = estimateOneRm(set.weightKg, set.reps, formula);
				if (estimate != null && (!records.bestOneRm || estimate > records.bestOneRm.value)) {
					records.bestOneRm = {
						value: estimate,
						weightKg: set.weightKg,
						reps: set.reps,
						date: session.date
					};
				}
			}

			if (set.reps != null && (!records.mostReps || set.reps > records.mostReps.reps)) {
				records.mostReps = { reps: set.reps, weightKg: set.weightKg, date: session.date };
			}

			if (
				set.distanceM != null &&
				set.distanceM > 0 &&
				(!records.longestDistanceM || set.distanceM > records.longestDistanceM.value)
			) {
				records.longestDistanceM = { value: set.distanceM, date: session.date };
			}

			if (
				set.durationS != null &&
				set.durationS > 0 &&
				(!records.longestDurationS || set.durationS > records.longestDurationS.value)
			) {
				records.longestDurationS = { value: set.durationS, date: session.date };
			}

			// Pace is only comparable over a sensible distance; a 50 m sprint would
			// otherwise sit at the top of every runner's record list forever.
			if (
				set.distanceM != null &&
				set.durationS != null &&
				set.distanceM >= 400 &&
				set.durationS > 0
			) {
				const secondsPerMetre = set.durationS / set.distanceM;
				if (!records.bestPace || secondsPerMetre < records.bestPace.secondsPerMetre) {
					records.bestPace = {
						secondsPerMetre,
						distanceM: set.distanceM,
						durationS: set.durationS,
						date: session.date
					};
				}
			}
		}
	}

	return records;
}

export type RecordRow = {
	exerciseId: number;
	name: string;
	kind: ExerciseKind;
	primaryMuscle: MuscleGroup | null;
	records: ExerciseRecords;
};

/** Every exercise the user has ever logged, with its personal bests. */
export function getAllRecords(
	userId: number,
	formula: OneRmFormula,
	db: Db = getDb()
): RecordRow[] {
	const exercises = db
		.selectDistinct({
			id: schema.exercises.id,
			name: schema.exercises.name,
			kind: schema.exercises.kind,
			primaryMuscle: schema.exercises.primaryMuscle
		})
		.from(schema.workoutExercises)
		.innerJoin(schema.exercises, eq(schema.exercises.id, schema.workoutExercises.exerciseId))
		.innerJoin(schema.workouts, eq(schema.workouts.id, schema.workoutExercises.workoutId))
		.where(eq(schema.workouts.userId, userId))
		.orderBy(asc(schema.exercises.name))
		.all();

	return exercises.map((exercise) => ({
		exerciseId: exercise.id,
		name: exercise.name,
		kind: exercise.kind,
		primaryMuscle: exercise.primaryMuscle,
		records: getExerciseRecords(userId, exercise.id, formula, db)
	}));
}

// ---------------------------------------------------------------------------
// Dashboard aggregates
// ---------------------------------------------------------------------------

export type OneRmPoint = { date: IsoDate; value: number };

/** Best estimate per training day, for the dashboard trend lines. */
export function getOneRmSeries(
	userId: number,
	exerciseId: number,
	formula: OneRmFormula,
	options: { from?: IsoDate } = {},
	db: Db = getDb()
): OneRmPoint[] {
	return getExerciseSessions(userId, exerciseId, formula, {}, db)
		.filter((s) => s.estimatedOneRm != null && (!options.from || s.date >= options.from))
		.map((s) => ({ date: s.date, value: s.estimatedOneRm! }))
		.sort((a, b) => a.date.localeCompare(b.date));
}

export type MuscleVolumePoint = {
	weekStart: IsoDate;
	byMuscle: Partial<Record<MuscleGroup, number>>;
	total: number;
};

/**
 * Working-set volume grouped into weeks and muscle groups. Only kinds that
 * carry an external load contribute — counting bodyweight reps as zero volume
 * would silently flatten a calisthenics week, so those are excluded rather than
 * reported as nothing.
 */
export function getWeeklyVolumeByMuscle(
	userId: number,
	weekStarts: IsoDate[],
	db: Db = getDb()
): MuscleVolumePoint[] {
	if (weekStarts.length === 0) return [];

	const from = weekStarts[0];
	const rows = db
		.select({
			date: schema.workouts.performedOn,
			muscle: schema.exercises.primaryMuscle,
			kind: schema.exercises.kind,
			weightKg: schema.sets.weightKg,
			reps: schema.sets.reps
		})
		.from(schema.sets)
		.innerJoin(
			schema.workoutExercises,
			eq(schema.workoutExercises.id, schema.sets.workoutExerciseId)
		)
		.innerJoin(schema.workouts, eq(schema.workouts.id, schema.workoutExercises.workoutId))
		.innerJoin(schema.exercises, eq(schema.exercises.id, schema.workoutExercises.exerciseId))
		.where(
			and(
				eq(schema.workouts.userId, userId),
				eq(schema.sets.isWarmup, false),
				gte(schema.workouts.performedOn, from)
			)
		)
		.all();

	const buckets: MuscleVolumePoint[] = weekStarts.map((weekStart) => ({
		weekStart,
		byMuscle: {},
		total: 0
	}));

	for (const row of rows) {
		if (!supportsVolume(row.kind)) continue;
		const volume = (row.weightKg ?? 0) * (row.reps ?? 0);
		if (volume <= 0) continue;

		// The last bucket whose start is on or before this workout's date.
		let index = -1;
		for (let i = weekStarts.length - 1; i >= 0; i--) {
			if (row.date >= weekStarts[i]) {
				index = i;
				break;
			}
		}
		if (index < 0) continue;

		const muscle = (row.muscle ?? 'full_body') as MuscleGroup;
		const bucket = buckets[index];
		bucket.byMuscle[muscle] = (bucket.byMuscle[muscle] ?? 0) + volume;
		bucket.total += volume;
	}

	return buckets;
}

export type PeriodTotals = {
	workoutCount: number;
	setCount: number;
	volumeKg: number;
	distanceM: number;
	durationS: number;
};

export function getPeriodTotals(
	userId: number,
	from: IsoDate,
	to: IsoDate,
	db: Db = getDb()
): PeriodTotals {
	const workoutCount =
		db
			.select({ value: sql<number>`count(*)` })
			.from(schema.workouts)
			.where(
				and(
					eq(schema.workouts.userId, userId),
					gte(schema.workouts.performedOn, from),
					lte(schema.workouts.performedOn, to)
				)
			)
			.get()?.value ?? 0;

	const totals = db
		.select({
			setCount: sql<number>`count(*)`,
			volume: sql<number>`coalesce(sum(
				coalesce(${schema.sets.weightKg}, 0) * coalesce(${schema.sets.reps}, 0)), 0)`,
			distance: sql<number>`coalesce(sum(coalesce(${schema.sets.distanceM}, 0)), 0)`,
			duration: sql<number>`coalesce(sum(coalesce(${schema.sets.durationS}, 0)), 0)`
		})
		.from(schema.sets)
		.innerJoin(
			schema.workoutExercises,
			eq(schema.workoutExercises.id, schema.sets.workoutExerciseId)
		)
		.innerJoin(schema.workouts, eq(schema.workouts.id, schema.workoutExercises.workoutId))
		.where(
			and(
				eq(schema.workouts.userId, userId),
				eq(schema.sets.isWarmup, false),
				gte(schema.workouts.performedOn, from),
				lte(schema.workouts.performedOn, to)
			)
		)
		.get();

	return {
		workoutCount,
		setCount: totals?.setCount ?? 0,
		volumeKg: totals?.volume ?? 0,
		distanceM: totals?.distance ?? 0,
		durationS: totals?.duration ?? 0
	};
}

/**
 * The exercises worth charting on the dashboard when the user has not pinned
 * any: their most-trained loaded lifts.
 */
export function suggestPinnedExercises(
	userId: number,
	limit = 3,
	db: Db = getDb()
): Array<{ id: number; name: string }> {
	return db
		.select({
			id: schema.exercises.id,
			name: schema.exercises.name,
			kind: schema.exercises.kind,
			uses: sql<number>`count(*)`
		})
		.from(schema.workoutExercises)
		.innerJoin(schema.exercises, eq(schema.exercises.id, schema.workoutExercises.exerciseId))
		.innerJoin(schema.workouts, eq(schema.workouts.id, schema.workoutExercises.workoutId))
		.where(eq(schema.workouts.userId, userId))
		.groupBy(schema.exercises.id)
		.orderBy(desc(sql`count(*)`))
		.all()
		.filter((row) => supportsOneRm(row.kind))
		.slice(0, limit)
		.map((row) => ({ id: row.id, name: row.name }));
}

export function getExerciseNames(
	exerciseIds: number[],
	db: Db = getDb()
): Map<number, string> {
	if (exerciseIds.length === 0) return new Map();
	return new Map(
		db
			.select({ id: schema.exercises.id, name: schema.exercises.name })
			.from(schema.exercises)
			.where(inArray(schema.exercises.id, exerciseIds))
			.all()
			.map((row) => [row.id, row.name])
	);
}
