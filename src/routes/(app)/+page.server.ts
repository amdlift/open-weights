import { eq } from 'drizzle-orm';
import { MAX_SERIES } from '$lib/components/charts/chart-utils';
import { addDays, startOfWeek, todayIn } from '$lib/dates';
import { getDb } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import {
	getBodyweightSeries,
	getExerciseNames,
	getLatestBodyweight,
	getOneRmSeries,
	getPeriodTotals,
	getWeeklyVolumeByMuscle,
	movingAverage,
	suggestPinnedExercises
} from '$lib/server/stats';
import { listExercises } from '$lib/server/exercises';
import { getActiveUpNext } from '$lib/server/programs';
import { listWorkoutSummaries } from '$lib/server/workouts';
import type { Actions, PageServerLoad } from './$types';

/** How many weeks of volume the dashboard shows. */
const VOLUME_WEEKS = 8;
/** Four series is the point where direct labels become mandatory; see charts/README. */
const MAX_PINNED = 4;

export const load: PageServerLoad = ({ locals }) => {
	const user = locals.user!;
	const today = todayIn(user.timezone);

	const thisWeekStart = startOfWeek(today, user.weekStartsOn);
	const lastWeekStart = addDays(thisWeekStart, -7);

	const weekStarts = Array.from({ length: VOLUME_WEEKS }, (_, i) =>
		addDays(thisWeekStart, -7 * (VOLUME_WEEKS - 1 - i))
	);

	// Fall back to the exercises the user actually trains most, so the chart is
	// useful before anyone has configured anything.
	const pinnedIds = (
		user.pinnedExerciseIds.length > 0
			? user.pinnedExerciseIds
			: suggestPinnedExercises(user.id, MAX_PINNED).map((e) => e.id)
	).slice(0, MAX_PINNED);

	const names = getExerciseNames(pinnedIds);
	const bodyweight = getBodyweightSeries(user.id, { from: addDays(today, -365) });

	return {
		today,
		thisWeek: getPeriodTotals(user.id, thisWeekStart, addDays(thisWeekStart, 6)),
		lastWeek: getPeriodTotals(user.id, lastWeekStart, addDays(lastWeekStart, 6)),
		latestBodyweight: getLatestBodyweight(user.id),
		bodyweight,
		bodyweightTrend: movingAverage(bodyweight, 7),
		weeklyVolume: getWeeklyVolumeByMuscle(user.id, weekStarts),
		oneRm: pinnedIds
			.map((id) => ({
				id,
				label: names.get(id) ?? 'Exercise',
				points: getOneRmSeries(user.id, id, user.oneRmFormula, { from: addDays(today, -365) })
			}))
			.filter((series) => series.points.length > 0),
		pinnedIds,
		isAutoPinned: user.pinnedExerciseIds.length === 0,
		upNext: getActiveUpNext(user.id),
		recentWorkouts: listWorkoutSummaries(user.id, { limit: 5 }),
		// Only loaded lifts can carry a 1RM estimate, so only they are offered.
		pinnableExercises: listExercises(user.id)
			.filter((e) => e.useCount > 0 && (e.kind === 'weight_reps' || e.kind === 'weighted_bodyweight'))
			.map((e) => ({ id: e.id, name: e.name })),
		maxPinned: MAX_PINNED,
		maxSeries: MAX_SERIES
	};
};

export const actions: Actions = {
	pin: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();

		const ids = form
			.getAll('exerciseId')
			.map((value) => Number(value))
			.filter((id) => Number.isInteger(id))
			.slice(0, MAX_PINNED);

		getDb()
			.update(schema.userProfiles)
			.set({ pinnedExerciseIds: ids })
			.where(eq(schema.userProfiles.userId, user.id))
			.run();

		return { pinned: true };
	}
};
