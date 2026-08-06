import { eq } from 'drizzle-orm';
import { createConnection, runMigrations, seedBuiltinExercises, type Db } from './db';
import * as schema from './db/schema';

/**
 * Fixtures for the server-side tests. Everything runs against a real in-memory
 * SQLite database with the real migrations applied, so foreign keys, partial
 * indexes and cascade behaviour are exercised rather than mocked away.
 */

export function testDb(): Db {
	const db = createConnection(':memory:');
	runMigrations(db);
	seedBuiltinExercises(db);
	return db;
}

/**
 * Inserts a user directly rather than going through `createUser`, which would
 * spend ~50ms hashing a password we never check in these tests.
 */
export function makeUser(db: Db, username = 'lifter'): number {
	const user = db
		.insert(schema.users)
		.values({
			username,
			displayName: username,
			passwordHash: 'not-a-real-hash',
			onboardedAt: new Date()
		})
		.returning({ id: schema.users.id })
		.get();

	db.insert(schema.userProfiles).values({ userId: user.id }).run();
	return user.id;
}

export function exerciseIdBySlug(db: Db, slug: string): number {
	const row = db
		.select({ id: schema.exercises.id })
		.from(schema.exercises)
		.where(eq(schema.exercises.slug, slug))
		.get();
	if (!row) throw new Error(`No seeded exercise with slug "${slug}"`);
	return row.id;
}
