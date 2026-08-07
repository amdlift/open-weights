import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';
import type { EquipmentType, ExerciseKind, MuscleGroup } from '$lib/constants';
import { getDb, type Db } from './db';
import * as schema from './db/schema';

export type ExerciseListItem = {
	id: number;
	slug: string;
	name: string;
	kind: ExerciseKind;
	primaryMuscle: MuscleGroup | null;
	equipment: EquipmentType | null;
	notes: string | null;
	isCustom: boolean;
	isHidden: boolean;
	/** How many times the user has logged this, used for "recently used" sorting. */
	useCount: number;
	lastUsedOn: string | null;
};

export type ExerciseFilters = {
	/** Include exercises the user has hidden. */
	includeHidden?: boolean;
};

/**
 * Every exercise this user can pick from: the shared built-ins plus their own,
 * annotated with usage so the picker can float familiar movements to the top.
 *
 * Retired built-ins (`is_archived`) are excluded unless the user has actually
 * logged them, in which case they remain visible for history but sort last.
 *
 * Searching and narrowing by muscle or equipment deliberately do not happen
 * here. The library is small enough to ship whole with the page, and every
 * caller filters it on the client so typing feels instant — see
 * `ExercisePicker.svelte` and the exercise library page.
 */
export function listExercises(
	userId: number,
	filters: ExerciseFilters = {},
	db: Db = getDb()
): ExerciseListItem[] {
	const hidden = db
		.select({ exerciseId: schema.userHiddenExercises.exerciseId })
		.from(schema.userHiddenExercises)
		.where(eq(schema.userHiddenExercises.userId, userId))
		.all();
	const hiddenIds = new Set(hidden.map((h) => h.exerciseId));

	const usage = db
		.select({
			exerciseId: schema.workoutExercises.exerciseId,
			useCount: sql<number>`count(*)`,
			lastUsedOn: sql<string | null>`max(${schema.workouts.performedOn})`
		})
		.from(schema.workoutExercises)
		.innerJoin(schema.workouts, eq(schema.workouts.id, schema.workoutExercises.workoutId))
		.where(eq(schema.workouts.userId, userId))
		.groupBy(schema.workoutExercises.exerciseId)
		.all();
	const usageById = new Map(usage.map((u) => [u.exerciseId, u]));

	const rows = db
		.select()
		.from(schema.exercises)
		.where(
			or(isNull(schema.exercises.ownerUserId), eq(schema.exercises.ownerUserId, userId))
		)
		.orderBy(asc(schema.exercises.name))
		.all();

	return rows
		.map((row) => {
			const stats = usageById.get(row.id);
			return {
				id: row.id,
				slug: row.slug,
				name: row.name,
				kind: row.kind,
				primaryMuscle: row.primaryMuscle,
				equipment: row.equipment,
				notes: row.notes,
				isCustom: row.ownerUserId != null,
				isHidden: hiddenIds.has(row.id),
				isArchived: row.isArchived,
				useCount: stats?.useCount ?? 0,
				lastUsedOn: stats?.lastUsedOn ?? null
			};
		})
		.filter((item) => {
			// A built-in dropped by a later release stays only if it is in use.
			if (item.isArchived && item.useCount === 0) return false;
			if (!filters.includeHidden && item.isHidden) return false;
			return true;
		})
		.map(({ isArchived: _isArchived, ...item }) => item);
}

/** Fetch one exercise, but only if this user is allowed to see it. */
export function getExercise(userId: number, exerciseId: number, db: Db = getDb()) {
	return (
		db
			.select()
			.from(schema.exercises)
			.where(
				and(
					eq(schema.exercises.id, exerciseId),
					or(isNull(schema.exercises.ownerUserId), eq(schema.exercises.ownerUserId, userId))
				)
			)
			.get() ?? null
	);
}

export type CustomExerciseInput = {
	name: string;
	kind: ExerciseKind;
	primaryMuscle: MuscleGroup | null;
	equipment: EquipmentType | null;
	notes: string | null;
};

export function createCustomExercise(
	userId: number,
	input: CustomExerciseInput,
	db: Db = getDb()
) {
	return db.transaction((tx) => {
		const slug = uniqueSlugFor(userId, input.name, null, tx as Db);
		return tx
			.insert(schema.exercises)
			.values({ ...input, ownerUserId: userId, slug })
			.returning()
			.get();
	});
}

/** Only the owner of a custom exercise may edit it; built-ins are read-only. */
export function updateCustomExercise(
	userId: number,
	exerciseId: number,
	input: CustomExerciseInput,
	db: Db = getDb()
): boolean {
	return db.transaction((tx) => {
		const existing = tx
			.select()
			.from(schema.exercises)
			.where(
				and(eq(schema.exercises.id, exerciseId), eq(schema.exercises.ownerUserId, userId))
			)
			.get();
		if (!existing) return false;

		const slug =
			existing.name === input.name
				? existing.slug
				: uniqueSlugFor(userId, input.name, exerciseId, tx as Db);

		tx.update(schema.exercises)
			.set({ ...input, slug })
			.where(eq(schema.exercises.id, exerciseId))
			.run();
		return true;
	});
}

export function setExerciseHidden(
	userId: number,
	exerciseId: number,
	hidden: boolean,
	db: Db = getDb()
): void {
	if (hidden) {
		db.insert(schema.userHiddenExercises)
			.values({ userId, exerciseId })
			.onConflictDoNothing()
			.run();
	} else {
		db.delete(schema.userHiddenExercises)
			.where(
				and(
					eq(schema.userHiddenExercises.userId, userId),
					eq(schema.userHiddenExercises.exerciseId, exerciseId)
				)
			)
			.run();
	}
}

export function countExerciseUses(userId: number, exerciseId: number, db: Db = getDb()): number {
	return (
		db
			.select({ value: sql<number>`count(*)` })
			.from(schema.workoutExercises)
			.innerJoin(schema.workouts, eq(schema.workouts.id, schema.workoutExercises.workoutId))
			.where(
				and(
					eq(schema.workouts.userId, userId),
					eq(schema.workoutExercises.exerciseId, exerciseId)
				)
			)
			.get()?.value ?? 0
	);
}

/**
 * Delete a custom exercise outright. Refused once it appears in a workout or a
 * routine — that history would otherwise lose its label. Callers fall back to
 * hiding it.
 */
export function deleteCustomExercise(
	userId: number,
	exerciseId: number,
	db: Db = getDb()
): { deleted: boolean; reason?: 'in_use' | 'not_found' } {
	return db.transaction((tx) => {
		const existing = tx
			.select()
			.from(schema.exercises)
			.where(
				and(eq(schema.exercises.id, exerciseId), eq(schema.exercises.ownerUserId, userId))
			)
			.get();
		if (!existing) return { deleted: false, reason: 'not_found' as const };

		const inWorkouts =
			tx
				.select({ value: sql<number>`count(*)` })
				.from(schema.workoutExercises)
				.where(eq(schema.workoutExercises.exerciseId, exerciseId))
				.get()?.value ?? 0;
		const inRoutines =
			tx
				.select({ value: sql<number>`count(*)` })
				.from(schema.routineExercises)
				.where(eq(schema.routineExercises.exerciseId, exerciseId))
				.get()?.value ?? 0;

		if (inWorkouts > 0 || inRoutines > 0) return { deleted: false, reason: 'in_use' as const };

		tx.delete(schema.userHiddenExercises)
			.where(eq(schema.userHiddenExercises.exerciseId, exerciseId))
			.run();
		tx.delete(schema.exercises).where(eq(schema.exercises.id, exerciseId)).run();
		return { deleted: true };
	});
}

export function slugify(name: string): string {
	const slug = name
		.toLowerCase()
		.normalize('NFKD')
		// Strip combining marks so "Sumo Déadlift" and "Sumo Deadlift" collide
		// the way a user would expect rather than producing two entries.
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60);
	return slug || 'exercise';
}

/**
 * Custom slugs only need to be unique within one user's library, so a name that
 * collides with a built-in is fine — the partial indexes keep the two spaces
 * separate.
 */
function uniqueSlugFor(
	userId: number,
	name: string,
	excludeId: number | null,
	db: Db
): string {
	const base = slugify(name);
	const taken = new Set(
		db
			.select({ slug: schema.exercises.slug, id: schema.exercises.id })
			.from(schema.exercises)
			.where(eq(schema.exercises.ownerUserId, userId))
			.all()
			.filter((row) => row.id !== excludeId)
			.map((row) => row.slug)
	);

	if (!taken.has(base)) return base;
	for (let n = 2; n < 1000; n++) {
		const candidate = `${base}-${n}`;
		if (!taken.has(candidate)) return candidate;
	}
	// Practically unreachable; keeps the function total rather than looping.
	return `${base}-${Date.now()}`;
}
