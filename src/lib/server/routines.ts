import { and, asc, eq, sql } from 'drizzle-orm';
import type { EquipmentType, ExerciseKind, MuscleGroup } from '$lib/constants';
import { getDb, type Db } from './db';
import * as schema from './db/schema';

export type RoutineItem = {
	id: number;
	orderIndex: number;
	targetSets: number | null;
	targetRepsMin: number | null;
	targetRepsMax: number | null;
	targetWeightKg: number | null;
	targetDistanceM: number | null;
	targetDurationS: number | null;
	notes: string | null;
	exercise: {
		id: number;
		name: string;
		kind: ExerciseKind;
		primaryMuscle: MuscleGroup | null;
		equipment: EquipmentType | null;
	};
};

export type RoutineDetail = {
	id: number;
	name: string;
	notes: string | null;
	isArchived: boolean;
	exercises: RoutineItem[];
};

function ownsRoutine(userId: number, routineId: number, db: Db): boolean {
	return (
		db
			.select({ id: schema.routines.id })
			.from(schema.routines)
			.where(and(eq(schema.routines.id, routineId), eq(schema.routines.userId, userId)))
			.get() != null
	);
}

function routineIdForItem(userId: number, itemId: number, db: Db): number | null {
	const row = db
		.select({ routineId: schema.routineExercises.routineId })
		.from(schema.routineExercises)
		.innerJoin(schema.routines, eq(schema.routines.id, schema.routineExercises.routineId))
		.where(and(eq(schema.routineExercises.id, itemId), eq(schema.routines.userId, userId)))
		.get();
	return row?.routineId ?? null;
}

function touch(routineId: number, db: Db): void {
	db.update(schema.routines)
		.set({ updatedAt: new Date() })
		.where(eq(schema.routines.id, routineId))
		.run();
}

export type RoutineSummary = {
	id: number;
	name: string;
	notes: string | null;
	isArchived: boolean;
	exerciseCount: number;
	/** Enough to render "Back Squat 3×5 · Bench 3×8–12" without a second query. */
	plan: Array<{
		name: string;
		targetSets: number | null;
		targetRepsMin: number | null;
		targetRepsMax: number | null;
	}>;
};

export function listRoutines(userId: number, db: Db = getDb()): RoutineSummary[] {
	const routines = db
		.select()
		.from(schema.routines)
		.where(eq(schema.routines.userId, userId))
		.orderBy(asc(schema.routines.isArchived), asc(schema.routines.name))
		.all();

	if (routines.length === 0) return [];

	const items = db
		.select({
			routineId: schema.routineExercises.routineId,
			name: schema.exercises.name,
			targetSets: schema.routineExercises.targetSets,
			targetRepsMin: schema.routineExercises.targetRepsMin,
			targetRepsMax: schema.routineExercises.targetRepsMax
		})
		.from(schema.routineExercises)
		.innerJoin(schema.exercises, eq(schema.exercises.id, schema.routineExercises.exerciseId))
		.innerJoin(schema.routines, eq(schema.routines.id, schema.routineExercises.routineId))
		.where(eq(schema.routines.userId, userId))
		.orderBy(asc(schema.routineExercises.orderIndex), asc(schema.routineExercises.id))
		.all();

	return routines.map((routine) => {
		const plan = items
			.filter((i) => i.routineId === routine.id)
			.map(({ routineId: _routineId, ...rest }) => rest);
		return {
			id: routine.id,
			name: routine.name,
			notes: routine.notes,
			isArchived: routine.isArchived,
			exerciseCount: plan.length,
			plan
		};
	});
}

export function getRoutine(
	userId: number,
	routineId: number,
	db: Db = getDb()
): RoutineDetail | null {
	const routine = db
		.select()
		.from(schema.routines)
		.where(and(eq(schema.routines.id, routineId), eq(schema.routines.userId, userId)))
		.get();
	if (!routine) return null;

	const items = db
		.select({
			id: schema.routineExercises.id,
			orderIndex: schema.routineExercises.orderIndex,
			targetSets: schema.routineExercises.targetSets,
			targetRepsMin: schema.routineExercises.targetRepsMin,
			targetRepsMax: schema.routineExercises.targetRepsMax,
			targetWeightKg: schema.routineExercises.targetWeightKg,
			targetDistanceM: schema.routineExercises.targetDistanceM,
			targetDurationS: schema.routineExercises.targetDurationS,
			notes: schema.routineExercises.notes,
			exerciseId: schema.exercises.id,
			name: schema.exercises.name,
			kind: schema.exercises.kind,
			primaryMuscle: schema.exercises.primaryMuscle,
			equipment: schema.exercises.equipment
		})
		.from(schema.routineExercises)
		.innerJoin(schema.exercises, eq(schema.exercises.id, schema.routineExercises.exerciseId))
		.where(eq(schema.routineExercises.routineId, routineId))
		.orderBy(asc(schema.routineExercises.orderIndex), asc(schema.routineExercises.id))
		.all();

	return {
		id: routine.id,
		name: routine.name,
		notes: routine.notes,
		isArchived: routine.isArchived,
		exercises: items.map((item) => ({
			id: item.id,
			orderIndex: item.orderIndex,
			targetSets: item.targetSets,
			targetRepsMin: item.targetRepsMin,
			targetRepsMax: item.targetRepsMax,
			targetWeightKg: item.targetWeightKg,
			targetDistanceM: item.targetDistanceM,
			targetDurationS: item.targetDurationS,
			notes: item.notes,
			exercise: {
				id: item.exerciseId,
				name: item.name,
				kind: item.kind,
				primaryMuscle: item.primaryMuscle,
				equipment: item.equipment
			}
		}))
	};
}

export function createRoutine(
	userId: number,
	input: { name: string; notes?: string | null },
	db: Db = getDb()
): number {
	return db
		.insert(schema.routines)
		.values({ userId, name: input.name.trim(), notes: input.notes?.trim() || null })
		.returning({ id: schema.routines.id })
		.get().id;
}

/**
 * Snapshot a logged workout as a reusable routine.
 *
 * Targets come from the working sets only — a warm-up is a property of the day,
 * not of the plan. The weight recorded is the heaviest working set, which is
 * what a lifter means by "the weight I do on this", and the rep target becomes
 * the range that was actually performed: a session of 12/10/8 saves as 8–12
 * rather than pretending 12 was the plan for every set.
 */
export function createRoutineFromWorkout(
	userId: number,
	workoutId: number,
	name: string,
	db: Db = getDb()
): number | null {
	return db.transaction((tx) => {
		const workout = tx
			.select()
			.from(schema.workouts)
			.where(and(eq(schema.workouts.id, workoutId), eq(schema.workouts.userId, userId)))
			.get();
		if (!workout) return null;

		const routineId = tx
			.insert(schema.routines)
			.values({ userId, name: name.trim() || workout.title || 'Routine' })
			.returning({ id: schema.routines.id })
			.get().id;

		const items = tx
			.select()
			.from(schema.workoutExercises)
			.where(eq(schema.workoutExercises.workoutId, workoutId))
			.orderBy(asc(schema.workoutExercises.orderIndex), asc(schema.workoutExercises.id))
			.all();

		items.forEach((item, index) => {
			const stats = tx
				.select({
					setCount: sql<number>`count(*)`,
					maxWeight: sql<number | null>`max(${schema.sets.weightKg})`,
					minReps: sql<number | null>`min(${schema.sets.reps})`,
					maxReps: sql<number | null>`max(${schema.sets.reps})`,
					maxDistance: sql<number | null>`max(${schema.sets.distanceM})`,
					maxDuration: sql<number | null>`max(${schema.sets.durationS})`
				})
				.from(schema.sets)
				.where(
					and(eq(schema.sets.workoutExerciseId, item.id), eq(schema.sets.isWarmup, false))
				)
				.get();

			// Every set at the same reps is an exact target, not a range of one.
			const repsMin = stats?.minReps ?? null;
			const repsMax = stats?.maxReps ?? null;

			tx.insert(schema.routineExercises)
				.values({
					routineId,
					exerciseId: item.exerciseId,
					orderIndex: index,
					targetSets: stats?.setCount || null,
					targetRepsMin: repsMin,
					targetRepsMax: repsMax != null && repsMax !== repsMin ? repsMax : null,
					targetWeightKg: stats?.maxWeight ?? null,
					targetDistanceM: stats?.maxDistance ?? null,
					targetDurationS: stats?.maxDuration ?? null,
					notes: item.notes
				})
				.run();
		});

		return routineId;
	});
}

export function updateRoutine(
	userId: number,
	routineId: number,
	input: { name?: string; notes?: string | null; isArchived?: boolean },
	db: Db = getDb()
): boolean {
	if (!ownsRoutine(userId, routineId, db)) return false;

	const patch: Record<string, unknown> = { updatedAt: new Date() };
	if (input.name !== undefined) patch.name = input.name.trim();
	if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
	if (input.isArchived !== undefined) patch.isArchived = input.isArchived;

	db.update(schema.routines).set(patch).where(eq(schema.routines.id, routineId)).run();
	return true;
}

export function deleteRoutine(userId: number, routineId: number, db: Db = getDb()): boolean {
	if (!ownsRoutine(userId, routineId, db)) return false;
	db.delete(schema.routines).where(eq(schema.routines.id, routineId)).run();
	return true;
}

export function addExerciseToRoutine(
	userId: number,
	routineId: number,
	exerciseId: number,
	db: Db = getDb()
): number | null {
	if (!ownsRoutine(userId, routineId, db)) return null;

	return db.transaction((tx) => {
		const next =
			(tx
				.select({ value: sql<number | null>`max(${schema.routineExercises.orderIndex})` })
				.from(schema.routineExercises)
				.where(eq(schema.routineExercises.routineId, routineId))
				.get()?.value ?? -1) + 1;

		const id = tx
			.insert(schema.routineExercises)
			.values({ routineId, exerciseId, orderIndex: next, targetSets: 3 })
			.returning({ id: schema.routineExercises.id })
			.get().id;

		touch(routineId, tx as Db);
		return id;
	});
}

/**
 * Put a submitted rep target into canonical form.
 *
 * Two cases are forgiven rather than rejected, because both are obvious typos
 * and refusing them would just make the user retype the row: a range entered
 * backwards is swapped, and an upper bound with no lower bound is read as the
 * exact target. `min === max` collapses to an exact target so that "5–5" is
 * never stored, which keeps display and prefill logic from special-casing it.
 */
export function normaliseRepTarget(
	min: number | null,
	max: number | null
): { min: number | null; max: number | null } {
	if (min == null && max == null) return { min: null, max: null };
	if (min == null) return { min: max, max: null };
	if (max == null) return { min, max: null };
	if (max < min) return { min: max, max: min };
	if (max === min) return { min, max: null };
	return { min, max };
}

export type RoutineTargets = {
	targetSets?: number | null;
	targetRepsMin?: number | null;
	targetRepsMax?: number | null;
	targetWeightKg?: number | null;
	targetDistanceM?: number | null;
	targetDurationS?: number | null;
	notes?: string | null;
};

export function updateRoutineItem(
	userId: number,
	itemId: number,
	targets: RoutineTargets,
	db: Db = getDb()
): boolean {
	const routineId = routineIdForItem(userId, itemId, db);
	if (routineId == null) return false;

	db.update(schema.routineExercises)
		.set(targets)
		.where(eq(schema.routineExercises.id, itemId))
		.run();
	touch(routineId, db);
	return true;
}

export function removeRoutineItem(userId: number, itemId: number, db: Db = getDb()): boolean {
	const routineId = routineIdForItem(userId, itemId, db);
	if (routineId == null) return false;
	db.delete(schema.routineExercises).where(eq(schema.routineExercises.id, itemId)).run();
	touch(routineId, db);
	return true;
}

export function moveRoutineItem(
	userId: number,
	itemId: number,
	direction: -1 | 1,
	db: Db = getDb()
): boolean {
	const routineId = routineIdForItem(userId, itemId, db);
	if (routineId == null) return false;

	return db.transaction((tx) => {
		const ordered = tx
			.select({ id: schema.routineExercises.id })
			.from(schema.routineExercises)
			.where(eq(schema.routineExercises.routineId, routineId))
			.orderBy(asc(schema.routineExercises.orderIndex), asc(schema.routineExercises.id))
			.all()
			.map((r) => r.id);

		const from = ordered.indexOf(itemId);
		const to = from + direction;
		if (from < 0 || to < 0 || to >= ordered.length) return false;

		ordered.splice(to, 0, ordered.splice(from, 1)[0]);
		ordered.forEach((id, index) => {
			tx.update(schema.routineExercises)
				.set({ orderIndex: index })
				.where(eq(schema.routineExercises.id, id))
				.run();
		});
		touch(routineId, tx as Db);
		return true;
	});
}
