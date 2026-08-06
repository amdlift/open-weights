import { MUSCLE_GROUPS, isOneOf, type MuscleGroup } from '$lib/constants';
import { getAllRecords } from '$lib/server/stats';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const user = locals.user!;

	const muscleParam = url.searchParams.get('muscle') ?? 'all';
	const muscle: MuscleGroup | 'all' = isOneOf(MUSCLE_GROUPS, muscleParam)
		? (muscleParam as MuscleGroup)
		: 'all';

	const records = getAllRecords(user.id, user.oneRmFormula);

	return {
		records: muscle === 'all' ? records : records.filter((r) => r.primaryMuscle === muscle),
		totalCount: records.length,
		muscle
	};
};
