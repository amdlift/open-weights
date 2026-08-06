import { countWorkouts, listWorkoutSummaries } from '$lib/server/workouts';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 20;

export const load: PageServerLoad = ({ locals, url }) => {
	const user = locals.user!;

	const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
	const total = countWorkouts(user.id);

	return {
		workouts: listWorkoutSummaries(user.id, {
			limit: PAGE_SIZE,
			offset: (page - 1) * PAGE_SIZE
		}),
		page,
		pageSize: PAGE_SIZE,
		total,
		pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE))
	};
};
