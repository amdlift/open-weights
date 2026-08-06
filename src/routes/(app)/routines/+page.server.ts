import { fail, redirect } from '@sveltejs/kit';
import { todayIn } from '$lib/dates';
import { createRoutine, deleteRoutine, listRoutines, updateRoutine } from '$lib/server/routines';
import { createWorkoutFromRoutine } from '$lib/server/workouts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => ({
	routines: listRoutines(locals.user!.id)
});

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();

		if (!name) return fail(400, { error: 'Give the routine a name.' });
		if (name.length > 80) return fail(400, { error: 'Keep the name under 80 characters.' });

		const routineId = createRoutine(user.id, {
			name,
			notes: String(form.get('notes') ?? '')
		});
		redirect(303, `/routines/${routineId}`);
	},

	start: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();
		const workoutId = createWorkoutFromRoutine(
			user.id,
			Number(form.get('routineId')),
			todayIn(user.timezone)
		);
		if (workoutId == null) return fail(400, { error: 'That routine no longer exists.' });
		redirect(303, `/workouts/${workoutId}`);
	},

	toggleArchived: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();
		updateRoutine(user.id, Number(form.get('routineId')), {
			isArchived: form.get('isArchived') === 'true'
		});
		return { ok: true };
	},

	delete: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();
		deleteRoutine(user.id, Number(form.get('routineId')));
		return { deleted: true };
	}
};
