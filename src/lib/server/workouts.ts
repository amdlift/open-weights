import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { MAX_PRESCRIBED_SETS } from '$lib/constants';
import type { EquipmentType, ExerciseKind, MuscleGroup } from '$lib/constants';
import type { IsoDate } from '$lib/dates';
import type { ResolvedPrescription } from '$lib/prescription';
import { getDb, type Db } from './db';
import * as schema from './db/schema';

export type SetInput = {
	weightKg: number | null;
	reps: number | null;
	rpe: number | null;
	distanceM: number | null;
	durationS: number | null;
	isWarmup: boolean;
};

export type WorkoutSetRow = SetInput &
	ResolvedPrescription & {
		id: number;
		orderIndex: number;
		isCompleted: boolean;
	};

/** Read a set row's prescription back out. Written once and used by every
 *  place that maps a `sets` row into a `WorkoutSetRow`. */
function targetsOf(set: schema.WorkoutSet): ResolvedPrescription {
	return {
		targetWeightKg: set.targetWeightKg,
		targetRepsMin: set.targetRepsMin,
		targetRepsMax: set.targetRepsMax,
		targetRpe: set.targetRpe,
		targetPercentOneRm: set.targetPercentOneRm,
		targetDistanceM: set.targetDistanceM,
		targetDurationS: set.targetDurationS
	};
}

export type WorkoutExerciseRow = {
	id: number;
	orderIndex: number;
	notes: string | null;
	exercise: {
		id: number;
		name: string;
		kind: ExerciseKind;
		primaryMuscle: MuscleGroup | null;
		equipment: EquipmentType | null;
	};
	sets: WorkoutSetRow[];
};

export type WorkoutDetail = {
	id: number;
	performedOn: IsoDate;
	title: string | null;
	notes: string | null;
	startedAt: Date | null;
	endedAt: Date | null;
	exercises: WorkoutExerciseRow[];
};

// ---------------------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------------------

/**
 * Every mutation below resolves the target back to a user id before touching
 * anything. Route params are attacker-controlled, so "this id belongs to me" is
 * never assumed from the URL.
 */
function ownsWorkout(userId: number, workoutId: number, db: Db): boolean {
	return (
		db
			.select({ id: schema.workouts.id })
			.from(schema.workouts)
			.where(and(eq(schema.workouts.id, workoutId), eq(schema.workouts.userId, userId)))
			.get() != null
	);
}

function workoutIdForExercise(
	userId: number,
	workoutExerciseId: number,
	db: Db
): number | null {
	const row = db
		.select({ workoutId: schema.workoutExercises.workoutId })
		.from(schema.workoutExercises)
		.innerJoin(schema.workouts, eq(schema.workouts.id, schema.workoutExercises.workoutId))
		.where(
			and(
				eq(schema.workoutExercises.id, workoutExerciseId),
				eq(schema.workouts.userId, userId)
			)
		)
		.get();
	return row?.workoutId ?? null;
}

function workoutIdForSet(userId: number, setId: number, db: Db): number | null {
	const row = db
		.select({ workoutId: schema.workouts.id })
		.from(schema.sets)
		.innerJoin(
			schema.workoutExercises,
			eq(schema.workoutExercises.id, schema.sets.workoutExerciseId)
		)
		.innerJoin(schema.workouts, eq(schema.workouts.id, schema.workoutExercises.workoutId))
		.where(and(eq(schema.sets.id, setId), eq(schema.workouts.userId, userId)))
		.get();
	return row?.workoutId ?? null;
}

function touch(workoutId: number, db: Db): void {
	db.update(schema.workouts)
		.set({ updatedAt: new Date() })
		.where(eq(schema.workouts.id, workoutId))
		.run();
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export type WorkoutSummary = {
	id: number;
	performedOn: IsoDate;
	title: string | null;
	notes: string | null;
	/** Whether the session was ever finished, for an "in progress" marker. */
	isFinished: boolean;
	/** Where in a program this came from, or null for freeform and routine work. */
	program: { name: string; weekNumber: number; dayNumber: number } | null;
	exerciseCount: number;
	setCount: number;
	totalVolumeKg: number;
	totalDistanceM: number;
	totalDurationS: number;
	/** Distinct exercise names, in order, for a one-line synopsis. */
	exerciseNames: string[];
};

/**
 * Summaries for a date range, aggregated in SQL so the calendar and the workout
 * list never load individual sets.
 */
export function listWorkoutSummaries(
	userId: number,
	options: { from?: IsoDate; to?: IsoDate; limit?: number; offset?: number } = {},
	db: Db = getDb()
): WorkoutSummary[] {
	const conditions = [eq(schema.workouts.userId, userId)];
	if (options.from) conditions.push(gte(schema.workouts.performedOn, options.from));
	if (options.to) conditions.push(lte(schema.workouts.performedOn, options.to));

	let query = db
		.select({
			id: schema.workouts.id,
			performedOn: schema.workouts.performedOn,
			title: schema.workouts.title,
			notes: schema.workouts.notes,
			endedAt: schema.workouts.endedAt,
			programName: schema.programs.name,
			weekNumber: schema.programDays.weekNumber,
			dayOrderIndex: schema.programDays.orderIndex
		})
		.from(schema.workouts)
		// Left joins: a workout whose program was deleted keeps its link nulled
		// and simply reports no program, which is the honest answer.
		.leftJoin(schema.programDays, eq(schema.programDays.id, schema.workouts.programDayId))
		.leftJoin(schema.programs, eq(schema.programs.id, schema.programDays.programId))
		.where(and(...conditions))
		.orderBy(desc(schema.workouts.performedOn), desc(schema.workouts.id))
		.$dynamic();

	if (options.limit != null) query = query.limit(options.limit);
	if (options.offset != null) query = query.offset(options.offset);

	const workouts = query.all();
	if (workouts.length === 0) return [];

	const ids = workouts.map((w) => w.id);

	const perExercise = db
		.select({
			workoutId: schema.workoutExercises.workoutId,
			orderIndex: schema.workoutExercises.orderIndex,
			name: schema.exercises.name,
			kind: schema.exercises.kind,
			setCount: sql<number>`count(${schema.sets.id})`,
			volume: sql<number>`coalesce(sum(
				case when ${schema.sets.isWarmup} = 0
					then coalesce(${schema.sets.weightKg}, 0) * coalesce(${schema.sets.reps}, 0)
					else 0 end), 0)`,
			distance: sql<number>`coalesce(sum(coalesce(${schema.sets.distanceM}, 0)), 0)`,
			duration: sql<number>`coalesce(sum(coalesce(${schema.sets.durationS}, 0)), 0)`
		})
		.from(schema.workoutExercises)
		.innerJoin(schema.exercises, eq(schema.exercises.id, schema.workoutExercises.exerciseId))
		.leftJoin(schema.sets, eq(schema.sets.workoutExerciseId, schema.workoutExercises.id))
		.where(inArray(schema.workoutExercises.workoutId, ids))
		.groupBy(schema.workoutExercises.id)
		.orderBy(asc(schema.workoutExercises.orderIndex), asc(schema.workoutExercises.id))
		.all();

	const byWorkout = new Map<number, WorkoutSummary>();
	for (const w of workouts) {
		byWorkout.set(w.id, {
			id: w.id,
			performedOn: w.performedOn,
			title: w.title,
			notes: w.notes,
			isFinished: w.endedAt != null,
			program:
				w.programName != null && w.weekNumber != null && w.dayOrderIndex != null
					? {
							name: w.programName,
							weekNumber: w.weekNumber,
							dayNumber: w.dayOrderIndex + 1
						}
					: null,
			exerciseCount: 0,
			setCount: 0,
			totalVolumeKg: 0,
			totalDistanceM: 0,
			totalDurationS: 0,
			exerciseNames: []
		});
	}

	for (const row of perExercise) {
		const summary = byWorkout.get(row.workoutId);
		if (!summary) continue;
		summary.exerciseCount += 1;
		summary.setCount += row.setCount;
		summary.totalVolumeKg += row.volume;
		summary.totalDistanceM += row.distance;
		summary.totalDurationS += row.duration;
		if (!summary.exerciseNames.includes(row.name)) summary.exerciseNames.push(row.name);
	}

	return workouts.map((w) => byWorkout.get(w.id)!);
}

export function countWorkouts(userId: number, db: Db = getDb()): number {
	return (
		db
			.select({ value: sql<number>`count(*)` })
			.from(schema.workouts)
			.where(eq(schema.workouts.userId, userId))
			.get()?.value ?? 0
	);
}

export function getWorkout(
	userId: number,
	workoutId: number,
	db: Db = getDb()
): WorkoutDetail | null {
	const workout = db
		.select()
		.from(schema.workouts)
		.where(and(eq(schema.workouts.id, workoutId), eq(schema.workouts.userId, userId)))
		.get();
	if (!workout) return null;

	const exerciseRows = db
		.select({
			id: schema.workoutExercises.id,
			orderIndex: schema.workoutExercises.orderIndex,
			notes: schema.workoutExercises.notes,
			exerciseId: schema.exercises.id,
			name: schema.exercises.name,
			kind: schema.exercises.kind,
			primaryMuscle: schema.exercises.primaryMuscle,
			equipment: schema.exercises.equipment
		})
		.from(schema.workoutExercises)
		.innerJoin(schema.exercises, eq(schema.exercises.id, schema.workoutExercises.exerciseId))
		.where(eq(schema.workoutExercises.workoutId, workoutId))
		.orderBy(asc(schema.workoutExercises.orderIndex), asc(schema.workoutExercises.id))
		.all();

	const setRows =
		exerciseRows.length === 0
			? []
			: db
					.select()
					.from(schema.sets)
					.where(
						inArray(
							schema.sets.workoutExerciseId,
							exerciseRows.map((e) => e.id)
						)
					)
					.orderBy(asc(schema.sets.orderIndex), asc(schema.sets.id))
					.all();

	const setsByExercise = new Map<number, WorkoutSetRow[]>();
	for (const set of setRows) {
		const list = setsByExercise.get(set.workoutExerciseId) ?? [];
		list.push({
			id: set.id,
			orderIndex: set.orderIndex,
			weightKg: set.weightKg,
			reps: set.reps,
			rpe: set.rpe,
			distanceM: set.distanceM,
			durationS: set.durationS,
			isWarmup: set.isWarmup,
			isCompleted: set.isCompleted,
			...targetsOf(set)
		});
		setsByExercise.set(set.workoutExerciseId, list);
	}

	return {
		id: workout.id,
		performedOn: workout.performedOn,
		title: workout.title,
		notes: workout.notes,
		startedAt: workout.startedAt,
		endedAt: workout.endedAt,
		exercises: exerciseRows.map((row) => ({
			id: row.id,
			orderIndex: row.orderIndex,
			notes: row.notes,
			exercise: {
				id: row.exerciseId,
				name: row.name,
				kind: row.kind,
				primaryMuscle: row.primaryMuscle,
				equipment: row.equipment
			},
			sets: setsByExercise.get(row.id) ?? []
		}))
	};
}

/**
 * The sets logged for this exercise the last time the user trained it, used to
 * prefill a new entry — nobody wants to retype 5×5 at the same weight.
 */
export function getPreviousSets(
	userId: number,
	exerciseId: number,
	beforeWorkoutId: number,
	db: Db = getDb()
): WorkoutSetRow[] {
	const previous = db
		.select({ id: schema.workoutExercises.id })
		.from(schema.workoutExercises)
		.innerJoin(schema.workouts, eq(schema.workouts.id, schema.workoutExercises.workoutId))
		.where(
			and(
				eq(schema.workouts.userId, userId),
				eq(schema.workoutExercises.exerciseId, exerciseId),
				sql`${schema.workoutExercises.workoutId} <> ${beforeWorkoutId}`
			)
		)
		.orderBy(desc(schema.workouts.performedOn), desc(schema.workouts.id))
		.limit(1)
		.get();

	if (!previous) return [];

	return db
		.select()
		.from(schema.sets)
		.where(eq(schema.sets.workoutExerciseId, previous.id))
		.orderBy(asc(schema.sets.orderIndex), asc(schema.sets.id))
		.all()
		.map((set) => ({
			id: set.id,
			orderIndex: set.orderIndex,
			weightKg: set.weightKg,
			reps: set.reps,
			rpe: set.rpe,
			distanceM: set.distanceM,
			durationS: set.durationS,
			isWarmup: set.isWarmup,
			isCompleted: set.isCompleted,
			...targetsOf(set)
		}));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export function createWorkout(
	userId: number,
	input: { performedOn: IsoDate; title?: string | null; notes?: string | null },
	db: Db = getDb()
): number {
	return db
		.insert(schema.workouts)
		.values({
			userId,
			performedOn: input.performedOn,
			title: input.title?.trim() || null,
			notes: input.notes?.trim() || null,
			startedAt: new Date()
		})
		.returning({ id: schema.workouts.id })
		.get().id;
}

/**
 * Write one prescribed exercise into a workout: the `workout_exercises` row
 * plus as many empty sets as the plan asked for, each carrying the plan in its
 * `target_*` columns and nothing whatsoever in its measurement columns.
 *
 * Both the routine path and the program path come through here, so "a plan
 * writes targets, never measurements" holds in one place instead of two. Takes
 * no `userId` on purpose: both callers have already resolved ownership and are
 * inside their own transaction.
 */
export function writePrescribedExercise(
	tx: Db,
	workoutId: number,
	input: {
		exerciseId: number;
		orderIndex: number;
		targetSets: number | null;
		notes: string | null;
		prescription: ResolvedPrescription;
	}
): number {
	const workoutExerciseId = tx
		.insert(schema.workoutExercises)
		.values({
			workoutId,
			exerciseId: input.exerciseId,
			orderIndex: input.orderIndex,
			notes: input.notes
		})
		.returning({ id: schema.workoutExercises.id })
		.get().id;

	const setCount = Math.min(Math.max(input.targetSets ?? 1, 1), MAX_PRESCRIBED_SETS);
	for (let i = 0; i < setCount; i++) {
		tx.insert(schema.sets)
			.values({
				workoutExerciseId,
				orderIndex: i,
				// Measurement columns stay null until the lifter confirms the set.
				// That is the whole point: it is what lets `finishWorkout` tell the
				// sets that happened from the ones that were only ever asked for.
				isCompleted: false,
				...input.prescription
			})
			.run();
	}

	return workoutExerciseId;
}

/**
 * Start a workout pre-filled from a routine: the same exercises in the same
 * order, each with empty sets shaped by the routine's targets. Targets are a
 * starting point, not a record — the user still confirms every number.
 */
export function createWorkoutFromRoutine(
	userId: number,
	routineId: number,
	performedOn: IsoDate,
	db: Db = getDb()
): number | null {
	return db.transaction((tx) => {
		const routine = tx
			.select()
			.from(schema.routines)
			.where(and(eq(schema.routines.id, routineId), eq(schema.routines.userId, userId)))
			.get();
		if (!routine) return null;

		const items = tx
			.select()
			.from(schema.routineExercises)
			.where(eq(schema.routineExercises.routineId, routineId))
			.orderBy(asc(schema.routineExercises.orderIndex), asc(schema.routineExercises.id))
			.all();

		const workoutId = tx
			.insert(schema.workouts)
			.values({
				userId,
				performedOn,
				title: routine.name,
				startedAt: new Date()
			})
			.returning({ id: schema.workouts.id })
			.get().id;

		items.forEach((item, index) => {
			writePrescribedExercise(tx as Db, workoutId, {
				exerciseId: item.exerciseId,
				orderIndex: index,
				targetSets: item.targetSets,
				notes: item.notes,
				// A routine only ever prescribes effort, so it resolves with no
				// reference max and never produces a target weight: the load moves
				// as you get stronger and you read it off the bar, not off a plan
				// written months ago.
				prescription: {
					targetWeightKg: null,
					targetRepsMin: item.targetRepsMin,
					targetRepsMax: item.targetRepsMax,
					targetRpe: item.targetRpe,
					targetPercentOneRm: null,
					targetDistanceM: item.targetDistanceM,
					targetDurationS: item.targetDurationS
				}
			});
		});

		return workoutId;
	});
}

export function updateWorkout(
	userId: number,
	workoutId: number,
	input: { performedOn?: IsoDate; title?: string | null; notes?: string | null },
	db: Db = getDb()
): boolean {
	if (!ownsWorkout(userId, workoutId, db)) return false;

	const patch: Record<string, unknown> = { updatedAt: new Date() };
	if (input.performedOn !== undefined) patch.performedOn = input.performedOn;
	if (input.title !== undefined) patch.title = input.title?.trim() || null;
	if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;

	db.update(schema.workouts).set(patch).where(eq(schema.workouts.id, workoutId)).run();
	return true;
}

export function finishWorkout(userId: number, workoutId: number, db: Db = getDb()): boolean {
	if (!ownsWorkout(userId, workoutId, db)) return false;

	return db.transaction((tx) => {
		const exerciseIds = tx
			.select({ id: schema.workoutExercises.id })
			.from(schema.workoutExercises)
			.where(eq(schema.workoutExercises.workoutId, workoutId));

		// Drop the sets a plan created that nobody went near. A prescribed set
		// with nothing measured in it is not evidence of anything, and counting
		// it would put work you never did into your volume and your records.
		//
		// The predicate leans on the target columns rather than on `isCompleted`
		// alone: a set the lifter added by hand carries no targets and so can
		// never match here, whatever its completion flag says.
		tx.delete(schema.sets)
			.where(
				and(
					inArray(schema.sets.workoutExerciseId, exerciseIds),
					eq(schema.sets.isCompleted, false),
					sql`(
						${schema.sets.targetWeightKg} is not null
						or ${schema.sets.targetRepsMin} is not null
						or ${schema.sets.targetRpe} is not null
						or ${schema.sets.targetPercentOneRm} is not null
						or ${schema.sets.targetDistanceM} is not null
						or ${schema.sets.targetDurationS} is not null
					)`,
					isNull(schema.sets.weightKg),
					isNull(schema.sets.reps),
					isNull(schema.sets.rpe),
					isNull(schema.sets.distanceM),
					isNull(schema.sets.durationS)
				)
			)
			.run();

		// Anything still marked incomplete was logged but never ticked off; treat
		// finishing the workout as confirming them. Runs after the prune, or it
		// would mark the untouched rows done and leave nothing to drop.
		tx.update(schema.sets)
			.set({ isCompleted: true })
			.where(inArray(schema.sets.workoutExerciseId, exerciseIds))
			.run();

		tx.update(schema.workouts)
			.set({ endedAt: new Date(), updatedAt: new Date() })
			.where(eq(schema.workouts.id, workoutId))
			.run();

		return true;
	});
}

export function deleteWorkout(userId: number, workoutId: number, db: Db = getDb()): boolean {
	if (!ownsWorkout(userId, workoutId, db)) return false;
	db.delete(schema.workouts).where(eq(schema.workouts.id, workoutId)).run();
	return true;
}

export function addExerciseToWorkout(
	userId: number,
	workoutId: number,
	exerciseId: number,
	db: Db = getDb()
): number | null {
	if (!ownsWorkout(userId, workoutId, db)) return null;

	return db.transaction((tx) => {
		const next =
			(tx
				.select({ value: sql<number | null>`max(${schema.workoutExercises.orderIndex})` })
				.from(schema.workoutExercises)
				.where(eq(schema.workoutExercises.workoutId, workoutId))
				.get()?.value ?? -1) + 1;

		return tx
			.insert(schema.workoutExercises)
			.values({ workoutId, exerciseId, orderIndex: next })
			.returning({ id: schema.workoutExercises.id })
			.get().id;
	});
}

export function removeWorkoutExercise(
	userId: number,
	workoutExerciseId: number,
	db: Db = getDb()
): boolean {
	const workoutId = workoutIdForExercise(userId, workoutExerciseId, db);
	if (workoutId == null) return false;
	db.delete(schema.workoutExercises)
		.where(eq(schema.workoutExercises.id, workoutExerciseId))
		.run();
	touch(workoutId, db);
	return true;
}

export function moveWorkoutExercise(
	userId: number,
	workoutExerciseId: number,
	direction: -1 | 1,
	db: Db = getDb()
): boolean {
	const workoutId = workoutIdForExercise(userId, workoutExerciseId, db);
	if (workoutId == null) return false;

	return db.transaction((tx) => {
		const ordered = tx
			.select({ id: schema.workoutExercises.id })
			.from(schema.workoutExercises)
			.where(eq(schema.workoutExercises.workoutId, workoutId))
			.orderBy(asc(schema.workoutExercises.orderIndex), asc(schema.workoutExercises.id))
			.all()
			.map((r) => r.id);

		const from = ordered.indexOf(workoutExerciseId);
		const to = from + direction;
		if (from < 0 || to < 0 || to >= ordered.length) return false;

		ordered.splice(to, 0, ordered.splice(from, 1)[0]);
		// Rewriting every index keeps them dense, so ordering never depends on
		// gaps left behind by earlier moves.
		ordered.forEach((id, index) => {
			tx.update(schema.workoutExercises)
				.set({ orderIndex: index })
				.where(eq(schema.workoutExercises.id, id))
				.run();
		});
		touch(workoutId, tx as Db);
		return true;
	});
}

/**
 * Add a set by hand.
 *
 * No `target_*` values and no `isCompleted: false`: a set the lifter adds is a
 * record of work beyond the plan, not something the plan asked for. Both
 * omissions look like oversights and are not — they are what keeps an extra
 * set safe from the prune in `finishWorkout`.
 */
export function addSet(
	userId: number,
	workoutExerciseId: number,
	values: Partial<SetInput> = {},
	db: Db = getDb()
): number | null {
	const workoutId = workoutIdForExercise(userId, workoutExerciseId, db);
	if (workoutId == null) return null;

	return db.transaction((tx) => {
		const next =
			(tx
				.select({ value: sql<number | null>`max(${schema.sets.orderIndex})` })
				.from(schema.sets)
				.where(eq(schema.sets.workoutExerciseId, workoutExerciseId))
				.get()?.value ?? -1) + 1;

		const id = tx
			.insert(schema.sets)
			.values({
				workoutExerciseId,
				orderIndex: next,
				weightKg: values.weightKg ?? null,
				reps: values.reps ?? null,
				rpe: values.rpe ?? null,
				distanceM: values.distanceM ?? null,
				durationS: values.durationS ?? null,
				isWarmup: values.isWarmup ?? false
			})
			.returning({ id: schema.sets.id })
			.get().id;

		touch(workoutId, tx as Db);
		return id;
	});
}

/**
 * Copy the last set of an exercise — the fastest way to log a straight-set
 * scheme. Copies what was measured and, like `addSet`, deliberately carries no
 * prescription across: repeating a set is extra work, not planned work.
 */
export function repeatLastSet(
	userId: number,
	workoutExerciseId: number,
	db: Db = getDb()
): number | null {
	const last = db
		.select()
		.from(schema.sets)
		.where(eq(schema.sets.workoutExerciseId, workoutExerciseId))
		.orderBy(desc(schema.sets.orderIndex), desc(schema.sets.id))
		.limit(1)
		.get();

	return addSet(
		userId,
		workoutExerciseId,
		last
			? {
					weightKg: last.weightKg,
					reps: last.reps,
					rpe: last.rpe,
					distanceM: last.distanceM,
					durationS: last.durationS,
					isWarmup: last.isWarmup
				}
			: {},
		db
	);
}

export function updateSet(
	userId: number,
	setId: number,
	values: Partial<SetInput & { isCompleted: boolean }>,
	db: Db = getDb()
): boolean {
	const workoutId = workoutIdForSet(userId, setId, db);
	if (workoutId == null) return false;

	db.update(schema.sets).set(values).where(eq(schema.sets.id, setId)).run();
	touch(workoutId, db);
	return true;
}

export function deleteSet(userId: number, setId: number, db: Db = getDb()): boolean {
	const workoutId = workoutIdForSet(userId, setId, db);
	if (workoutId == null) return false;
	db.delete(schema.sets).where(eq(schema.sets.id, setId)).run();
	touch(workoutId, db);
	return true;
}

export function updateWorkoutExerciseNotes(
	userId: number,
	workoutExerciseId: number,
	notes: string | null,
	db: Db = getDb()
): boolean {
	const workoutId = workoutIdForExercise(userId, workoutExerciseId, db);
	if (workoutId == null) return false;
	db.update(schema.workoutExercises)
		.set({ notes: notes?.trim() || null })
		.where(eq(schema.workoutExercises.id, workoutExerciseId))
		.run();
	touch(workoutId, db);
	return true;
}
