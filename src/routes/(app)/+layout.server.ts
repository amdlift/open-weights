import { todayIn } from '$lib/dates';
import type { LayoutServerLoad } from './$types';

/**
 * Everything under this group is behind the session guard in hooks.server.ts,
 * so `locals.user` is guaranteed here and pages can rely on it.
 */
export const load: LayoutServerLoad = ({ locals }) => {
	const user = locals.user!;
	return {
		user,
		// Resolved server-side from the user's timezone so "today" is the same day
		// the server writes into `performed_on`.
		today: todayIn(user.timezone)
	};
};
