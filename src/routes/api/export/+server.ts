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

	const payload = {
		format: 'openweights-export',
		version: 1,
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
						isWarmup: set.isWarmup
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
