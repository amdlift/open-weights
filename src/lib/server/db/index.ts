import Database from 'better-sqlite3';
import { and, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import fs from 'node:fs';
import path from 'node:path';
import { SEED_EXERCISES } from './seed-exercises';
import * as schema from './schema';

export type Db = BetterSQLite3Database<typeof schema>;

const MIGRATIONS_DIR = path.join(process.cwd(), 'drizzle');

/**
 * Open a database and put it into the configuration this app expects.
 *
 * WAL keeps readers from blocking on the writer, which matters because
 * better-sqlite3 is synchronous and the whole app shares one connection.
 * `busy_timeout` covers the brief exclusive locks WAL still takes at checkpoint.
 */
export function createConnection(file: string): Db {
	if (file !== ':memory:') {
		fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
	}

	const sqlite = new Database(file);
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('synchronous = NORMAL');
	sqlite.pragma('foreign_keys = ON');
	sqlite.pragma('busy_timeout = 5000');

	return drizzle(sqlite, { schema });
}

export function runMigrations(db: Db, migrationsFolder = MIGRATIONS_DIR): void {
	migrate(db, { migrationsFolder });
}

/**
 * Insert or refresh the built-in exercise primitives.
 *
 * Idempotent and keyed on `slug`, so pulling a newer image picks up added
 * exercises and corrected names without duplicating rows or touching anything
 * the user created. Built-ins that a release drops are archived rather than
 * deleted, because existing workouts still reference them.
 */
export function seedBuiltinExercises(db: Db): void {
	const slugs = SEED_EXERCISES.map((e) => e.slug);

	db.transaction((tx) => {
		for (const exercise of SEED_EXERCISES) {
			tx.insert(schema.exercises)
				.values({ ...exercise, ownerUserId: null, isArchived: false })
				.onConflictDoUpdate({
					target: schema.exercises.slug,
					targetWhere: sql`owner_user_id is null`,
					set: {
						name: exercise.name,
						kind: exercise.kind,
						primaryMuscle: exercise.primaryMuscle,
						equipment: exercise.equipment,
						isArchived: false
					}
				})
				.run();
		}

		tx.update(schema.exercises)
			.set({ isArchived: true })
			.where(
				and(isNull(schema.exercises.ownerUserId), notInArray(schema.exercises.slug, slugs))
			)
			.run();
	});
}

// Cached on globalThis so a dev-server hot reload reuses the existing
// connection instead of leaking a new one on every module invalidation.
const cache = globalThis as typeof globalThis & { __owDb?: Db };

/**
 * The application's database handle.
 *
 * Migrations and the exercise seed run on first access rather than in the
 * container entrypoint, so `docker pull && docker compose up` is the entire
 * upgrade procedure and `vite dev` behaves identically.
 */
export function getDb(): Db {
	if (cache.__owDb) return cache.__owDb;

	const file = process.env.DATABASE_PATH ?? path.join(process.cwd(), 'data', 'openweights.db');
	const db = createConnection(file);

	runMigrations(db);
	seedBuiltinExercises(db);

	cache.__owDb = db;
	return db;
}

export { schema, eq, and, inArray, isNull, sql };
