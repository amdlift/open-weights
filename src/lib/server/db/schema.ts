import { relations, sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import {
	EQUIPMENT_TYPES,
	EXERCISE_KINDS,
	GENDERS,
	MUSCLE_GROUPS,
	ONE_RM_FORMULAS,
	THEMES,
	UNIT_SYSTEMS,
	USER_ROLES
} from '../../constants';

/**
 * Conventions used throughout this schema:
 *
 *  - Measurements are stored in metric only (kg, cm, m, seconds). Conversion to
 *    the user's preferred units happens at the edges, in `$lib/units`.
 *  - Calendar days are stored as `YYYY-MM-DD` strings in the user's own
 *    timezone. Storing an instant instead would drift a late-evening workout
 *    onto the wrong calendar square.
 *  - Instants (created/updated/expires) are Unix timestamps.
 */

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export const users = sqliteTable(
	'users',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		/** Always stored lower-cased; the unique index is what enforces identity. */
		username: text('username').notNull(),
		displayName: text('display_name').notNull(),
		passwordHash: text('password_hash').notNull(),
		role: text('role', { enum: USER_ROLES }).notNull().default('user'),
		/** Set when an admin provisions the account with a temporary password. */
		mustChangePassword: integer('must_change_password', { mode: 'boolean' })
			.notNull()
			.default(false),
		/** Null until the user has filled in date of birth / height / gender. */
		onboardedAt: integer('onboarded_at', { mode: 'timestamp' }),
		isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`)
	},
	(t) => [uniqueIndex('users_username_unique').on(t.username)]
);

export const userProfiles = sqliteTable('user_profiles', {
	userId: integer('user_id')
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	dateOfBirth: text('date_of_birth'),
	heightCm: real('height_cm'),
	gender: text('gender', { enum: GENDERS }),
	unitSystem: text('unit_system', { enum: UNIT_SYSTEMS }).notNull().default('metric'),
	oneRmFormula: text('one_rm_formula', { enum: ONE_RM_FORMULAS }).notNull().default('epley'),
	/** 0 = Sunday, 1 = Monday. */
	weekStartsOn: integer('week_starts_on').notNull().default(1),
	timezone: text('timezone').notNull().default('UTC'),
	theme: text('theme', { enum: THEMES }).notNull().default('system'),
	/** Exercise ids charted on the dashboard, as a JSON array. */
	pinnedExerciseIds: text('pinned_exercise_ids', { mode: 'json' })
		.$type<number[]>()
		.notNull()
		.default(sql`'[]'`)
});

export const sessions = sqliteTable(
	'sessions',
	{
		/** SHA-256 of the cookie token — the raw token is never stored. */
		id: text('id').primaryKey(),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`)
	},
	(t) => [index('sessions_user_idx').on(t.userId)]
);

// ---------------------------------------------------------------------------
// Exercise library
// ---------------------------------------------------------------------------

export const exercises = sqliteTable(
	'exercises',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		/** Null for the built-in primitives shipped with the image. */
		ownerUserId: integer('owner_user_id').references(() => users.id, { onDelete: 'cascade' }),
		/** Stable identifier; built-ins are re-seeded by slug on every upgrade. */
		slug: text('slug').notNull(),
		name: text('name').notNull(),
		kind: text('kind', { enum: EXERCISE_KINDS }).notNull(),
		primaryMuscle: text('primary_muscle', { enum: MUSCLE_GROUPS }),
		equipment: text('equipment', { enum: EQUIPMENT_TYPES }),
		notes: text('notes'),
		/**
		 * System-level retirement, only ever set by the seeder when a built-in is
		 * dropped from a later release. Users hide exercises through
		 * `userHiddenExercises` instead — built-ins are shared rows, so a per-user
		 * decision must not be written onto them.
		 */
		isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`)
	},
	(t) => [
		// SQLite treats NULLs as distinct, so the built-ins need their own partial
		// index to stop the seeder inserting duplicates.
		uniqueIndex('exercises_builtin_slug_unique')
			.on(t.slug)
			.where(sql`owner_user_id is null`),
		uniqueIndex('exercises_owner_slug_unique')
			.on(t.ownerUserId, t.slug)
			.where(sql`owner_user_id is not null`),
		index('exercises_owner_idx').on(t.ownerUserId)
	]
);

/**
 * Per-user "hide this from my picker". Custom exercises are only ever visible
 * to their owner, so for them this doubles as archiving.
 */
export const userHiddenExercises = sqliteTable(
	'user_hidden_exercises',
	{
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		exerciseId: integer('exercise_id')
			.notNull()
			.references(() => exercises.id, { onDelete: 'cascade' })
	},
	(t) => [uniqueIndex('user_hidden_exercises_pk').on(t.userId, t.exerciseId)]
);

// ---------------------------------------------------------------------------
// Workouts
// ---------------------------------------------------------------------------

export const workouts = sqliteTable(
	'workouts',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		/** `YYYY-MM-DD` in the user's timezone. */
		performedOn: text('performed_on').notNull(),
		title: text('title'),
		notes: text('notes'),
		startedAt: integer('started_at', { mode: 'timestamp' }),
		endedAt: integer('ended_at', { mode: 'timestamp' }),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`)
	},
	(t) => [index('workouts_user_date_idx').on(t.userId, t.performedOn)]
);

export const workoutExercises = sqliteTable(
	'workout_exercises',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		workoutId: integer('workout_id')
			.notNull()
			.references(() => workouts.id, { onDelete: 'cascade' }),
		exerciseId: integer('exercise_id')
			.notNull()
			.references(() => exercises.id, { onDelete: 'restrict' }),
		orderIndex: integer('order_index').notNull().default(0),
		notes: text('notes')
	},
	(t) => [
		index('workout_exercises_workout_idx').on(t.workoutId, t.orderIndex),
		index('workout_exercises_exercise_idx').on(t.exerciseId)
	]
);

/**
 * One logged set. Which columns carry meaning is decided by the parent
 * exercise's `kind`: strength work uses weight/reps/rpe, cardio uses
 * distance/duration, planks and carries use duration alone.
 */
export const sets = sqliteTable(
	'sets',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		workoutExerciseId: integer('workout_exercise_id')
			.notNull()
			.references(() => workoutExercises.id, { onDelete: 'cascade' }),
		orderIndex: integer('order_index').notNull().default(0),
		weightKg: real('weight_kg'),
		reps: integer('reps'),
		/** Rate of perceived exertion, 5–10 in half-point steps. */
		rpe: real('rpe'),
		distanceM: real('distance_m'),
		durationS: integer('duration_s'),
		isWarmup: integer('is_warmup', { mode: 'boolean' }).notNull().default(false),
		isCompleted: integer('is_completed', { mode: 'boolean' }).notNull().default(true)
	},
	(t) => [index('sets_workout_exercise_idx').on(t.workoutExerciseId, t.orderIndex)]
);

// ---------------------------------------------------------------------------
// Routines (workout templates)
// ---------------------------------------------------------------------------

export const routines = sqliteTable(
	'routines',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		notes: text('notes'),
		isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`)
	},
	(t) => [index('routines_user_idx').on(t.userId)]
);

export const routineExercises = sqliteTable(
	'routine_exercises',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		routineId: integer('routine_id')
			.notNull()
			.references(() => routines.id, { onDelete: 'cascade' }),
		exerciseId: integer('exercise_id')
			.notNull()
			.references(() => exercises.id, { onDelete: 'restrict' }),
		orderIndex: integer('order_index').notNull().default(0),
		targetSets: integer('target_sets'),
		/**
		 * Rep target, as a range. `min` alone means an exact target ("5 reps");
		 * both set means a range ("8–12 reps").
		 *
		 * The column is still called `target_reps` because it predates the range
		 * and renaming it would mean rewriting the table for no user-visible
		 * gain. The TypeScript name is what the app reads.
		 */
		targetRepsMin: integer('target_reps'),
		targetRepsMax: integer('target_reps_max'),
		targetWeightKg: real('target_weight_kg'),
		targetDistanceM: real('target_distance_m'),
		targetDurationS: integer('target_duration_s'),
		notes: text('notes')
	},
	(t) => [index('routine_exercises_routine_idx').on(t.routineId, t.orderIndex)]
);

// ---------------------------------------------------------------------------
// Body measurements
// ---------------------------------------------------------------------------

export const bodyMeasurements = sqliteTable(
	'body_measurements',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		measuredOn: text('measured_on').notNull(),
		weightKg: real('weight_kg'),
		bodyFatPct: real('body_fat_pct'),
		neckCm: real('neck_cm'),
		chestCm: real('chest_cm'),
		waistCm: real('waist_cm'),
		hipsCm: real('hips_cm'),
		armCm: real('arm_cm'),
		thighCm: real('thigh_cm'),
		calfCm: real('calf_cm'),
		notes: text('notes')
	},
	(t) => [uniqueIndex('body_measurements_user_date_unique').on(t.userId, t.measuredOn)]
);

// ---------------------------------------------------------------------------
// Instance bookkeeping
// ---------------------------------------------------------------------------

export const instanceMeta = sqliteTable('instance_meta', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});

// ---------------------------------------------------------------------------
// Relations (used by drizzle's relational query builder)
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ one, many }) => ({
	profile: one(userProfiles, { fields: [users.id], references: [userProfiles.userId] }),
	workouts: many(workouts),
	routines: many(routines),
	measurements: many(bodyMeasurements)
}));

export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
	user: one(users, { fields: [userProfiles.userId], references: [users.id] })
}));

export const exercisesRelations = relations(exercises, ({ one, many }) => ({
	owner: one(users, { fields: [exercises.ownerUserId], references: [users.id] }),
	workoutExercises: many(workoutExercises)
}));

export const workoutsRelations = relations(workouts, ({ one, many }) => ({
	user: one(users, { fields: [workouts.userId], references: [users.id] }),
	exercises: many(workoutExercises)
}));

export const workoutExercisesRelations = relations(workoutExercises, ({ one, many }) => ({
	workout: one(workouts, { fields: [workoutExercises.workoutId], references: [workouts.id] }),
	exercise: one(exercises, { fields: [workoutExercises.exerciseId], references: [exercises.id] }),
	sets: many(sets)
}));

export const setsRelations = relations(sets, ({ one }) => ({
	workoutExercise: one(workoutExercises, {
		fields: [sets.workoutExerciseId],
		references: [workoutExercises.id]
	})
}));

export const routinesRelations = relations(routines, ({ one, many }) => ({
	user: one(users, { fields: [routines.userId], references: [users.id] }),
	exercises: many(routineExercises)
}));

export const routineExercisesRelations = relations(routineExercises, ({ one }) => ({
	routine: one(routines, { fields: [routineExercises.routineId], references: [routines.id] }),
	exercise: one(exercises, { fields: [routineExercises.exerciseId], references: [exercises.id] })
}));

export const bodyMeasurementsRelations = relations(bodyMeasurements, ({ one }) => ({
	user: one(users, { fields: [bodyMeasurements.userId], references: [users.id] })
}));

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type UserProfile = typeof userProfiles.$inferSelect;
export type Exercise = typeof exercises.$inferSelect;
export type Workout = typeof workouts.$inferSelect;
export type WorkoutExercise = typeof workoutExercises.$inferSelect;
export type WorkoutSet = typeof sets.$inferSelect;
export type Routine = typeof routines.$inferSelect;
export type RoutineExercise = typeof routineExercises.$inferSelect;
export type BodyMeasurement = typeof bodyMeasurements.$inferSelect;

export type {
	EquipmentType,
	ExerciseKind,
	Gender,
	MuscleGroup,
	OneRmFormula,
	Theme,
	UnitSystem,
	UserRole
} from '../../constants';
