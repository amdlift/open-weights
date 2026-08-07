import { error } from '@sveltejs/kit';
import { asc, eq, inArray } from 'drizzle-orm';
import { todayIn } from '$lib/dates';
import { getDb } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

/**
 * A complete, self-describing dump of one user's data.
 *
 * Self-hosting is only meaningful if the data can leave, so this includes
 * everything the app stores about the account except credentials and session
 * tokens. Measurements stay in the canonical metric units, with `units` stating
 * so — an export that silently used the viewer's display preference would be
 * ambiguous the moment they switched it.
 */
export const GET: RequestHandler = ({ locals }) => {
	const user = locals.user;
	if (!user) error(401, 'Sign in first.');

	const db = getDb();

	const profile = db
		.select()
		.from(schema.userProfiles)
		.where(eq(schema.userProfiles.userId, user.id))
		.get();

	const customExercises = db
		.select()
		.from(schema.exercises)
		.where(eq(schema.exercises.ownerUserId, user.id))
		.all();

	const workouts = db
		.select()
		.from(schema.workouts)
		.where(eq(schema.workouts.userId, user.id))
		.orderBy(asc(schema.workouts.performedOn), asc(schema.workouts.id))
		.all();

	const workoutIds = workouts.map((w) => w.id);

	const workoutExercises = workoutIds.length
		? db
				.select({
					id: schema.workoutExercises.id,
					workoutId: schema.workoutExercises.workoutId,
					orderIndex: schema.workoutExercises.orderIndex,
					notes: schema.workoutExercises.notes,
					exerciseSlug: schema.exercises.slug,
					exerciseName: schema.exercises.name,
					exerciseKind: schema.exercises.kind,
					isCustomExercise: schema.exercises.ownerUserId
				})
				.from(schema.workoutExercises)
				.innerJoin(
					schema.exercises,
					eq(schema.exercises.id, schema.workoutExercises.exerciseId)
				)
				.where(inArray(schema.workoutExercises.workoutId, workoutIds))
				.orderBy(asc(schema.workoutExercises.orderIndex))
				.all()
		: [];

	const sets = workoutExercises.length
		? db
				.select()
				.from(schema.sets)
				.where(
					inArray(
						schema.sets.workoutExerciseId,
						workoutExercises.map((we) => we.id)
					)
				)
				.orderBy(asc(schema.sets.orderIndex))
				.all()
		: [];

	const routines = db
		.select()
		.from(schema.routines)
		.where(eq(schema.routines.userId, user.id))
		.all();

	const routineExercises = routines.length
		? db
				.select({
					id: schema.routineExercises.id,
					routineId: schema.routineExercises.routineId,
					orderIndex: schema.routineExercises.orderIndex,
					targetSets: schema.routineExercises.targetSets,
					targetRepsMin: schema.routineExercises.targetRepsMin,
					targetRepsMax: schema.routineExercises.targetRepsMax,
					targetRpe: schema.routineExercises.targetRpe,
					targetDistanceM: schema.routineExercises.targetDistanceM,
					targetDurationS: schema.routineExercises.targetDurationS,
					notes: schema.routineExercises.notes,
					exerciseSlug: schema.exercises.slug,
					exerciseName: schema.exercises.name
				})
				.from(schema.routineExercises)
				.innerJoin(
					schema.exercises,
					eq(schema.exercises.id, schema.routineExercises.exerciseId)
				)
				.where(
					inArray(
						schema.routineExercises.routineId,
						routines.map((r) => r.id)
					)
				)
				.orderBy(asc(schema.routineExercises.orderIndex))
				.all()
		: [];

	const programs = db
		.select()
		.from(schema.programs)
		.where(eq(schema.programs.userId, user.id))
		.all();

	const programIds = programs.map((p) => p.id);

	const programDays = programIds.length
		? db
				.select()
				.from(schema.programDays)
				.where(inArray(schema.programDays.programId, programIds))
				.orderBy(asc(schema.programDays.weekNumber), asc(schema.programDays.orderIndex))
				.all()
		: [];

	const programPrescriptions = programDays.length
		? db
				.select({
					programDayId: schema.programDayExercises.programDayId,
					orderIndex: schema.programDayExercises.orderIndex,
					targetSets: schema.programDayExercises.targetSets,
					targetRepsMin: schema.programDayExercises.targetRepsMin,
					targetRepsMax: schema.programDayExercises.targetRepsMax,
					intensityMode: schema.programDayExercises.intensityMode,
					targetRpe: schema.programDayExercises.targetRpe,
					targetPercentOneRm: schema.programDayExercises.targetPercentOneRm,
					targetDistanceM: schema.programDayExercises.targetDistanceM,
					targetDurationS: schema.programDayExercises.targetDurationS,
					notes: schema.programDayExercises.notes,
					exerciseSlug: schema.exercises.slug,
					exerciseName: schema.exercises.name
				})
				.from(schema.programDayExercises)
				.innerJoin(
					schema.exercises,
					eq(schema.exercises.id, schema.programDayExercises.exerciseId)
				)
				.where(
					inArray(
						schema.programDayExercises.programDayId,
						programDays.map((d) => d.id)
					)
				)
				.orderBy(asc(schema.programDayExercises.orderIndex))
				.all()
		: [];

	const enrollments = db
		.select()
		.from(schema.programEnrollments)
		.where(eq(schema.programEnrollments.userId, user.id))
		.orderBy(asc(schema.programEnrollments.startedOn))
		.all();

	const enrollmentOneRms = enrollments.length
		? db
				.select({
					enrollmentId: schema.programOneRms.enrollmentId,
					oneRmKg: schema.programOneRms.oneRmKg,
					isManual: schema.programOneRms.isManual,
					exerciseSlug: schema.exercises.slug,
					exerciseName: schema.exercises.name
				})
				.from(schema.programOneRms)
				.innerJoin(schema.exercises, eq(schema.exercises.id, schema.programOneRms.exerciseId))
				.where(
					inArray(
						schema.programOneRms.enrollmentId,
						enrollments.map((e) => e.id)
					)
				)
				.all()
		: [];

	const measurements = db
		.select()
		.from(schema.bodyMeasurements)
		.where(eq(schema.bodyMeasurements.userId, user.id))
		.orderBy(asc(schema.bodyMeasurements.measuredOn))
		.all();

	const setsByExercise = new Map<number, typeof sets>();
	for (const set of sets) {
		const list = setsByExercise.get(set.workoutExerciseId) ?? [];
		list.push(set);
		setsByExercise.set(set.workoutExerciseId, list);
	}

	const programsById = new Map(programs.map((p) => [p.id, p]));
	const daysById = new Map(programDays.map((d) => [d.id, d]));

	/** A workout's place in a program, by name and position rather than by id. */
	function programOrigin(programDayId: number | null) {
		const day = programDayId == null ? null : daysById.get(programDayId);
		const program = day ? programsById.get(day.programId) : null;
		if (!day || !program) return null;
		return {
			name: program.name,
			weekNumber: day.weekNumber,
			day: day.orderIndex + 1,
			dayTitle: day.title
		};
	}

	const payload = {
		format: 'openweights-export',
		// Bumped from 1: the meaning of an existing field changed. A prescribed
		// set used to export its plan in `reps`, and now exports `reps: null`
		// with the plan beside it in `targetRepsMin`, so anything summing reps
		// would silently under-count against the old shape.
		version: 2,
		exportedAt: new Date().toISOString(),
		units: 'metric — weights in kg, lengths in cm, distances in m, durations in seconds',
		user: {
			username: user.username,
			displayName: user.displayName,
			dateOfBirth: profile?.dateOfBirth ?? null,
			heightCm: profile?.heightCm ?? null,
			gender: profile?.gender ?? null,
			unitSystemPreference: profile?.unitSystem ?? 'metric',
			timezone: profile?.timezone ?? 'UTC'
		},
		customExercises: customExercises.map((e) => ({
			slug: e.slug,
			name: e.name,
			kind: e.kind,
			primaryMuscle: e.primaryMuscle,
			equipment: e.equipment,
			notes: e.notes
		})),
		workouts: workouts.map((workout) => ({
			performedOn: workout.performedOn,
			title: workout.title,
			notes: workout.notes,
			startedAt: workout.startedAt?.toISOString() ?? null,
			endedAt: workout.endedAt?.toISOString() ?? null,
			program: programOrigin(workout.programDayId),
			exercises: workoutExercises
				.filter((we) => we.workoutId === workout.id)
				.map((we) => ({
					exerciseSlug: we.exerciseSlug,
					exerciseName: we.exerciseName,
					kind: we.exerciseKind,
					isCustom: we.isCustomExercise != null,
					notes: we.notes,
					sets: (setsByExercise.get(we.id) ?? []).map((set) => ({
						weightKg: set.weightKg,
						reps: set.reps,
						rpe: set.rpe,
						distanceM: set.distanceM,
						durationS: set.durationS,
						isWarmup: set.isWarmup,
						// What the plan asked for, kept beside what was done.
						targetWeightKg: set.targetWeightKg,
						targetRepsMin: set.targetRepsMin,
						targetRepsMax: set.targetRepsMax,
						targetRpe: set.targetRpe,
						targetPercentOneRm: set.targetPercentOneRm,
						targetDistanceM: set.targetDistanceM,
						targetDurationS: set.targetDurationS
					}))
				}))
		})),
		routines: routines.map((routine) => ({
			name: routine.name,
			notes: routine.notes,
			isArchived: routine.isArchived,
			exercises: routineExercises
				.filter((re) => re.routineId === routine.id)
				.map(({ id: _id, routineId: _routineId, ...rest }) => rest)
		})),
		// Runs nest inside their program: programs have no slug, and inventing
		// one would drag in the permanent-slug machinery for no gain.
		programs: programs.map((program) => ({
			name: program.name,
			notes: program.notes,
			daysPerWeek: program.daysPerWeek,
			isArchived: program.isArchived,
			weeks: [...new Set(programDays.filter((d) => d.programId === program.id).map((d) => d.weekNumber))]
				.sort((a, b) => a - b)
				.map((weekNumber) => ({
					weekNumber,
					days: programDays
						.filter((d) => d.programId === program.id && d.weekNumber === weekNumber)
						.map((day) => ({
							day: day.orderIndex + 1,
							title: day.title,
							notes: day.notes,
							exercises: programPrescriptions
								.filter((p) => p.programDayId === day.id)
								.map(({ programDayId: _programDayId, ...rest }) => rest)
						}))
				})),
			runs: enrollments
				.filter((e) => e.programId === program.id)
				.map((enrollment) => ({
					startedOn: enrollment.startedOn,
					completedOn: enrollment.completedOn,
					notes: enrollment.notes,
					referenceOneRms: enrollmentOneRms
						.filter((r) => r.enrollmentId === enrollment.id)
						.map(({ enrollmentId: _enrollmentId, ...rest }) => rest)
				}))
		})),
		measurements: measurements.map(({ id: _id, userId: _userId, ...rest }) => rest)
	};

	const filename = `openweights-${user.username}-${todayIn(user.timezone)}.json`;

	return new Response(JSON.stringify(payload, null, 2), {
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'content-disposition': `attachment; filename="${filename}"`,
			'cache-control': 'no-store'
		}
	});
};
