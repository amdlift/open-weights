import { and, count, eq } from 'drizzle-orm';
import { getDb, type Db } from './db';
import * as schema from './db/schema';
import type { Gender, UnitSystem, UserRole } from './db/schema';
import { hashPassword, normalizeUsername } from './auth';

export type NewUserInput = {
	username: string;
	displayName: string;
	password: string;
	role?: UserRole;
	/** True for admin-provisioned accounts, which must be changed at first login. */
	mustChangePassword?: boolean;
};

export function countUsers(db: Db = getDb()): number {
	return db.select({ value: count() }).from(schema.users).get()?.value ?? 0;
}

/**
 * Whether the public sign-up page should work.
 *
 * Registration is open only until the instance has its first account — that one
 * becomes the admin, and everyone after is created from Settings → Users. An
 * operator can close the window entirely with DISABLE_SIGNUP for an instance
 * that is internet-facing before it is first opened.
 */
export function isSignupOpen(db: Db = getDb()): boolean {
	if (process.env.DISABLE_SIGNUP === '1' || process.env.DISABLE_SIGNUP === 'true') return false;
	return countUsers(db) === 0;
}

export function getUserByUsername(username: string, db: Db = getDb()) {
	return db
		.select()
		.from(schema.users)
		.where(eq(schema.users.username, normalizeUsername(username)))
		.get();
}

export function getProfile(userId: number, db: Db = getDb()) {
	return db
		.select()
		.from(schema.userProfiles)
		.where(eq(schema.userProfiles.userId, userId))
		.get();
}

export class UsernameTakenError extends Error {
	constructor() {
		super('That username is already taken.');
		this.name = 'UsernameTakenError';
	}
}

/**
 * Create an account together with its profile row.
 *
 * The very first account on an instance is always the admin; callers do not get
 * to choose that, so a race between two people hitting the sign-up page cannot
 * produce two admins or — worse — an instance whose only user is not one.
 */
export async function createUser(input: NewUserInput, db: Db = getDb()) {
	const username = normalizeUsername(input.username);
	const passwordHash = await hashPassword(input.password);

	try {
		return db.transaction((tx) => {
			const isFirstUser = countUsers(tx as Db) === 0;
			const role: UserRole = isFirstUser ? 'admin' : (input.role ?? 'user');

			const user = tx
				.insert(schema.users)
				.values({
					username,
					displayName: input.displayName.trim() || username,
					passwordHash,
					role,
					mustChangePassword: input.mustChangePassword ?? false
				})
				.returning()
				.get();

			tx.insert(schema.userProfiles)
				.values({ userId: user.id, timezone: process.env.TZ ?? 'UTC' })
				.run();

			return user;
		});
	} catch (err) {
		if (isUniqueViolation(err)) throw new UsernameTakenError();
		throw err;
	}
}

export async function setPassword(
	userId: number,
	password: string,
	options: { mustChangePassword?: boolean } = {},
	db: Db = getDb()
): Promise<void> {
	const passwordHash = await hashPassword(password);
	db.update(schema.users)
		.set({ passwordHash, mustChangePassword: options.mustChangePassword ?? false })
		.where(eq(schema.users.id, userId))
		.run();
}

export type OnboardingInput = {
	displayName: string;
	dateOfBirth: string;
	heightCm: number;
	gender: Gender;
	unitSystem: UnitSystem;
	weekStartsOn: number;
	timezone: string;
};

export function completeOnboarding(
	userId: number,
	input: OnboardingInput,
	db: Db = getDb()
): void {
	db.transaction((tx) => {
		tx.update(schema.users)
			.set({ displayName: input.displayName, onboardedAt: new Date() })
			.where(eq(schema.users.id, userId))
			.run();

		tx.update(schema.userProfiles)
			.set({
				dateOfBirth: input.dateOfBirth,
				heightCm: input.heightCm,
				gender: input.gender,
				unitSystem: input.unitSystem,
				weekStartsOn: input.weekStartsOn,
				timezone: input.timezone
			})
			.where(eq(schema.userProfiles.userId, userId))
			.run();
	});
}

export function listUsers(db: Db = getDb()) {
	return db
		.select({
			id: schema.users.id,
			username: schema.users.username,
			displayName: schema.users.displayName,
			role: schema.users.role,
			isActive: schema.users.isActive,
			mustChangePassword: schema.users.mustChangePassword,
			onboardedAt: schema.users.onboardedAt,
			createdAt: schema.users.createdAt
		})
		.from(schema.users)
		.orderBy(schema.users.id)
		.all();
}

/**
 * Admin actions guard against locking the instance out of its own settings:
 * the last *active* admin can be neither demoted nor deactivated.
 */
export function countActiveAdmins(db: Db = getDb()): number {
	return (
		db
			.select({ value: count() })
			.from(schema.users)
			.where(and(eq(schema.users.role, 'admin'), eq(schema.users.isActive, true)))
			.get()?.value ?? 0
	);
}

/**
 * Remove an account and everything it owns.
 *
 * The child rows are deleted explicitly, oldest dependency last, because
 * `workout_exercises.exercise_id` is ON DELETE RESTRICT: letting the cascade
 * from `users` reach `exercises` while workout rows still referenced them would
 * abort the whole delete.
 */
export function deleteUser(userId: number, db: Db = getDb()): void {
	db.transaction((tx) => {
		const workoutIds = tx
			.select({ id: schema.workouts.id })
			.from(schema.workouts)
			.where(eq(schema.workouts.userId, userId))
			.all()
			.map((r) => r.id);

		if (workoutIds.length > 0) {
			// sets cascade from workout_exercises, which cascade from workouts.
			tx.delete(schema.workouts).where(eq(schema.workouts.userId, userId)).run();
		}

		// Before the custom exercises below: a program's prescriptions and its
		// snapshotted maxes both hold `restrict` references to `exercises`, so
		// leaving them for the cascade would abort the whole delete for anyone who
		// had ever put a custom movement in a program.
		tx.delete(schema.programEnrollments)
			.where(eq(schema.programEnrollments.userId, userId))
			.run();
		tx.delete(schema.programs).where(eq(schema.programs.userId, userId)).run();

		tx.delete(schema.routines).where(eq(schema.routines.userId, userId)).run();
		tx.delete(schema.bodyMeasurements)
			.where(eq(schema.bodyMeasurements.userId, userId))
			.run();
		tx.delete(schema.userHiddenExercises)
			.where(eq(schema.userHiddenExercises.userId, userId))
			.run();
		tx.delete(schema.exercises).where(eq(schema.exercises.ownerUserId, userId)).run();
		tx.delete(schema.users).where(eq(schema.users.id, userId)).run();
	});
}

export function setUserRole(userId: number, role: UserRole, db: Db = getDb()): void {
	db.update(schema.users).set({ role }).where(eq(schema.users.id, userId)).run();
}

export function setUserActive(userId: number, isActive: boolean, db: Db = getDb()): void {
	db.update(schema.users).set({ isActive }).where(eq(schema.users.id, userId)).run();
}

export function getUserById(userId: number, db: Db = getDb()) {
	return db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
}

function isUniqueViolation(err: unknown): boolean {
	return (
		typeof err === 'object' &&
		err !== null &&
		'code' in err &&
		String((err as { code: unknown }).code).startsWith('SQLITE_CONSTRAINT')
	);
}
