import { relations, sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import {
	EQUIPMENT_TYPES,
	EXERCISE_KINDS,
	GENDERS,
	INTENSITY_MODES,
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
		/**
		 * Which program cell this session was started from, or null for freeform
		 * and routine-started work.
		 *
		 * Following a program never constrains logging: this is a label and the
		 * input to "up next", not a constraint. `set null` rather than `cascade`
		 * or `restrict` because the delete dialogs promise that workouts already
		 * started from a plan stay exactly as they are — and they do, since the
		 * sets carry their own copy of what was prescribed. Deleting the program
		 * costs the badge and nothing else, where `restrict` would instead make
		 * any program you had ever run undeletable.
		 *
		 * Caveat worth knowing before you rely on it: drizzle-kit renders SQLite
		 * `ALTER TABLE … ADD COLUMN` without the delete action, so in the
		 * database these two columns are actually NO ACTION and a delete would
		 * raise a constraint error. `unlinkWorkouts` in `$lib/server/programs`
		 * therefore clears the links by hand inside every delete transaction.
		 * This declaration is still the truth of the intent, and if a later
		 * drizzle-kit emits the clause the helper simply becomes redundant.
		 */
		programEnrollmentId: integer('program_enrollment_id').references(
			() => programEnrollments.id,
			{ onDelete: 'set null' }
		),
		programDayId: integer('program_day_id').references(() => programDays.id, {
			onDelete: 'set null'
		}),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`)
	},
	(t) => [
		index('workouts_user_date_idx').on(t.userId, t.performedOn),
		index('workouts_program_idx').on(t.programEnrollmentId, t.programDayId)
	]
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
 *
 * The `target_*` columns are what a plan asked for, kept strictly apart from
 * the measurement columns above, which stay null until the user confirms the
 * set. Keeping them apart is what makes it possible to tell a set that was
 * performed from one that was merely prescribed — and therefore to drop the
 * ones nobody did instead of counting them as work.
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
		isCompleted: integer('is_completed', { mode: 'boolean' }).notNull().default(true),

		// --- what the plan asked for ----------------------------------------
		/**
		 * Only ever a load a percentage resolved to, never one somebody typed.
		 * The routine path leaves this null on purpose: a routine records effort,
		 * not weight, because the load moves as you get stronger. A program can
		 * name a weight because it names a *share of your max*, which is a
		 * different claim.
		 */
		targetWeightKg: real('target_weight_kg'),
		targetRepsMin: integer('target_reps_min'),
		targetRepsMax: integer('target_reps_max'),
		targetRpe: real('target_rpe'),
		/** Kept beside the resolved weight so a row can read "75% · 102.5 kg". */
		targetPercentOneRm: real('target_percent_one_rm'),
		targetDistanceM: real('target_distance_m'),
		targetDurationS: integer('target_duration_s')
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
		/**
		 * How hard the work should feel, 6–10 in half points.
		 *
		 * There is deliberately no target weight: a routine is a plan you reuse
		 * for months, and the load you handle on it moves the whole time. Effort
		 * is the part that stays constant, so that is what the plan records.
		 */
		targetRpe: real('target_rpe'),
		targetDistanceM: real('target_distance_m'),
		targetDurationS: integer('target_duration_s'),
		notes: text('notes')
	},
	(t) => [index('routine_exercises_routine_idx').on(t.routineId, t.orderIndex)]
);

// ---------------------------------------------------------------------------
// Programs (multi-week plans)
// ---------------------------------------------------------------------------

/**
 * A multi-week plan: a grid of weeks by days that the user authors once and
 * then works through a session at a time.
 *
 * Deliberately not a collection of routines. Weeks in a real block are not
 * interchangeable — week 4 is week 1 with heavier singles — so every cell is
 * authored independently, and `duplicateProgramWeek` is what keeps twelve
 * weeks tractable to write. Sharing one routine across four weeks would mean
 * editing week 3 silently rewrote week 1.
 */
export const programs = sqliteTable(
	'programs',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		notes: text('notes'),
		/**
		 * The shape new weeks are created with. Weeks are free to diverge from it
		 * once authored, so this is the author's intent rather than a constraint;
		 * the editor renders as many columns as the widest week actually has.
		 */
		daysPerWeek: integer('days_per_week').notNull().default(3),
		isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`)
	},
	(t) => [index('programs_user_idx').on(t.userId)]
);

/**
 * One authored cell of the grid.
 *
 * Only training days exist. Dates float — a day happens when you next get to
 * the gym, not on a weekday the plan named — so a rest cell would have no date
 * to occupy and nothing to log against, and "up next" would hand you an empty
 * session to finish for no reason. `daysPerWeek` therefore means training days
 * per week.
 */
export const programDays = sqliteTable(
	'program_days',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		programId: integer('program_id')
			.notNull()
			.references(() => programs.id, { onDelete: 'cascade' }),
		/** 1-based, because this is the number the user reads ("Week 4"). */
		weekNumber: integer('week_number').notNull(),
		/** Position within the week, 0-based and dense like every other child. */
		orderIndex: integer('order_index').notNull().default(0),
		/** "Upper A", "Squat day". Becomes the workout title when the day starts. */
		title: text('title'),
		notes: text('notes')
	},
	(t) => [
		// Deliberately not unique. Both the full-renumber reorder and the week
		// shift inside `duplicateProgramWeek` write transiently colliding values
		// within one transaction, which SQLite checks per statement.
		index('program_days_program_idx').on(t.programId, t.weekNumber, t.orderIndex)
	]
);

/**
 * What one exercise of one cell prescribes.
 *
 * Unlike a routine this can carry a load, because an author may say "75% of
 * your max" — but it stores the percentage, never the kilos. The kilos are
 * resolved against the enrolment's snapshotted max when the day is started, so
 * the same program run a year later prescribes heavier weights untouched.
 */
export const programDayExercises = sqliteTable(
	'program_day_exercises',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		programDayId: integer('program_day_id')
			.notNull()
			.references(() => programDays.id, { onDelete: 'cascade' }),
		exerciseId: integer('exercise_id')
			.notNull()
			.references(() => exercises.id, { onDelete: 'restrict' }),
		orderIndex: integer('order_index').notNull().default(0),
		targetSets: integer('target_sets'),
		targetRepsMin: integer('target_reps_min'),
		targetRepsMax: integer('target_reps_max'),
		/**
		 * Which of the two columns below applies. Null for cardio and timed holds,
		 * where neither an RPE nor a percentage means anything. The two are kept
		 * apart rather than folded into one polymorphic value because they have
		 * different domains and different form readers, and because switching the
		 * mode in the editor must not destroy the number you had typed for the
		 * other one.
		 */
		intensityMode: text('intensity_mode', { enum: INTENSITY_MODES }),
		targetRpe: real('target_rpe'),
		/** A percent, not a fraction: `75` means 75%. */
		targetPercentOneRm: real('target_percent_one_rm'),
		targetDistanceM: real('target_distance_m'),
		targetDurationS: integer('target_duration_s'),
		notes: text('notes')
	},
	(t) => [
		index('program_day_exercises_day_idx').on(t.programDayId, t.orderIndex),
		// `restrict` means deleting a custom exercise has to scan this table.
		index('program_day_exercises_exercise_idx').on(t.exerciseId)
	]
);

/**
 * One run of a program. Running it again takes a fresh row and a fresh set of
 * maxes, so "I did this in spring and again in autumn" is two histories.
 *
 * There is no scheduled date per day and no stored cursor: dates float, and
 * progress is derived from which cells already have a finished workout. A
 * cursor would be wrong the moment the user deleted a workout or trained the
 * days out of order.
 */
export const programEnrollments = sqliteTable(
	'program_enrollments',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		/** Denormalised from the program so the ownership guard is one lookup. */
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		programId: integer('program_id')
			.notNull()
			.references(() => programs.id, { onDelete: 'cascade' }),
		/** `YYYY-MM-DD` in the user's timezone. */
		startedOn: text('started_on').notNull(),
		/** Null while the run is live. */
		completedOn: text('completed_on'),
		notes: text('notes'),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`)
	},
	(t) => [index('program_enrollments_user_idx').on(t.userId, t.completedOn)]
);

/**
 * The reference max a percentage resolves against, frozen for one run.
 *
 * This is the only persisted 1RM in the app and a deliberate exception to
 * deriving strength numbers on read. The derived estimate answers "how strong
 * am I today?" and has to stay live; this answers "what did I agree to lift
 * for the next twelve weeks?". A program whose prescribed loads moved every
 * time the user hit a PR — or changed the estimation formula in Settings —
 * would be unusable.
 *
 * Prefilled from the derived estimate at enrolment, then owned by the user.
 */
export const programOneRms = sqliteTable(
	'program_one_rms',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		enrollmentId: integer('enrollment_id')
			.notNull()
			.references(() => programEnrollments.id, { onDelete: 'cascade' }),
		exerciseId: integer('exercise_id')
			.notNull()
			.references(() => exercises.id, { onDelete: 'restrict' }),
		oneRmKg: real('one_rm_kg').notNull(),
		/** True when the user typed a number instead of accepting the estimate. */
		isManual: integer('is_manual', { mode: 'boolean' }).notNull().default(false),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`)
	},
	(t) => [uniqueIndex('program_one_rms_unique').on(t.enrollmentId, t.exerciseId)]
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
	programs: many(programs),
	programEnrollments: many(programEnrollments),
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
	exercises: many(workoutExercises),
	programEnrollment: one(programEnrollments, {
		fields: [workouts.programEnrollmentId],
		references: [programEnrollments.id]
	}),
	programDay: one(programDays, {
		fields: [workouts.programDayId],
		references: [programDays.id]
	})
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

export const programsRelations = relations(programs, ({ one, many }) => ({
	user: one(users, { fields: [programs.userId], references: [users.id] }),
	days: many(programDays),
	enrollments: many(programEnrollments)
}));

export const programDaysRelations = relations(programDays, ({ one, many }) => ({
	program: one(programs, { fields: [programDays.programId], references: [programs.id] }),
	exercises: many(programDayExercises)
}));

export const programDayExercisesRelations = relations(programDayExercises, ({ one }) => ({
	day: one(programDays, {
		fields: [programDayExercises.programDayId],
		references: [programDays.id]
	}),
	exercise: one(exercises, {
		fields: [programDayExercises.exerciseId],
		references: [exercises.id]
	})
}));

export const programEnrollmentsRelations = relations(programEnrollments, ({ one, many }) => ({
	user: one(users, { fields: [programEnrollments.userId], references: [users.id] }),
	program: one(programs, { fields: [programEnrollments.programId], references: [programs.id] }),
	oneRms: many(programOneRms)
}));

export const programOneRmsRelations = relations(programOneRms, ({ one }) => ({
	enrollment: one(programEnrollments, {
		fields: [programOneRms.enrollmentId],
		references: [programEnrollments.id]
	}),
	exercise: one(exercises, { fields: [programOneRms.exerciseId], references: [exercises.id] })
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
export type Program = typeof programs.$inferSelect;
export type ProgramDay = typeof programDays.$inferSelect;
export type ProgramDayExercise = typeof programDayExercises.$inferSelect;
export type ProgramEnrollment = typeof programEnrollments.$inferSelect;
export type ProgramOneRm = typeof programOneRms.$inferSelect;
export type BodyMeasurement = typeof bodyMeasurements.$inferSelect;

export type {
	EquipmentType,
	ExerciseKind,
	Gender,
	IntensityMode,
	MuscleGroup,
	OneRmFormula,
	Theme,
	UnitSystem,
	UserRole
} from '../../constants';
