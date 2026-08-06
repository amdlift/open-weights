import {
	addMonths,
	endOfMonth,
	monthGrid,
	startOfMonth,
	todayIn,
	type IsoDate
} from '$lib/dates';
import { getBodyweightSeries } from '$lib/server/stats';
import { listWorkoutSummaries } from '$lib/server/workouts';
import type { PageServerLoad } from './$types';

const MONTH_PARAM = /^\d{4}-\d{2}$/;

export const load: PageServerLoad = ({ locals, url }) => {
	const user = locals.user!;
	const today = todayIn(user.timezone);

	const requested = url.searchParams.get('month');
	const month: IsoDate =
		requested && MONTH_PARAM.test(requested) ? `${requested}-01` : startOfMonth(today);

	// The grid spills into the neighbouring months, so the query has to cover
	// the whole visible range rather than just this month.
	const days = monthGrid(month, user.weekStartsOn);
	const from = days[0];
	const to = days[days.length - 1];

	const workouts = listWorkoutSummaries(user.id, { from, to });
	const weights = getBodyweightSeries(user.id, { from, to });

	const byDate = new Map<IsoDate, typeof workouts>();
	for (const workout of workouts) {
		const list = byDate.get(workout.performedOn) ?? [];
		list.push(workout);
		byDate.set(workout.performedOn, list);
	}

	return {
		today,
		month,
		monthStart: startOfMonth(month),
		monthEnd: endOfMonth(month),
		previousMonth: addMonths(month, -1).slice(0, 7),
		nextMonth: addMonths(month, 1).slice(0, 7),
		days: days.map((date) => ({
			date,
			inMonth: date.slice(0, 7) === month.slice(0, 7),
			workouts: byDate.get(date) ?? [],
			weightKg: weights.find((w) => w.date === date)?.weightKg ?? null
		})),
		// Also listed below the grid: a month view is unreadable on a phone
		// without a linear fallback.
		monthWorkouts: workouts.filter((w) => w.performedOn.slice(0, 7) === month.slice(0, 7))
	};
};
