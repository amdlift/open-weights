import { and, eq, isNull, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createConnection, runMigrations, seedBuiltinExercises, type Db } from './index';
import { SEED_EXERCISES } from './seed-exercises';
import * as schema from './schema';

function freshDb(): Db {
	const db = createConnection(':memory:');
	runMigrations(db);
	return db;
}

describe('migrations', () => {
	it('creates every table the app queries', () => {
		const db = freshDb();
		const rows = db.all<{ name: string }>(
			sql`select name from sqlite_master where type = 'table'`
		);
		const names = new Set(rows.map((r) => r.name));

		for (const table of [
			'users',
			'user_profiles',
			'sessions',
			'exercises',
			'user_hidden_exercises',
			'workouts',
			'workout_exercises',
			'sets',
			'routines',
			'routine_exercises',
			'body_measurements',
			'instance_meta'
		]) {
			expect(names, `missing table ${table}`).toContain(table);
		}
	});

	it('enforces the partial unique index on built-in slugs', () => {
		const db = freshDb();
		const insert = () =>
			db
				.insert(schema.exercises)
				.values({
					ownerUserId: null,
					slug: 'dupe',
					name: 'Dupe',
					kind: 'weight_reps'
				})
				.run();

		insert();
		expect(insert).toThrow(/UNIQUE/i);
	});
});

describe('seedBuiltinExercises', () => {
	it('inserts the full built-in library', () => {
		const db = freshDb();
		seedBuiltinExercises(db);

		const builtins = db
			.select()
			.from(schema.exercises)
			.where(isNull(schema.exercises.ownerUserId))
			.all();

		expect(builtins).toHaveLength(SEED_EXERCISES.length);
	});

	it('is idempotent — re-running does not duplicate rows', () => {
		const db = freshDb();
		seedBuiltinExercises(db);
		const firstIds = db
			.select({ id: schema.exercises.id })
			.from(schema.exercises)
			.all()
			.map((r) => r.id);

		seedBuiltinExercises(db);
		const secondIds = db
			.select({ id: schema.exercises.id })
			.from(schema.exercises)
			.all()
			.map((r) => r.id);

		expect(secondIds).toEqual(firstIds);
	});

	it('leaves user-created exercises alone even when the slug collides', () => {
		const db = freshDb();
		seedBuiltinExercises(db);

		const [user] = db
			.insert(schema.users)
			.values({ username: 'lifter', displayName: 'Lifter', passwordHash: 'x' })
			.returning()
			.all();

		db.insert(schema.exercises)
			.values({
				ownerUserId: user.id,
				slug: 'back-squat',
				name: 'Back Squat (my cue sheet)',
				kind: 'weight_reps',
				primaryMuscle: 'quads',
				equipment: 'barbell'
			})
			.run();

		seedBuiltinExercises(db);

		const mine = db
			.select()
			.from(schema.exercises)
			.where(
				and(eq(schema.exercises.ownerUserId, user.id), eq(schema.exercises.slug, 'back-squat'))
			)
			.all();

		expect(mine).toHaveLength(1);
		expect(mine[0].name).toBe('Back Squat (my cue sheet)');
	});

	it('refreshes the name of an existing built-in without changing its id', () => {
		const db = freshDb();
		seedBuiltinExercises(db);

		const before = db
			.select()
			.from(schema.exercises)
			.where(and(isNull(schema.exercises.ownerUserId), eq(schema.exercises.slug, 'deadlift')))
			.get();

		db.update(schema.exercises)
			.set({ name: 'stale name', isArchived: true })
			.where(eq(schema.exercises.id, before!.id))
			.run();

		seedBuiltinExercises(db);

		const after = db
			.select()
			.from(schema.exercises)
			.where(eq(schema.exercises.id, before!.id))
			.get();

		expect(after!.name).toBe('Deadlift');
		expect(after!.isArchived).toBe(false);
	});
});

describe('seed data integrity', () => {
	it('has no duplicate slugs', () => {
		const slugs = SEED_EXERCISES.map((e) => e.slug);
		expect(new Set(slugs).size).toBe(slugs.length);
	});

	it('uses slug-safe identifiers', () => {
		for (const e of SEED_EXERCISES) {
			expect(e.slug, `${e.name} has a non slug-safe identifier`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
		}
	});

	it('gives every cardio exercise the cardio muscle group and vice versa', () => {
		for (const e of SEED_EXERCISES) {
			if (e.kind === 'cardio') expect(e.primaryMuscle).toBe('cardio');
			if (e.primaryMuscle === 'cardio') expect(e.kind).toBe('cardio');
		}
	});
});
